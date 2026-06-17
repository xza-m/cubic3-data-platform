"""
结构化日志测试
"""
import json
import logging
import os

import pytest

from app.shared.utils.logger import (
    StructuredFormatter,
    StructuredLogger,
    clear_request_context,
    configure_root_logger,
    get_logger,
    set_request_context,
)


@pytest.fixture(autouse=True)
def clear_context():
    clear_request_context()
    yield
    clear_request_context()


class TestStructuredLogger:
    def test_log_includes_request_context_and_custom_fields(self):
        logger = StructuredLogger("tests.logger", level="INFO")
        set_request_context(request_id="req-1", user_id="user-1")

        captured = {}

        def _fake_info(message, **kwargs):
            captured["message"] = message
            captured["kwargs"] = kwargs

        logger.logger.info = _fake_info
        logger.info("hello", action="sync")

        assert captured["message"] == "hello"
        assert captured["kwargs"]["extra"]["request_id"] == "req-1"
        assert captured["kwargs"]["extra"]["user_id"] == "user-1"
        assert captured["kwargs"]["extra"]["action"] == "sync"
        assert captured["kwargs"]["stacklevel"] == 2

    def test_exception_marks_exc_info(self):
        logger = StructuredLogger("tests.logger.exception", level="INFO")
        calls = {}

        def _fake_log(level, message, **kwargs):
            calls["level"] = level
            calls["message"] = message
            calls["kwargs"] = kwargs

        logger._log = _fake_log
        logger.exception("boom", action="task")

        assert calls["level"] == "ERROR"
        assert calls["message"] == "boom"
        assert calls["kwargs"]["exc_info"] is True
        assert calls["kwargs"]["action"] == "task"

    def test_critical_routes_to_critical_level(self):
        logger = StructuredLogger("tests.logger.critical", level="INFO")
        calls = {}

        def _fake_log(level, message, **kwargs):
            calls["level"] = level
            calls["message"] = message
            calls["kwargs"] = kwargs

        logger._log = _fake_log
        logger.critical("fatal", task="sync")

        assert calls == {"level": "CRITICAL", "message": "fatal", "kwargs": {"task": "sync"}}

    def test_with_context_merges_fields_and_restores_log_method(self):
        logger = StructuredLogger("tests.logger.context", level="INFO")
        original = logger._log
        calls = []

        def _fake_log(level, message, **kwargs):
            calls.append((level, message, kwargs))

        logger._log = _fake_log

        with logger.with_context(request_scope="semantic") as contextual_logger:
            contextual_logger.warning("processing", job="compile")

        assert calls == [("WARNING", "processing", {"request_scope": "semantic", "job": "compile"})]
        assert logger._log is _fake_log
        assert logger._log is not original

    def test_get_logger_returns_structured_logger(self):
        logger = get_logger("tests.logger.getter", level="WARNING")
        assert isinstance(logger, StructuredLogger)
        assert logger.logger.level == logging.WARNING


