"""平台级 Agent Runtime 管理查询服务。"""
from __future__ import annotations

from typing import Any, Callable, Mapping
from urllib.parse import urlparse

from app.application.agent_inference_runtime.action_binding import (
    ActionRuntimeBindingRegistry,
)
from app.application.agent_inference_runtime.codex_process_manager import (
    CodexProcessManager,
    CodexProcessManagerError,
)
from app.application.agent_inference_runtime.runtime_config_service import RuntimeConfigService
from app.domain.agent_inference_runtime.types import (
    RuntimeActionBinding,
    RuntimeManagementSnapshot,
    RuntimeName,
    RuntimeOperationResult,
    RuntimeProviderCapabilities,
    RuntimeProviderConfigSnapshot,
    RuntimeProviderConfigUpdate,
    RuntimeProviderLogView,
    RuntimeProviderStatus,
)
from app.infrastructure.agent_inference_runtime.codex_client import CodexAppServerClientError
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class AgentRuntimeManagementService:
    """提供 runtime 状态、连接测试和 action 绑定查询。

    这里不承载语义建模业务逻辑，也不让前端传入任意启动命令。
    """

    def __init__(
        self,
        *,
        openai_config: Mapping[str, Any],
        codex_config: Mapping[str, Any],
        action_bindings: ActionRuntimeBindingRegistry | None = None,
        codex_process_manager: CodexProcessManager | None = None,
        codex_process_manager_factory: Callable[[Mapping[str, Any]], Any] | None = None,
        runtime_config_service: RuntimeConfigService | None = None,
        codex_ws_client_factory: Callable[[Mapping[str, Any]], Any] | None = None,
    ) -> None:
        self._openai_config = openai_config
        self._codex_config = codex_config
        self._action_bindings = action_bindings or ActionRuntimeBindingRegistry()
        self._runtime_config_service = runtime_config_service
        self._codex_process_manager_override = codex_process_manager
        self._codex_process_manager_factory = codex_process_manager_factory or CodexProcessManager
        self._codex_ws_client_factory = codex_ws_client_factory

    def snapshot(self) -> RuntimeManagementSnapshot:
        return RuntimeManagementSnapshot(
            providers=[
                self.provider_status("openai_compatible"),
                self.provider_status("codex_app_server"),
            ],
            action_bindings=self._action_bindings.visible_bindings(),
        )

    def resolve_action(self, action: str) -> RuntimeActionBinding:
        return self._action_bindings.resolve(action)

    def provider_config(self, runtime_name: RuntimeName) -> dict[str, Any]:
        if self._runtime_config_service is None:
            raise KeyError(runtime_name)
        return self._runtime_config_service.provider_config_public(runtime_name)

    def update_provider_config(
        self,
        update: RuntimeProviderConfigUpdate,
    ) -> RuntimeProviderConfigSnapshot:
        if update.runtime_name not in {"openai_compatible", "codex_app_server"}:
            raise KeyError(update.runtime_name)
        if self._runtime_config_service is None:
            raise RuntimeError("runtime config service is not configured")
        return self._runtime_config_service.update_provider_config(update)

    def test_provider(
        self,
        runtime_name: RuntimeName,
        *,
        principal_id: str | None = None,
    ) -> RuntimeProviderStatus:
        try:
            result = (
                self._test_codex_provider()
                if runtime_name == "codex_app_server"
                else self.provider_status(runtime_name)
            )
        except Exception as exc:
            self._audit(
                runtime_name=runtime_name,
                action="test",
                principal_id=principal_id,
                status="failed",
                metadata={"error": str(exc)},
            )
            raise
        self._audit(
            runtime_name=runtime_name,
            action="test",
            principal_id=principal_id,
            status="succeeded",
            metadata=_test_audit_metadata(result),
        )
        return result

    def start_provider(
        self,
        runtime_name: RuntimeName,
        *,
        principal_id: str | None = None,
    ) -> RuntimeOperationResult:
        return self._codex_operation(
            runtime_name,
            action="start",
            principal_id=principal_id,
        )

    def stop_provider(
        self,
        runtime_name: RuntimeName,
        *,
        principal_id: str | None = None,
    ) -> RuntimeOperationResult:
        return self._codex_operation(
            runtime_name,
            action="stop",
            principal_id=principal_id,
        )

    def restart_provider(
        self,
        runtime_name: RuntimeName,
        *,
        principal_id: str | None = None,
    ) -> RuntimeOperationResult:
        return self._codex_operation(
            runtime_name,
            action="restart",
            principal_id=principal_id,
        )

    def provider_logs(self, runtime_name: RuntimeName) -> RuntimeProviderLogView:
        self._ensure_codex(runtime_name)
        config = self._provider_management_config("codex_app_server", self._codex_config)
        return self._codex_process_manager(config).logs()

    def _test_codex_provider(self) -> RuntimeProviderStatus:
        config = self._provider_management_config("codex_app_server", self._codex_config)
        if _codex_ws_configured(config) and self._codex_ws_client_factory is not None:
            return self._codex_ws_status(config)
        return self._codex_status()

    def provider_capabilities(self, runtime_name: RuntimeName) -> RuntimeProviderCapabilities:
        self._ensure_codex(runtime_name)
        config = self._provider_management_config("codex_app_server", self._codex_config)
        if _codex_ws_configured(config) and self._codex_ws_client_factory is not None:
            return self._codex_ws_capabilities(config)
        return self._codex_process_manager(config).capabilities()

    def provider_status(self, runtime_name: RuntimeName) -> RuntimeProviderStatus:
        if runtime_name == "openai_compatible":
            return self._openai_status()
        if runtime_name == "codex_app_server":
            return self._codex_status()
        raise KeyError(runtime_name)

    @staticmethod
    def _ensure_codex(runtime_name: RuntimeName) -> None:
        if runtime_name != "codex_app_server":
            raise KeyError(runtime_name)

    def _openai_status(self) -> RuntimeProviderStatus:
        config = self._provider_management_config("openai_compatible", self._openai_config)
        enabled = _as_bool(config.get("enabled", True))
        api_key = str(config.get("api_key") or "").strip()
        model = str(config.get("model") or "").strip()
        configured = bool(enabled and api_key and model)
        if not enabled:
            status = "disabled"
            message = "OpenAI Runtime 已被管理配置禁用。"
        elif configured:
            status = "ready"
            message = "OpenAI Runtime 已配置。"
        else:
            status = "missing_config"
            message = "OpenAI Runtime 缺少 API Key 或模型配置。"
        return RuntimeProviderStatus(
            runtime_name="openai_compatible",
            label="OpenAI Runtime",
            configured=configured,
            available=configured,
            status=status,
            message=message,
            operations=["test_connection"] if configured else [],
            details={
                "model": model,
                "api_base": str(config.get("api_base") or ""),
            },
        )

    def _codex_ws_status(self, config: Mapping[str, Any]) -> RuntimeProviderStatus:
        base = self._codex_status()
        try:
            health = self._codex_ws_client(config).healthcheck()
        except CodexAppServerClientError as exc:
            return RuntimeProviderStatus(
                runtime_name=base.runtime_name,
                label=base.label,
                configured=base.configured,
                available=False,
                status="unavailable",
                message="Codex app-server WebSocket 联通测试失败。",
                operations=list(base.operations),
                details={
                    **dict(base.details),
                    "provider_error": _provider_error_details(exc),
                },
            )
        return RuntimeProviderStatus(
            runtime_name=base.runtime_name,
            label=base.label,
            configured=base.configured,
            available=True,
            status="ready",
            message="Codex app-server WebSocket 联通测试通过。",
            operations=list(base.operations),
            details={**dict(base.details), "health": dict(health)},
        )

    def _codex_ws_capabilities(self, config: Mapping[str, Any]) -> RuntimeProviderCapabilities:
        try:
            payload = self._codex_ws_client(config).capabilities()
        except CodexAppServerClientError as exc:
            return RuntimeProviderCapabilities(
                runtime_name="codex_app_server",
                available=False,
                actions=[],
                artifacts=[],
                events=[],
                details={"provider_error": _provider_error_details(exc)},
            )
        return RuntimeProviderCapabilities(
            runtime_name="codex_app_server",
            available=True,
            actions=_string_list(payload.get("actions")),
            artifacts=_string_list(payload.get("artifacts")),
            events=_string_list(payload.get("events")),
            details={
                key: value
                for key, value in dict(payload).items()
                if key not in {"actions", "artifacts", "events"}
            },
        )

    def _codex_status(self) -> RuntimeProviderStatus:
        config = self._provider_management_config("codex_app_server", self._codex_config)
        enabled = _as_bool(config.get("enabled"))
        transport = str(config.get("transport") or "ws").strip().lower()
        endpoint = str(config.get("endpoint") or "").strip()
        ui_managed = _as_bool(config.get("ui_managed"))
        server_managed = _as_bool(config.get("server_managed"))
        configured = enabled and transport == "ws" and bool(endpoint)
        available = False
        if not enabled:
            status = "disabled"
            message = "Codex app-server 未启用。"
        elif transport != "ws":
            status = "unavailable"
            message = "Codex app-server 仅支持 WebSocket transport。"
        elif not endpoint:
            status = "missing_config"
            message = "Codex app-server 缺少 WebSocket endpoint。"
        elif not _is_loopback_ws_endpoint(endpoint):
            status = "unavailable"
            message = "Codex app-server endpoint 必须是 loopback ws:// 地址。"
        else:
            status = "not_verified"
            message = "Codex app-server 已配置，等待真实联通测试。"
        operations = ["test_connection"] if configured else []
        if ui_managed:
            operations.extend(["logs", "capabilities"])
        if ui_managed and server_managed:
            operations.extend(["start", "stop", "restart"])
        return RuntimeProviderStatus(
            runtime_name="codex_app_server",
            label="Codex App Server",
            configured=configured,
            available=available,
            status=status,
            message=message,
            operations=operations,
            details={
                "project_id": str(config.get("project_id") or ""),
                "project_root": str(config.get("project_root") or ""),
                "runtime_root": str(config.get("runtime_root") or ""),
                "transport": transport,
                "endpoint": endpoint,
                "max_concurrency": config.get("max_concurrency"),
                "ui_managed": ui_managed,
                "server_managed": server_managed,
            },
        )

    def _codex_operation(
        self,
        runtime_name: RuntimeName,
        *,
        action: str,
        principal_id: str | None,
    ) -> RuntimeOperationResult:
        try:
            self._ensure_codex(runtime_name)
            config = self._provider_management_config("codex_app_server", self._codex_config)
            self._ensure_codex_lifecycle_enabled(config)
            operation = getattr(self._codex_process_manager(config), action)
            result = operation()
        except Exception as exc:
            self._audit(
                runtime_name=runtime_name,
                action=action,
                principal_id=principal_id,
                status="failed",
                metadata={"error": str(exc)},
            )
            raise
        self._audit(
            runtime_name=runtime_name,
            action=action,
            principal_id=principal_id,
            status=result.status,
            metadata=dict(result.details),
        )
        return result

    def _codex_process_manager(self, config: Mapping[str, Any]) -> Any:
        if self._codex_process_manager_override is not None:
            return self._codex_process_manager_override
        return self._codex_process_manager_factory(config)

    def _codex_ws_client(self, config: Mapping[str, Any]) -> Any:
        if self._codex_ws_client_factory is None:
            raise CodexAppServerClientError(
                "Codex app-server WebSocket client factory 未配置。",
                code="RUNTIME_PROVIDER_NOT_CONFIGURED",
            )
        return self._codex_ws_client_factory(config)

    def _provider_management_config(
        self,
        runtime_name: RuntimeName,
        fallback: Mapping[str, Any],
    ) -> Mapping[str, Any]:
        if self._runtime_config_service is None:
            return fallback
        return self._runtime_config_service.management_config(runtime_name)

    def _ensure_codex_lifecycle_enabled(self, config: Mapping[str, Any]) -> None:
        if not _as_bool(config.get("enabled")):
            raise CodexProcessManagerError(
                "Codex app-server 未启用。",
                code="RUNTIME_PROVIDER_DISABLED",
                status_code=403,
            )

    def _audit(
        self,
        *,
        runtime_name: RuntimeName,
        action: str,
        principal_id: str | None,
        status: str,
        metadata: dict[str, Any],
    ) -> None:
        if self._runtime_config_service is None:
            return
        try:
            self._runtime_config_service.record_audit_event(
                runtime_name=runtime_name,
                action=action,
                principal_id=principal_id,
                status=status,
                metadata=metadata,
            )
        except Exception:
            logger.debug("agent runtime audit event record failed", exc_info=True)
            return


