from __future__ import annotations

from dataclasses import replace

import pytest

from app.application.agent_inference_runtime.errors import AgentInferenceRuntimeError
from app.application.agent_inference_runtime.action_binding import (
    ActionRuntimeBindingRegistry,
)
from app.application.agent_inference_runtime.codex_process_manager import (
    CodexProcessManagerError,
)
from app.application.agent_inference_runtime.management import (
    AgentRuntimeManagementService,
)
from app.application.agent_inference_runtime.runtime_config_service import RuntimeConfigService
from app.application.agent_inference_runtime.router import AgentInferenceRuntimeRouter
from app.application.agent_inference_runtime.service import AgentInferenceRuntimeService
from app.domain.agent_inference_runtime.types import RuntimeProviderConfigSnapshot
from app.domain.agent_inference_runtime.ports import AgentInferenceRuntimePort
from app.infrastructure.agent_inference_runtime.codex_http_client import CodexAppServerClientError
from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    AgentInferenceRuntimeResult,
    RuntimeContextRef,
    RuntimePolicy,
)


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


class _FailingCodexProcessManager:
    def start(self):
        raise OSError("codex-app-server not found")


class _UnexpectedCodexProcessManager:
    def __init__(self):
        self.started = False

    def start(self):
        self.started = True
        raise AssertionError("disabled provider should not start")


class _FakeCodexHttpClient:
    def __init__(self, *, health=None, capabilities=None):
        self.health_payload = health or {"status": "ok", "version": "0.1.0"}
        self.capabilities_payload = capabilities or {
            "actions": ["semantic.modeling.review_proposal"],
            "artifacts": ["model_patch"],
            "events": ["run.succeeded"],
            "tools": ["read_file"],
        }
        self.calls = []

    def healthcheck(self):
        self.calls.append("healthcheck")
        return self.health_payload

    def capabilities(self):
        self.calls.append("capabilities")
        return self.capabilities_payload


class _FailingCodexHttpClient:
    def __init__(self, error):
        self.error = error

    def healthcheck(self):
        raise self.error


class _ConfigRepository:
    def __init__(self, snapshot):
        self.snapshot = snapshot
        self.audit_events = []

    def get_provider_config(self, runtime_name):
        return self.snapshot if runtime_name == self.snapshot.runtime_name else None

    def record_audit_event(self, **kwargs):
        self.audit_events.append(kwargs)


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
    codex.runtime_name = "codex_app_server"
    openai = _FakeAdapter()
    openai.runtime_name = "openai_compatible"
    router = AgentInferenceRuntimeRouter(adapters=[openai, codex])

    selected = router.select(_request("semantic.modeling.review_proposal"))

    assert selected.runtime_name == "codex_app_server"


def test_router_defaults_preview_action_to_openai_not_codex():
    codex = _FakeAdapter()
    codex.runtime_name = "codex_app_server"
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


def test_action_binding_registry_marks_codex_review_as_fixed_runtime():
    registry = ActionRuntimeBindingRegistry()

    binding = registry.resolve("semantic.modeling.review_proposal")

    assert binding.default_runtime == "codex_app_server"
    assert binding.allowed_runtimes == ["codex_app_server"]
    assert binding.expose_selector is False
    assert binding.requires_connection is True


def test_action_binding_registry_allows_selector_only_for_expert_debug():
    registry = ActionRuntimeBindingRegistry()

    binding = registry.resolve("semantic.modeling.expert_debug")

    assert binding.default_runtime == "openai_compatible"
    assert binding.allowed_runtimes == ["openai_compatible", "codex_app_server"]
    assert binding.expose_selector is True
    assert binding.reason == "expert_runtime_choice"


