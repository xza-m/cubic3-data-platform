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


def test_runtime_config_repository_rejects_inline_api_key_without_secret_store(db_session):
    repo = SqlRuntimeConfigRepository(db_session)

    with pytest.raises(ValueError, match="secret store is not configured"):
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
        runtime_name="codex_app_server",
        action="start",
        principal_id="alice",
        status="accepted",
        metadata={"profile": "local-codex-app-server"},
    )

    assert audit.runtime_name == "codex_app_server"
    assert audit.action == "start"
    assert audit.status == "accepted"
