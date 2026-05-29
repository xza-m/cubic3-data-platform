from __future__ import annotations

from app.domain.agent_inference_runtime.types import RuntimeProviderConfigUpdate
from app.infrastructure.agent_inference_runtime.sql_runtime_config_repository import (
    SqlRuntimeConfigRepository,
)


def test_runtime_config_round_trip_masks_secret(db_session):
    repo = SqlRuntimeConfigRepository(db_session)

    repo.upsert_provider_config(
        RuntimeProviderConfigUpdate(
            runtime_name="openai_compatible",
            enabled=True,
            endpoint="https://api.openai.com/v1",
            model="gpt-5.1",
            api_key="sk-live-value",
            extra={"organization": "org_123"},
            updated_by="alice",
        )
    )

    saved = repo.get_provider_config("openai_compatible")
    assert saved is not None
    assert saved.enabled is True
    assert saved.endpoint == "https://api.openai.com/v1"
    assert saved.secret_ref == "runtime_provider:openai_compatible:api_key"
    assert saved.to_public_dict()["api_key"] == "********"


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
