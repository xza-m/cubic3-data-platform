from __future__ import annotations

import pytest

from app.domain.agent_inference_runtime.types import RuntimeProviderConfigUpdate
from app.infrastructure.agent_inference_runtime.sql_runtime_config_repository import (
    SqlRuntimeConfigRepository,
)


def test_runtime_config_round_trip_uses_env_secret_reference_only(db_session):
    repo = SqlRuntimeConfigRepository(db_session)

    repo.upsert_provider_config(
        RuntimeProviderConfigUpdate(
            runtime_name="openai_compatible",
            enabled=True,
            endpoint="https://api.openai.com/v1",
            model="gpt-5.1",
            api_key=None,
            extra={"organization": "org_123"},
            updated_by="alice",
        )
    )

    saved = repo.get_provider_config("openai_compatible")
    assert saved is not None
    assert saved.enabled is True
    assert saved.endpoint == "https://api.openai.com/v1"
    assert saved.secret_ref is None
    assert saved.to_public_dict()["api_key"] is None


def test_runtime_config_repository_encrypts_inline_api_key_into_secret_store(db_session, monkeypatch):
    from cryptography.fernet import Fernet

    monkeypatch.setenv("AI_SECRET_KEY", Fernet.generate_key().decode("ascii"))
    repo = SqlRuntimeConfigRepository(db_session)

    repo.upsert_provider_config(
        RuntimeProviderConfigUpdate(
            runtime_name="openai_compatible",
            enabled=True,
            endpoint="https://api.openai.com/v1",
            model="gpt-5.1",
            api_key="sk-live-value",
            extra={},
            updated_by="alice",
        )
    )

    saved = repo.get_provider_config("openai_compatible")
    assert saved.secret_ref == "db"
    assert saved.secret_ciphertext and saved.secret_ciphertext != "sk-live-value"
    assert saved.to_public_dict()["api_key"] == "********"


def test_runtime_config_repository_preserves_secret_when_api_key_omitted(db_session, monkeypatch):
    from cryptography.fernet import Fernet

    monkeypatch.setenv("AI_SECRET_KEY", Fernet.generate_key().decode("ascii"))
    repo = SqlRuntimeConfigRepository(db_session)
    repo.upsert_provider_config(
        RuntimeProviderConfigUpdate(
            runtime_name="openai_compatible",
            enabled=True,
            endpoint="e1",
            model="m1",
            api_key="sk-keep",
            extra={},
            updated_by="alice",
        )
    )

    # 二次更新不带 api_key(None)→ 保留已存密钥，只改其它字段
    repo.upsert_provider_config(
        RuntimeProviderConfigUpdate(
            runtime_name="openai_compatible",
            enabled=True,
            endpoint="e2",
            model="m2",
            api_key=None,
            extra={},
            updated_by="bob",
        )
    )

    saved = repo.get_provider_config("openai_compatible")
    assert saved.secret_ref == "db"
    assert saved.secret_ciphertext
    assert saved.endpoint == "e2"


def test_runtime_config_public_output_masks_sensitive_extra_keys(db_session):
    repo = SqlRuntimeConfigRepository(db_session)

    repo.upsert_provider_config(
        RuntimeProviderConfigUpdate(
            runtime_name="openai_compatible",
            enabled=True,
            endpoint="https://api.openai.com/v1",
            model="gpt-5.1",
            api_key=None,
            extra={
                "organization": "org_123",
                "nested": {
                    "accessToken": "token-value",
                    "safe": "visible",
                },
                "credentials": [{"password": "secret-value"}],
                "metadata": [{"password": "secret-value"}],
            },
            updated_by="alice",
        )
    )

    saved = repo.get_provider_config("openai_compatible")
    assert saved is not None
    public_extra = saved.to_public_dict()["extra"]
    assert public_extra["organization"] == "org_123"
    assert public_extra["nested"]["accessToken"] == "********"
    assert public_extra["nested"]["safe"] == "visible"
    assert public_extra["credentials"] == "********"
    assert public_extra["metadata"][0]["password"] == "********"


def test_runtime_audit_log_records_management_action(db_session):
    repo = SqlRuntimeConfigRepository(db_session)

    audit = repo.record_audit_event(
        runtime_name="codex_sdk",
        action="test",
        principal_id="alice",
        status="accepted",
        metadata={"provider": "codex-sdk"},
    )

    assert audit.runtime_name == "codex_sdk"
    assert audit.action == "test"
    assert audit.status == "accepted"


def test_runtime_config_repository_returns_latest_audit_event_by_action(db_session):
    repo = SqlRuntimeConfigRepository(db_session)

    repo.record_audit_event(
        runtime_name="codex_sdk",
        action="start",
        principal_id="alice",
        status="failed",
        metadata={"provider_status": "unavailable"},
    )
    repo.record_audit_event(
        runtime_name="codex_sdk",
        action="test",
        principal_id="alice",
        status="succeeded",
        metadata={"provider_status": "ready"},
    )
    latest = repo.record_audit_event(
        runtime_name="codex_sdk",
        action="test",
        principal_id="alice",
        status="succeeded",
        metadata={"provider_status": "ready", "health_status": "ready"},
    )

    assert repo.get_latest_audit_event("codex_sdk", action="test") == latest
