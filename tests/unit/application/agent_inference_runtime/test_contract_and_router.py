from __future__ import annotations

from dataclasses import replace

import pytest

from app.application.agent_inference_runtime.errors import AgentInferenceRuntimeError
from app.application.agent_inference_runtime.action_binding import (
    ActionRuntimeBindingRegistry,
)
from app.application.agent_inference_runtime.errors import RuntimeProviderOperationError
from app.application.agent_inference_runtime.management import (
    AgentRuntimeManagementService,
)
from app.application.agent_inference_runtime.runtime_config_service import RuntimeConfigService
from app.application.agent_inference_runtime.router import AgentInferenceRuntimeRouter
from app.application.agent_inference_runtime.service import AgentInferenceRuntimeService
from app.domain.agent_inference_runtime.types import (
    RuntimeManagementAuditEvent,
    RuntimeProviderConfigSnapshot,
)
from app.domain.agent_inference_runtime.ports import AgentInferenceRuntimePort
from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    AgentInferenceRuntimeResult,
    RuntimeContextRef,
    RuntimePolicy,
)
from app.infrastructure.agent_inference_runtime.codex_client import CodexSdkClientError


class _FakeAdapter(AgentInferenceRuntimePort):
    runtime_name = "fake"

    def __init__(self):
        self.requests = []

    def can_handle(self, request: AgentInferenceRuntimeRequest) -> bool:
        return request.preferred_runtime in {None, self.runtime_name}

    def invoke(self, request: AgentInferenceRuntimeRequest) -> AgentInferenceRuntimeResult:
        self.requests.append(request)
        return AgentInferenceRuntimeResult(
            run_id="run_fake_1",
            status="succeeded",
            runtime_name=self.runtime_name,
            action=request.action,
            structured_output={
                "message": "已生成候选建议",
                "workbench_state_patch": {"agent_message": "已生成候选建议"},
                "proposal_patch": {"source_mode": "agent_led"},
            },
            artifacts=[],
            usage={"total_tokens": 0},
            trace=[{"event_type": "run.succeeded", "seq": 1}],
            error=None,
        )


class _AuditRecorder:
    def __init__(self, codex_config=None):
        self.events = []
        self.codex_config = codex_config or {"enabled": True}

    def record_audit_event(self, **kwargs):
        self.events.append(kwargs)

    def management_config(self, runtime_name):
        if runtime_name == "openai_compatible":
            return {
                "enabled": True,
                "api_key": "sk-test",
                "api_base": "https://api.openai.test/v1",
                "model": "gpt-5.1",
            }
        return self.codex_config


class _ConfigRepository:
    def __init__(self, snapshot):
        self.snapshot = snapshot
        self.audit_events = []

    def get_provider_config(self, runtime_name):
        return self.snapshot if runtime_name == self.snapshot.runtime_name else None

    def record_audit_event(self, **kwargs):
        event = RuntimeManagementAuditEvent(
            id=len(self.audit_events) + 1,
            runtime_name=kwargs["runtime_name"],
            action=kwargs["action"],
            principal_id=kwargs.get("principal_id"),
            status=kwargs["status"],
            metadata=kwargs["metadata"],
            created_at=None,
        )
        self.audit_events.append(event)
        return event

    def get_latest_audit_event(self, runtime_name, *, action=None):
        for event in reversed(self.audit_events):
            if event.runtime_name == runtime_name and (action is None or event.action == action):
                return event
        return None


class _SdkClient:
    def __init__(self, *, fail: bool = False):
        self.fail = fail
        self.healthchecked = 0
        self.capability_calls = 0

    def healthcheck(self):
        self.healthchecked += 1
        if self.fail:
            raise CodexSdkClientError(
                "sdk unavailable",
                code="RUNTIME_PROVIDER_ERROR",
                details={"provider": "codex-sdk"},
            )
        return {"status": "ready", "provider": "codex-sdk", "transport": "sdk"}

    def capabilities(self):
        self.capability_calls += 1
        if self.fail:
            raise CodexSdkClientError(
                "sdk unavailable",
                code="RUNTIME_PROVIDER_ERROR",
                details={"provider": "codex-sdk"},
            )
        return {
            "transport": "sdk",
            "provider": "codex-sdk",
            "actions": ["semantic.modeling.review_proposal"],
            "artifacts": ["codex_final_response"],
            "events": ["run.succeeded"],
        }


