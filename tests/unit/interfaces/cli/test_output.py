"""in-process CLI 输出契约纯函数单测。"""
from __future__ import annotations

import pytest

from app.interfaces.cli.output import (
    EXIT_NOT_FOUND,
    EXIT_NOT_READY,
    envelope,
    err_envelope,
    parse_optional_bool,
)


class TestParseOptionalBool:
    def test_none_stays_none(self):
        assert parse_optional_bool(None) is None

    @pytest.mark.parametrize("value", ["true", "TRUE", "1", "yes", "y"])
    def test_truthy(self, value):
        assert parse_optional_bool(value) is True

    @pytest.mark.parametrize("value", ["false", "False", "0", "no", "n"])
    def test_falsy(self, value):
        assert parse_optional_bool(value) is False

    def test_invalid_raises(self):
        with pytest.raises(ValueError):
            parse_optional_bool("maybe")


class TestEnvelope:
    def test_success_shape(self):
        assert envelope({"a": 1}) == {"code": 0, "message": "success", "data": {"a": 1}, "trace_id": None}

    def test_success_custom_message(self):
        assert envelope(None, message="ok")["message"] == "ok"

    def test_error_shape(self):
        e = err_envelope("boom")
        assert e == {"code": -1, "message": "boom", "trace_id": None}

    def test_error_with_details(self):
        e = err_envelope("boom", details={"k": 1})
        assert e["code"] == -1 and e["details"] == {"k": 1} and e["trace_id"] is None


def test_exit_codes_are_distinct():
    assert EXIT_NOT_FOUND == 4
    assert EXIT_NOT_READY == 5
