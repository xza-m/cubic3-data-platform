from datetime import datetime
import importlib
import sys
from types import ModuleType
from unittest.mock import MagicMock, patch

from app.application.feishu.handlers.chat_handlers import ListChatsHandler, UpdateChatHandler, _chat_to_dict
from app.infrastructure.queue import clear_queue, get_all_queues, get_queue, get_redis_connection
import app.infrastructure.queue as queue_module
from app.infrastructure.scheduler import (
    execute_platform_datasource_catalog_sync,
    init_jobs,
    register_platform_datasource_catalog_sync_job,
    register_query_export_cleanup_job,
)
from app.interfaces.api.docs import _get_schemas, index, openapi_spec, redoc_ui, swagger_ui


class TestFeishuChatHandlers:
    def test_chat_to_dict_and_list_handlers(self):
        chat = MagicMock(
            chat_id="chat-1",
            chat_name="日报群",
            active=True,
            last_seen_at=datetime(2026, 3, 25, 12, 0, 0),
            added_via="manual",
        )
        assert _chat_to_dict(chat)["last_seen_at"] == "2026-03-25T12:00:00"

        repo = MagicMock(find_active=MagicMock(return_value=[chat]), find_all=MagicMock(return_value=[chat]))
        assert ListChatsHandler(repo).handle(active_only=True)[0]["chat_id"] == "chat-1"
        assert ListChatsHandler(repo).handle(active_only=False)[0]["chat_name"] == "日报群"

    def test_update_chat_handler_returns_none_or_payload(self):
        repo = MagicMock(update_active=MagicMock(side_effect=[None, MagicMock(
            chat_id="chat-1",
            chat_name="日报群",
            active=False,
            last_seen_at=None,
            added_via="manual",
        )]))
        handler = UpdateChatHandler(repo)

        assert handler.handle("chat-1", True) is None
        assert handler.handle("chat-1", False)["active"] is False


class TestQueueHelpers:
    def test_queue_helpers_cover_singleton_and_management(self):
        fake_redis = MagicMock()
        fake_queue = MagicMock()
        fake_queue.__len__.return_value = 3
        queue_module._redis_connection = None

        with patch("app.infrastructure.queue.Redis.from_url", return_value=fake_redis) as mock_from_url:
            with patch("app.infrastructure.queue.Queue", return_value=fake_queue) as mock_queue:
                assert get_redis_connection() is fake_redis
                assert get_redis_connection() is fake_redis
                assert get_queue("critical") is fake_queue
                mock_queue.assert_called_once_with("critical", connection=fake_redis)
                assert clear_queue("critical") == 3
                fake_queue.empty.assert_called_once()
            with patch("rq.Queue.all", return_value=["default", "critical"]) as mock_all:
                assert get_all_queues() == ["default", "critical"]
                mock_all.assert_called_once_with(connection=fake_redis)
        mock_from_url.assert_called_once()


class TestScheduler:
    def test_platform_catalog_sync_helpers_cover_enqueue_and_registration(self):
        active_pg = MagicMock(id=1, is_active=True, source_type="postgresql")
        active_mc = MagicMock(id=2, is_active=True, source_type="maxcompute")
        inactive = MagicMock(id=3, is_active=False, source_type="postgresql")
        unsupported = MagicMock(id=4, is_active=True, source_type="mysql")
        fake_repo = MagicMock(find_all=MagicMock(return_value=[active_pg, active_mc, inactive, unsupported]))
        fake_queue = MagicMock()
        fake_container = MagicMock(
            datasource_repository=MagicMock(return_value=fake_repo),
            task_queue=MagicMock(return_value=fake_queue),
        )
        fake_scheduler = MagicMock()

        with patch("app.di.container.get_container", return_value=fake_container):
            execute_platform_datasource_catalog_sync()

        assert fake_queue.enqueue.call_count == 2
        assert fake_queue.enqueue.call_args_list[0].args[1] == 1
        assert fake_queue.enqueue.call_args_list[1].args[1] == 2

        with patch("app.infrastructure.scheduler.scheduler", fake_scheduler):
            register_platform_datasource_catalog_sync_job()
            fake_scheduler.add_job.assert_called_once()

    def test_init_jobs_success_and_failure_paths(self):
        fake_scheduler = MagicMock()
        fake_service = MagicMock()
        fake_container = MagicMock(scheduler_service=MagicMock(return_value=fake_service))

        with patch("app.infrastructure.scheduler.scheduler", fake_scheduler):
            with patch("app.di.container.get_container", return_value=fake_container):
                init_jobs()
                fake_scheduler.start.assert_called_once()
                assert fake_scheduler.add_job.call_count == 2
                job_ids = {call.kwargs["id"] for call in fake_scheduler.add_job.call_args_list}
                assert job_ids == {"platform_datasource_catalog_sync", "query_export_cleanup"}
                fake_service.reload_all_schedules.assert_called_once()

        with patch("app.infrastructure.scheduler.scheduler", fake_scheduler):
            with patch("app.di.container.get_container", side_effect=RuntimeError("boom")):
                init_jobs()

    def test_scheduler_callbacks_keep_app_context(self, app):
        fake_scheduler = MagicMock()

        with patch("app.infrastructure.scheduler.scheduler", fake_scheduler):
            with app.app_context():
                register_query_export_cleanup_job()

        job_func = fake_scheduler.add_job.call_args.kwargs["func"]
        def _assert_context_then_stop():
            from flask import has_app_context

            assert has_app_context()
            raise RuntimeError("stop after context check")

        with patch(
            "app.infrastructure.tasks.jobs.query_export_cleanup_job.get_db_session",
            side_effect=_assert_context_then_stop,
        ):
            try:
                job_func()
            except RuntimeError as exc:
                assert str(exc) == "stop after context check"


class TestOpenApiConfigAndDocs:
    def _load_openapi_module(self):
        fake_module = ModuleType("flask_openapi3")

        class _Base:
            def __init__(self, **kwargs):
                for key, value in kwargs.items():
                    setattr(self, key, value)

        fake_module.Info = _Base
        fake_module.Tag = _Base
        fake_module.Server = _Base
        sys.modules["flask_openapi3"] = fake_module
        return importlib.import_module("app.interfaces.api.openapi_config")

    def test_openapi_config_models_and_metadata(self):
        module = self._load_openapi_module()

        assert module.info.title == "CUBIC3 API"
        assert len(module.tags) >= 5
        assert len(module.servers) == 2
        assert "bearerAuth" in module.security_schemes

        pagination = module.PaginationMeta(page=1, page_size=20, total=5, total_pages=1)
        response = module.PaginatedResponse(items=[{"id": 1}], pagination=pagination)
        assert module.ApiResponse(data={"ok": True}).code == 0
        assert response.pagination.total == 5
        assert module.ErrorResponse(code=500, message="boom").message == "boom"

    def test_docs_views_and_openapi_spec(self, app):
        self._load_openapi_module()
        with app.app_context():
            with patch("app.interfaces.api.docs.render_template_string", return_value="html") as mock_render:
                assert index() == "html"
                assert swagger_ui() == "html"
                assert redoc_ui() == "html"
                assert mock_render.call_count == 3

            with patch("app.interfaces.api.route_scanner.scan_routes_to_openapi", return_value={"/health": {"get": {}}}):
                response, status = openapi_spec()
                payload = response.get_json()

        assert status == 200
        assert payload["openapi"] == "3.0.3"
        assert payload["paths"] == {"/health": {"get": {}}}
        schemas = _get_schemas()
        assert "ApiResponse" in schemas
        assert "ErrorResponse" in schemas