def _request(action: str = "semantic.modeling.chat") -> AgentInferenceRuntimeRequest:
    return AgentInferenceRuntimeRequest(
        app_id="semantic_modeling",
        action=action,
        runtime_context_ref=RuntimeContextRef(
            project_id="cubic3-data-platform",
            session_id="session_1",
            thread_id="thread_1",
            turn_id="turn_1",
        ),
        principal_id="alice",
        input={"message": "查询学生评论数"},
        context_pack={"session": {"id": "session_1"}},
        output_schema="semantic.modeling.chat.output.v1",
        runtime_policy=RuntimePolicy(max_runtime_seconds=60),
        preferred_runtime=None,
        execution_mode="sync",
        semantic_runtime_pin=None,
        asset_revision_refs=[],
    )


def test_service_routes_request_to_fake_runtime_and_returns_trace():
    adapter = _FakeAdapter()
    adapter.runtime_name = "openai_compatible"
    router = AgentInferenceRuntimeRouter(adapters=[adapter])
    service = AgentInferenceRuntimeService(router=router)
    request = replace(_request(), preferred_runtime="openai_compatible")

    result = service.invoke(request)

    assert result.status == "succeeded"
    assert result.runtime_name == "openai_compatible"
    assert result.structured_output["message"] == "已生成候选建议"
    assert adapter.requests[0].runtime_context_ref.session_id == "session_1"


def test_router_rejects_unknown_runtime_without_silent_fallback():
    adapter = _FakeAdapter()
    router = AgentInferenceRuntimeRouter(adapters=[adapter])
    request = replace(_request(), preferred_runtime="unknown_runtime")

    with pytest.raises(AgentInferenceRuntimeError, match="not allowed") as exc_info:
        router.select(request)

    assert exc_info.value.code == "RUNTIME_NOT_ALLOWED_FOR_ACTION"
    assert exc_info.value.details == {
        "action": "semantic.modeling.chat",
        "runtime_name": "unknown_runtime",
        "allowed_runtimes": ["openai_compatible"],
    }


def test_router_rejects_missing_default_runtime_without_fallback():
    adapter = _FakeAdapter()
    router = AgentInferenceRuntimeRouter(adapters=[adapter])

    with pytest.raises(AgentInferenceRuntimeError, match="no runtime adapter") as exc_info:
        router.select(_request("semantic.modeling.chat"))

    assert exc_info.value.code == "RUNTIME_ADAPTER_NOT_FOUND"
    assert exc_info.value.details == {
        "action": "semantic.modeling.chat",
        "runtime_name": "openai_compatible",
    }


def test_router_defaults_review_action_to_codex_when_adapter_exists():
    codex = _FakeAdapter()
    codex.runtime_name = "codex_sdk"
    openai = _FakeAdapter()
    openai.runtime_name = "openai_compatible"
    router = AgentInferenceRuntimeRouter(adapters=[openai, codex])

    selected = router.select(_request("semantic.modeling.review_proposal"))

    assert selected.runtime_name == "codex_sdk"


def test_router_defaults_preview_action_to_openai_not_codex():
    codex = _FakeAdapter()
    codex.runtime_name = "codex_sdk"
    openai = _FakeAdapter()
    openai.runtime_name = "openai_compatible"
    router = AgentInferenceRuntimeRouter(adapters=[codex, openai])

    selected = router.select(_request("semantic.modeling.preview_candidate"))

    assert selected.runtime_name == "openai_compatible"


def test_action_binding_registry_keeps_fixed_openai_action_without_selector():
    registry = ActionRuntimeBindingRegistry()

    binding = registry.resolve("semantic.modeling.generate_candidates")

    assert binding.default_runtime == "openai_compatible"
    assert binding.allowed_runtimes == ["openai_compatible"]
    assert binding.expose_selector is False
    assert binding.reason == "fixed_openai_low_latency"


def test_action_binding_registry_registers_data_asset_field_semantics_as_openai_consumer():
    registry = ActionRuntimeBindingRegistry()

    binding = registry.resolve("asset.field.infer_semantics")

    assert binding.default_runtime == "openai_compatible"
    assert binding.allowed_runtimes == ["openai_compatible"]
    assert binding.expose_selector is False
    assert binding.requires_connection is False
    assert binding.reason == "asset_field_semantics_low_latency"
    assert any(item.action == "asset.field.infer_semantics" for item in registry.visible_bindings())


def test_action_binding_registry_marks_codex_review_as_fixed_runtime():
    registry = ActionRuntimeBindingRegistry()

    binding = registry.resolve("semantic.modeling.review_proposal")

    assert binding.default_runtime == "codex_sdk"
    assert binding.allowed_runtimes == ["codex_sdk"]
    assert binding.expose_selector is False
    assert binding.requires_connection is True