def _test_audit_metadata(result: RuntimeProviderStatus) -> dict[str, Any]:
    metadata = {
        "provider_status": result.status,
        "available": result.available,
        "configured": result.configured,
    }
    health = result.details.get("health")
    if isinstance(health, Mapping):
        metadata["health_status"] = str(health.get("status") or "")
    provider_error = result.details.get("provider_error")
    if isinstance(provider_error, Mapping):
        metadata["provider_error"] = dict(provider_error)
    return metadata


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _codex_ws_configured(config: Mapping[str, Any]) -> bool:
    return (
        _as_bool(config.get("enabled"))
        and str(config.get("transport") or "").strip().lower() == "ws"
        and bool(str(config.get("endpoint") or "").strip())
    )


def _provider_error_details(exc: CodexAppServerClientError) -> dict[str, Any]:
    return {
        "code": exc.code,
        "message": str(exc),
        **dict(exc.details),
    }


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if isinstance(item, str)]


def _is_loopback_ws_endpoint(endpoint: str) -> bool:
    parsed = urlparse(endpoint)
    try:
        port = parsed.port
    except ValueError:
        return False
    return (
        parsed.scheme == "ws"
        and parsed.hostname in {"127.0.0.1", "localhost", "::1"}
        and port is not None
        and port > 0
    )
