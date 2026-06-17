"""AppConfig 的 RLS 执行模式配置校验。"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config_schema import AppConfig


def test_default_rls_mode_is_observe():
    assert AppConfig().rls_enforcement_mode == "observe"


@pytest.mark.parametrize("mode", ["off", "observe", "deny", "enforce", "OBSERVE", " Deny "])
def test_valid_rls_modes_normalized(mode):
    cfg = AppConfig(rls_enforcement_mode=mode)
    assert cfg.rls_enforcement_mode == mode.strip().lower()


def test_invalid_rls_mode_rejected():
    with pytest.raises(ValidationError):
        AppConfig(rls_enforcement_mode="bogus")


def test_to_flask_config_exposes_rls_mode():
    flask_config = AppConfig(rls_enforcement_mode="deny").to_flask_config()
    assert flask_config["RLS_ENFORCEMENT_MODE"] == "deny"