def test_action_binding_registry_allows_selector_only_for_expert_debug():
    registry = ActionRuntimeBindingRegistry()

    binding = registry.resolve("semantic.modeling.expert_debug")

    assert binding.default_runtime == "openai_compatible"
    assert binding.allowed_runtimes == ["openai_compatible", "codex_sdk"]
    assert binding.expose_selector is True
    assert binding.reason == "expert_runtime_choice"


def test_router_rejects_preferred_runtime_when_action_is_fixed_openai():
    codex = _FakeAdapter()
    codex.runtime_name = "codex_sdk"
    openai = _FakeAdapter()
    openai.runtime_name = "openai_compatible"
    router = AgentInferenceRuntimeRouter(
        adapters=[openai, codex],
        action_bindings=ActionRuntimeBindingRegistry(),
    )
    request = replace(
        _request("semantic.modeling.generate_candidates"),
        preferred_runtime="codex_sdk",
    )

    with pytest.raises(AgentInferenceRuntimeError) as exc_info:
        router.select(request)

    assert exc_info.value.code == "RUNTIME_NOT_ALLOWED_FOR_ACTION"
    assert exc_info.value.details == {
        "action": "semantic.modeling.generate_candidates",
        "runtime_name": "codex_sdk",
        "allowed_runtimes": ["openai_compatible"],
    }


def test_runtime_management_snapshot_exposes_provider_status_and_action_policy():
    service = AgentRuntimeManagementService(
        openai_config={
            "api_key": "sk-test",
            "api_base": "https://api.openai.test/v1",
            "model": "gpt-4o-mini",
        },
        codex_config={"enabled": False, "ui_managed": False},
    )

    snapshot = service.snapshot()

    assert snapshot.providers[0].runtime_name == "openai_compatible"
    assert snapshot.providers[0].status == "ready"
    assert snapshot.providers[1].runtime_name == "codex_sdk"
    assert snapshot.providers[1].status == "disabled"
    assert snapshot.action_bindings[0].expose_selector is False


def test_runtime_management_exposes_codex_sdk_without_lifecycle_operations():
    service = AgentRuntimeManagementService(
        openai_config={"api_key": "", "model": ""},
        codex_config={
            "enabled": True,
            "ui_managed": True,
            "project_id": "cubic3-data-platform",
            "project_root": "/repo/project",
        },
    )

    status = service.provider_status("codex_sdk")

    assert status.configured is True
    assert status.available is False
    assert status.status == "not_verified"
    assert status.operations == [
        "test_connection",
        "capabilities",
    ]
    assert status.label == "Codex SDK"
    assert status.details["provider"] == "codex-sdk"


def test_runtime_management_rejects_codex_sdk_start_and_audits_failure():
    audit = _AuditRecorder()
    service = AgentRuntimeManagementService(
        openai_config={"api_key": "", "model": ""},
        codex_config={"enabled": True},
        runtime_config_service=audit,
    )

    with pytest.raises(RuntimeProviderOperationError, match="Codex SDK provider 不支持前端启停"):
        service.start_provider("codex_sdk", principal_id="alice")

    assert audit.events == [
        {
            "runtime_name": "codex_sdk",
            "action": "start",
            "principal_id": "alice",
            "status": "failed",
            "metadata": {"error": "Codex SDK provider 不支持前端启停。"},
        }
    ]


def test_runtime_management_blocks_db_disabled_codex_start_and_audits_failure():
    repository = _ConfigRepository(
        RuntimeProviderConfigSnapshot(
            runtime_name="codex_sdk",
            enabled=False,
            endpoint="http://127.0.0.1:8799",
            model=None,
            secret_ref=None,
            extra={},
            updated_by="alice",
            updated_at=None,
        )
    )
    config_service = RuntimeConfigService(
        repository=repository,
        openai_config={"api_key": "", "api_base": "", "model": ""},
        codex_config={
            "enabled": True,
            "ui_managed": True,
            "endpoint": "http://127.0.0.1:8799",
        },
    )
    service = AgentRuntimeManagementService(
        openai_config={"api_key": "", "api_base": "", "model": ""},
        codex_config={
            "enabled": True,
            "ui_managed": True,
            "endpoint": "http://127.0.0.1:8799",
        },
        runtime_config_service=config_service,
    )

    with pytest.raises(RuntimeProviderOperationError, match="Codex SDK 未启用") as exc_info:
        service.start_provider("codex_sdk", principal_id="alice")

    assert exc_info.value.code == "RUNTIME_PROVIDER_DISABLED"
    assert repository.audit_events[0].runtime_name == "codex_sdk"
    assert repository.audit_events[0].action == "start"
    assert repository.audit_events[0].principal_id == "alice"
    assert repository.audit_events[0].status == "failed"
    assert repository.audit_events[0].metadata == {"error": "Codex SDK 未启用。"}


