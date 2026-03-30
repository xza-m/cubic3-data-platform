from flask import Flask, abort
from unittest.mock import MagicMock, patch

import pytest

from app.di.utils import get_app_container
from app.domain.events.base import DomainEvent
from app.extensions import configure_logging
from app.infrastructure.database.session import close_db_session, get_db_engine, get_db_session, init_db_session
from app.infrastructure.llm.base_llm import BaseLLMService
from app.interfaces.api.docs import _get_paths
from app.interfaces.api.middleware.error_handler import register_error_handlers
from app.shared.exceptions import (
    ApplicationException,
    AuthenticationError,
    AuthorizationError,
    DomainException,
    EntityNotFoundError,
    InfrastructureException,
    ValidationError,
)


class _ConcreteLLM(BaseLLMService):
    def chat_completion(self, messages, temperature=0.7, max_tokens=None, **kwargs):
        return super().chat_completion(messages, temperature=temperature, max_tokens=max_tokens, **kwargs)

    def generate_sql(self, question, schema, **kwargs):
        return super().generate_sql(question, schema, **kwargs)


@pytest.fixture
def error_app():
    app = Flask(__name__)
    app.config["TESTING"] = True
    app.config["DEBUG"] = True
    register_error_handlers(app)

    @app.route("/validation")
    def validation():
        raise ValidationError("bad input", details={"field": "name"})

    @app.route("/auth")
    def auth():
        raise AuthenticationError("need login")

    @app.route("/authorization")
    def authorization():
        raise AuthorizationError("forbidden", details={"scope": "admin"})

    @app.route("/not-found")
    def not_found():
        raise EntityNotFoundError("missing")

    @app.route("/domain")
    def domain():
        raise DomainException("domain boom")

    @app.route("/application")
    def application():
        raise ApplicationException("app boom")

    @app.route("/infra")
    def infra():
        raise InfrastructureException("infra boom")

    @app.route("/http")
    def http_error():
        abort(418, description="teapot")

    @app.route("/generic")
    def generic():
        raise RuntimeError("boom")

    return app


class TestErrorHandlers:
    @pytest.mark.parametrize(
        ("path", "status", "message"),
        [
            ("/validation", 400, "bad input"),
            ("/auth", 401, "need login"),
            ("/authorization", 403, "forbidden"),
            ("/not-found", 404, "missing"),
            ("/domain", 400, "domain boom"),
            ("/application", 500, "app boom"),
            ("/infra", 503, "服务暂时不可用，请稍后重试"),
            ("/http", 418, "teapot"),
            ("/generic", 500, "Internal server error"),
        ],
    )
    def test_register_error_handlers_maps_exceptions(self, error_app, path, status, message):
        response = error_app.test_client().get(path)
        payload = response.get_json()

        assert response.status_code == status
        assert payload["message"] == message


class TestDatabaseSessionHelpers:
    def test_get_db_engine_and_session_are_cached(self):
        app = Flask(__name__)
        app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"

        fake_engine = MagicMock()
        fake_scoped = MagicMock()
        fake_scoped.return_value = "db-session"

        with app.app_context():
            with patch("app.infrastructure.database.session.create_engine", return_value=fake_engine) as mock_engine:
                with patch("app.infrastructure.database.session.scoped_session", return_value=fake_scoped) as mock_scoped:
                    assert get_db_engine() is fake_engine
                    assert get_db_engine() is fake_engine
                    assert get_db_session() == "db-session"
                    assert get_db_session() == "db-session"

        mock_engine.assert_called_once()
        mock_scoped.assert_called_once()

    def test_close_db_session_and_init_hook(self):
        app = Flask(__name__)
        fake_scoped = MagicMock()

        with app.app_context():
            from flask import g

            g.db_session = fake_scoped
            close_db_session()
            fake_scoped.close.assert_called_once()
            close_db_session()

        with patch.object(app, "teardown_appcontext") as mock_teardown:
            init_db_session(app)
            mock_teardown.assert_called_once_with(close_db_session)


class TestExtensionsAndDiUtils:
    def test_configure_logging_prefers_structured_logger_and_falls_back(self):
        with patch("app.shared.utils.logger.configure_root_logger") as mock_configure:
            with patch("app.extensions.os.getenv", return_value="json"):
                configure_logging("debug")
                mock_configure.assert_called_once_with(level="debug", json_format=True)

        import builtins

        real_import = builtins.__import__

        def _import(name, *args, **kwargs):
            if name == "app.shared.utils.logger":
                raise ImportError("missing")
            return real_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=_import):
            with patch("app.extensions.logging.basicConfig") as mock_basic_config:
                configure_logging("warning")
                mock_basic_config.assert_called_once()

    def test_get_app_container_prefers_current_app_then_global_container(self):
        app = Flask(__name__)
        app.container = object()

        with app.app_context():
            assert get_app_container() is app.container

        fallback_container = object()
        with patch("app.di.utils.get_container", return_value=fallback_container):
            assert get_app_container() is fallback_container


class TestDomainEventAndBaseLlm:
    def test_domain_event_to_dict_and_from_dict(self):
        event = DomainEvent(aggregate_id=1, user_id="u1", entity_type="dataset", entity_id=2, _event_type="dataset.created")
        payload = event.to_dict()

        assert payload["event_type"] == "dataset.created"
        assert "_event_type" not in payload

        restored = DomainEvent.from_dict(payload)
        assert restored.aggregate_id == 1
        assert restored.event_type == "DomainEvent"

    def test_base_llm_abstract_method_bodies_and_docs_helper(self):
        service = _ConcreteLLM()
        assert service.chat_completion([]) is None
        assert service.generate_sql("question", {}) is None
        assert "/api/v1/data-center/datasources" in _get_paths()