class TestStructuredFormatter:
    def test_json_formatter_includes_exception_and_extra_fields(self):
        formatter = StructuredFormatter(json_format=True)
        try:
            raise ValueError("bad")
        except ValueError:
            record = logging.getLogger("tests.formatter").makeRecord(
                name="tests.formatter",
                level=logging.ERROR,
                fn=__file__,
                lno=42,
                msg="format failed",
                args=(),
                exc_info=True,
                func="test_json_formatter_includes_exception_and_extra_fields",
                extra={"request_id": "req-1", "dataset_id": 7},
            )
            record.exc_info = __import__("sys").exc_info()

        payload = json.loads(formatter.format(record))
        assert payload["message"] == "format failed"
        assert payload["request_id"] == "req-1"
        assert payload["dataset_id"] == 7
        assert "ValueError: bad" in payload["exception"]

    def test_json_formatter_redacts_sensitive_values_from_message_and_exception(self):
        formatter = StructuredFormatter(json_format=True)
        try:
            raise RuntimeError('params: {"access_key": "dummy_access_key", "project": "demo"}')
        except RuntimeError:
            record = logging.getLogger("tests.formatter.redaction").makeRecord(
                name="tests.formatter.redaction",
                level=logging.ERROR,
                fn=__file__,
                lno=52,
                msg='failed with access_key="dummy_access_key"',
                args=(),
                exc_info=True,
                func="test_json_formatter_redacts_sensitive_values_from_message_and_exception",
            )
            record.exc_info = __import__("sys").exc_info()

        payload = json.loads(formatter.format(record))
        assert "dummy_access_key" not in payload["message"]
        assert "dummy_access_key" not in payload["exception"]
        assert "access_key" in payload["exception"]
        assert "project" in payload["exception"]

    def test_text_formatter_outputs_human_readable_message(self, monkeypatch):
        monkeypatch.setenv("LOG_FORMAT", "text")
        formatter = StructuredFormatter(json_format=False)
        record = logging.getLogger("tests.formatter.text").makeRecord(
            name="tests.formatter.text",
            level=logging.INFO,
            fn=__file__,
            lno=11,
            msg="hello",
            args=(),
            exc_info=None,
            func="test_text_formatter_outputs_human_readable_message",
            extra={"dataset_id": 1},
        )

        output = formatter.format(record)
        assert "[INFO]" in output
        assert "tests.formatter.text" in output
        assert '"dataset_id": 1' in output

    def test_text_formatter_includes_exception_block(self, monkeypatch):
        monkeypatch.setenv("LOG_FORMAT", "text")
        formatter = StructuredFormatter(json_format=False)
        try:
            raise RuntimeError("boom")
        except RuntimeError:
            record = logging.getLogger("tests.formatter.text.exception").makeRecord(
                name="tests.formatter.text.exception",
                level=logging.ERROR,
                fn=__file__,
                lno=99,
                msg="failed",
                args=(),
                exc_info=True,
                func="test_text_formatter_includes_exception_block",
            )
            record.exc_info = __import__("sys").exc_info()

        output = formatter.format(record)
        assert "RuntimeError: boom" in output


class TestRootLoggerConfiguration:
    def test_configure_root_logger_replaces_handlers(self):
        root_logger = logging.getLogger()
        old_handlers = root_logger.handlers[:]
        old_level = root_logger.level
        old_log_format = os.environ.get("LOG_FORMAT")
        try:
            os.environ["LOG_FORMAT"] = "text"
            root_logger.addHandler(logging.NullHandler())
            configure_root_logger(level="ERROR", json_format=False)

            assert root_logger.level == logging.ERROR
            assert len(root_logger.handlers) == 1
            assert isinstance(root_logger.handlers[0].formatter, StructuredFormatter)
            assert root_logger.handlers[0].formatter.json_format is False
        finally:
            if old_log_format is None:
                os.environ.pop("LOG_FORMAT", None)
            else:
                os.environ["LOG_FORMAT"] = old_log_format
            for handler in root_logger.handlers[:]:
                root_logger.removeHandler(handler)
            for handler in old_handlers:
                root_logger.addHandler(handler)
            root_logger.setLevel(old_level)

    def test_configure_root_logger_uses_env_level_when_level_missing(self, monkeypatch):
        root_logger = logging.getLogger()
        old_handlers = root_logger.handlers[:]
        old_level = root_logger.level
        monkeypatch.setenv("LOG_LEVEL", "WARNING")
        monkeypatch.setenv("LOG_FORMAT", "json")
        try:
            configure_root_logger(level=None, json_format=True)
            assert root_logger.level == logging.WARNING
        finally:
            for handler in root_logger.handlers[:]:
                root_logger.removeHandler(handler)
            for handler in old_handlers:
                root_logger.addHandler(handler)
            root_logger.setLevel(old_level)