def test_runtime_config_service_keeps_codex_project_paths_env_bound():
    repository = _ConfigRepository(
        RuntimeProviderConfigSnapshot(
            runtime_name="codex_sdk",
            enabled=True,
            endpoint=None,
            model=None,
            secret_ref=None,
            extra={
                "project_root": "/repo/from-db",
                "runtime_root": "/tmp/from-db",
                "runtime_workspace_roots": ["/repo/from-db", "/repo/shared"],
                "timeout_seconds": 17,
                "sandbox": "workspace-write",
            },
            updated_by="alice",
            updated_at=None,
        )
    )
    service = RuntimeConfigService(
        repository=repository,
        openai_config={"api_key": "", "api_base": "", "model": ""},
        codex_config={
            "enabled": True,
            "project_root": "/repo/from-env",
            "runtime_root": "/tmp/from-env",
            "sandbox": "read-only",
        },
    )

    config = service.management_config("codex_sdk")

    assert config["project_root"] == "/repo/from-env"
    assert config["runtime_root"] == "/tmp/from-env"
    assert "runtime_workspace_roots" not in config
    assert config["timeout_seconds"] == 17
    assert config["sandbox"] == "workspace-write"
    assert "project_root" not in config["provider_extra"]
    assert "runtime_root" not in config["provider_extra"]
    assert "runtime_workspace_roots" not in config["provider_extra"]


def test_runtime_management_start_does_not_spawn_process_manager_for_sdk():
    repository = _ConfigRepository(
        RuntimeProviderConfigSnapshot(
            runtime_name="codex_sdk",
            enabled=True,
            endpoint=None,
            model=None,
            secret_ref=None,
            extra={"project_root": "/repo/from-db"},
            updated_by="alice",
            updated_at=None,
        )
    )
    config_service = RuntimeConfigService(
        repository=repository,
        openai_config={"api_key": "", "api_base": "", "model": ""},
        codex_config={
            "enabled": True,
            "ui_managed": True,
            "project_root": "/repo/from-env",
        },
    )

    service = AgentRuntimeManagementService(
        openai_config={"api_key": "", "api_base": "", "model": ""},
        codex_config={
            "enabled": True,
            "ui_managed": True,
            "project_root": "/repo/from-env",
        },
        runtime_config_service=config_service,
    )

    with pytest.raises(RuntimeProviderOperationError, match="不支持前端启停"):
        service.start_provider("codex_sdk", principal_id="alice")


def test_runtime_management_test_provider_audit_uses_succeeded_status_with_provider_status_metadata():
    audit = _AuditRecorder()
    service = AgentRuntimeManagementService(
        openai_config={
            "api_key": "sk-test",
            "api_base": "https://api.openai.test/v1",
            "model": "gpt-5.1",
        },
        codex_config={"enabled": False},
        runtime_config_service=audit,
    )

    result = service.test_provider("openai_compatible", principal_id="alice")

    assert result.status == "ready"
    assert audit.events == [
        {
            "runtime_name": "openai_compatible",
            "action": "test",
            "principal_id": "alice",
            "status": "succeeded",
            "metadata": {
                "provider_status": "ready",
                "available": True,
                "configured": True,
            },
        }
    ]


def test_runtime_management_codex_sdk_tests_connection_with_sdk_client():
    sdk_client = _SdkClient()
    audit = _AuditRecorder(
        {
            "enabled": True,
            "project_root": "/repo/project",
        }
    )
    service = AgentRuntimeManagementService(
        openai_config={"api_key": "", "model": ""},
        codex_config={
            "enabled": True,
            "project_root": "/repo/project",
        },
        runtime_config_service=audit,
        codex_client_factory=lambda _config: sdk_client,
    )

    result = service.test_provider("codex_sdk", principal_id="alice")

    assert sdk_client.healthchecked == 1
    assert result.status == "ready"
    assert result.available is True
    assert result.details["transport"] == "sdk"
    assert result.details["health"] == {"status": "ready", "provider": "codex-sdk", "transport": "sdk"}
    assert audit.events == [
        {
            "runtime_name": "codex_sdk",
            "action": "test",
            "principal_id": "alice",
            "status": "succeeded",
            "metadata": {
                "provider_status": "ready",
                "available": True,
                "configured": True,
                "health_status": "ready",
                "config_fingerprint": audit.events[0]["metadata"]["config_fingerprint"],
            },
        }
    ]