def test_router_rejects_preferred_runtime_when_action_is_fixed_openai():
    codex = _FakeAdapter()
    codex.runtime_name = "codex_app_server"
    openai = _FakeAdapter()
    openai.runtime_name = "openai_compatible"
    router = AgentInferenceRuntimeRouter(
        adapters=[openai, codex],
        action_bindings=ActionRuntimeBindingRegistry(),
    )
    request = replace(
        _request("semantic.modeling.generate_candidates"),
        preferred_runtime="codex_app_server",
    )

    with pytest.raises(AgentInferenceRuntimeError) as exc_info:
        router.select(request)

    assert exc_info.value.code == "RUNTIME_NOT_ALLOWED_FOR_ACTION"
    assert exc_info.value.details == {
        "action": "semantic.modeling.generate_candidates",
        "runtime_name": "codex_app_server",
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
    assert snapshot.providers[1].runtime_name == "codex_app_server"
    assert snapshot.providers[1].status == "disabled"
    assert snapshot.action_bindings[0].expose_selector is False


def test_runtime_management_allows_codex_start_operation_only_when_ui_managed():
    service = AgentRuntimeManagementService(
        openai_config={"api_key": "", "model": ""},
        codex_config={
            "enabled": True,
            "ui_managed": True,
            "server_managed": True,
            "endpoint": "http://127.0.0.1:8799",
            "project_id": "cubic3-data-platform",
        },
    )

    status = service.provider_status("codex_app_server")

    assert status.configured is True
    assert status.status == "not_verified"
    assert status.operations == [
        "test_connection",
        "logs",
        "capabilities",
        "start",
        "stop",
        "restart",
    ]


def test_runtime_management_audits_unexpected_codex_start_failure_before_reraising():
    audit = _AuditRecorder()
    service = AgentRuntimeManagementService(
        openai_config={"api_key": "", "model": ""},
        codex_config={"enabled": True},
        codex_process_manager=_FailingCodexProcessManager(),
        runtime_config_service=audit,
    )

    with pytest.raises(OSError, match="codex-app-server not found"):
        service.start_provider("codex_app_server", principal_id="alice")

    assert audit.events == [
        {
            "runtime_name": "codex_app_server",
            "action": "start",
            "principal_id": "alice",
            "status": "failed",
            "metadata": {"error": "codex-app-server not found"},
        }
    ]


def test_runtime_management_blocks_db_disabled_codex_start_and_audits_failure():
    codex_manager = _UnexpectedCodexProcessManager()
    repository = _ConfigRepository(
        RuntimeProviderConfigSnapshot(
            runtime_name="codex_app_server",
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
            "server_managed": True,
            "endpoint": "http://127.0.0.1:8799",
        },
    )
    service = AgentRuntimeManagementService(
        openai_config={"api_key": "", "api_base": "", "model": ""},
        codex_config={
            "enabled": True,
            "ui_managed": True,
            "server_managed": True,
            "endpoint": "http://127.0.0.1:8799",
        },
        codex_process_manager=codex_manager,
        runtime_config_service=config_service,
    )

    with pytest.raises(CodexProcessManagerError, match="Codex app-server 未启用") as exc_info:
        service.start_provider("codex_app_server", principal_id="alice")

    assert exc_info.value.code == "RUNTIME_PROVIDER_DISABLED"
    assert codex_manager.started is False
    assert repository.audit_events == [
        {
            "runtime_name": "codex_app_server",
            "action": "start",
            "principal_id": "alice",
            "status": "failed",
            "metadata": {"error": "Codex app-server 未启用。"},
        }
    ]


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


def test_runtime_management_codex_test_provider_uses_configured_endpoint_healthcheck():
    audit = _AuditRecorder({"enabled": True, "endpoint": "http://127.0.0.1:8765"})
    client = _FakeCodexHttpClient(health={"status": "ready", "version": "0.1.0"})
    service = AgentRuntimeManagementService(
        openai_config={"api_key": "", "model": ""},
        codex_config={"enabled": True, "endpoint": "http://127.0.0.1:8765"},
        runtime_config_service=audit,
        codex_client_factory=lambda config: client,
    )

    result = service.test_provider("codex_app_server", principal_id="alice")

    assert client.calls == ["healthcheck"]
    assert result.status == "ready"
    assert result.available is True
    assert result.details["health"] == {"status": "ready", "version": "0.1.0"}
    assert audit.events == [
        {
            "runtime_name": "codex_app_server",
            "action": "test",
            "principal_id": "alice",
            "status": "succeeded",
            "metadata": {
                "provider_status": "ready",
                "available": True,
                "configured": True,
                "health_status": "ready",
            },
        }
    ]


def test_runtime_management_codex_test_provider_audits_failed_healthcheck():
    audit = _AuditRecorder({"enabled": True, "endpoint": "http://127.0.0.1:8765"})
    service = AgentRuntimeManagementService(
        openai_config={"api_key": "", "model": ""},
        codex_config={"enabled": True, "endpoint": "http://127.0.0.1:8765"},
        runtime_config_service=audit,
        codex_client_factory=lambda config: _FailingCodexHttpClient(
            CodexAppServerClientError(
                "Codex app-server provider 调用失败。",
                code="RUNTIME_PROVIDER_ERROR",
                details={"path": "/health"},
            )
        ),
    )

    result = service.test_provider("codex_app_server", principal_id="alice")

    assert result.status == "unavailable"
    assert result.available is False
    assert result.details["provider_error"] == {
        "code": "RUNTIME_PROVIDER_ERROR",
        "path": "/health",
    }
    assert audit.events == [
        {
            "runtime_name": "codex_app_server",
            "action": "test",
            "principal_id": "alice",
            "status": "failed",
            "metadata": {
                "provider_status": "unavailable",
                "available": False,
                "configured": True,
                "provider_error": {
                    "code": "RUNTIME_PROVIDER_ERROR",
                    "path": "/health",
                },
            },
        }
    ]


def test_runtime_management_codex_capabilities_uses_transport_when_endpoint_configured():
    client = _FakeCodexHttpClient(
        capabilities={
            "actions": ["semantic.modeling.review_proposal"],
            "artifacts": ["model_patch"],
            "events": ["run.started", "run.succeeded"],
            "tools": ["read_file"],
            "max_context_tokens": 200000,
        }
    )
    service = AgentRuntimeManagementService(
        openai_config={"api_key": "", "model": ""},
        codex_config={"enabled": True, "endpoint": "http://127.0.0.1:8765"},
        codex_client_factory=lambda config: client,
    )

    capabilities = service.provider_capabilities("codex_app_server")

    assert client.calls == ["capabilities"]
    assert capabilities.available is True
    assert capabilities.actions == ["semantic.modeling.review_proposal"]
    assert capabilities.artifacts == ["model_patch"]
    assert capabilities.events == ["run.started", "run.succeeded"]
    assert capabilities.details["tools"] == ["read_file"]
    assert capabilities.details["max_context_tokens"] == 200000