def test_runtime_management_codex_status_reuses_matching_recent_test_result():
    repository = _ConfigRepository(
        RuntimeProviderConfigSnapshot(
            runtime_name="codex_sdk",
            enabled=True,
            endpoint=None,
            model=None,
            secret_ref=None,
            extra={},
            updated_by=None,
            updated_at=None,
        )
    )
    config_service = RuntimeConfigService(
        repository=repository,
        openai_config={"api_key": "", "api_base": "", "model": ""},
        codex_config={
            "enabled": True,
            "project_root": "/repo/project",
        },
    )
    sdk_client = _SdkClient()
    service = AgentRuntimeManagementService(
        openai_config={"api_key": "", "model": ""},
        codex_config={
            "enabled": True,
            "project_root": "/repo/project",
        },
        runtime_config_service=config_service,
        codex_client_factory=lambda _config: sdk_client,
    )

    service.test_provider("codex_sdk", principal_id="alice")
    status = service.provider_status("codex_sdk")

    assert sdk_client.healthchecked == 1
    assert status.status == "ready"
    assert status.available is True
    assert status.message == "Codex SDK 最近一次连接测试通过。"
    assert status.details["last_test"]["health_status"] == "ready"


def test_runtime_management_codex_status_ignores_stale_test_result_after_config_change():
    repository = _ConfigRepository(
        RuntimeProviderConfigSnapshot(
            runtime_name="codex_sdk",
            enabled=True,
            endpoint=None,
            model=None,
            secret_ref=None,
            extra={},
            updated_by=None,
            updated_at=None,
        )
    )
    first_config = RuntimeConfigService(
        repository=repository,
        openai_config={"api_key": "", "api_base": "", "model": ""},
        codex_config={
            "enabled": True,
            "project_root": "/repo/project-a",
        },
    )
    AgentRuntimeManagementService(
        openai_config={"api_key": "", "model": ""},
        codex_config={
            "enabled": True,
            "project_root": "/repo/project-a",
        },
        runtime_config_service=first_config,
        codex_client_factory=lambda _config: _SdkClient(),
    ).test_provider("codex_sdk", principal_id="alice")
    changed_config = RuntimeConfigService(
        repository=repository,
        openai_config={"api_key": "", "api_base": "", "model": ""},
        codex_config={
            "enabled": True,
            "project_root": "/repo/project-b",
        },
    )
    service = AgentRuntimeManagementService(
        openai_config={"api_key": "", "model": ""},
        codex_config={
            "enabled": True,
            "project_root": "/repo/project-b",
        },
        runtime_config_service=changed_config,
    )

    status = service.provider_status("codex_sdk")

    assert status.status == "not_verified"
    assert status.available is False


def test_runtime_management_codex_sdk_test_provider_maps_client_error_to_unavailable():
    sdk_client = _SdkClient(fail=True)
    service = AgentRuntimeManagementService(
        openai_config={"api_key": "", "model": ""},
        codex_config={
            "enabled": True,
            "project_root": "/repo/project",
        },
        codex_client_factory=lambda _config: sdk_client,
    )

    result = service.test_provider("codex_sdk", principal_id="alice")

    assert result.status == "unavailable"
    assert result.available is False
    assert result.details["provider_error"] == {
        "code": "RUNTIME_PROVIDER_ERROR",
        "message": "sdk unavailable",
        "provider": "codex-sdk",
    }


def test_runtime_management_codex_capabilities_use_sdk_client_when_configured():
    sdk_client = _SdkClient()
    service = AgentRuntimeManagementService(
        openai_config={"api_key": "", "model": ""},
        codex_config={
            "enabled": True,
            "project_root": "/tmp/cubic3",
        },
        codex_client_factory=lambda _config: sdk_client,
    )

    capabilities = service.provider_capabilities("codex_sdk")

    assert sdk_client.capability_calls == 1
    assert capabilities.available is True
    assert capabilities.actions == ["semantic.modeling.review_proposal"]
    assert capabilities.artifacts == ["codex_final_response"]
    assert capabilities.events == ["run.succeeded"]
    assert capabilities.details["transport"] == "sdk"
