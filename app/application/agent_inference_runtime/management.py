"""平台级 Agent Runtime 管理查询服务。"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Callable, Mapping

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
from app.infrastructure.agent_inference_runtime.codex_http_client import (
    CodexAppServerClientError,
    CodexAppServerHttpClient,
)
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
        runtime_config_service: RuntimeConfigService | None = None,
        codex_client_factory: Callable[[Mapping[str, Any]], Any] | None = None,
    ) -> None:
        self._openai_config = openai_config
        self._codex_config = codex_config
        self._action_bindings = action_bindings or ActionRuntimeBindingRegistry()
        self._runtime_config_service = runtime_config_service
        self._codex_process_manager = codex_process_manager or CodexProcessManager(codex_config)
        self._codex_client_factory = codex_client_factory or _default_codex_client_factory

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
            operation=self._codex_process_manager.start,
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
            operation=self._codex_process_manager.stop,
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
            operation=self._codex_process_manager.restart,
        )

    def provider_logs(self, runtime_name: RuntimeName) -> RuntimeProviderLogView:
        self._ensure_codex(runtime_name)
        return self._codex_process_manager.logs()

    def _test_codex_provider(self) -> RuntimeProviderStatus:
        status = self._codex_status()
        if not status.configured:
            return status
        config = self._provider_management_config("codex_app_server", self._codex_config)
        if not _codex_http_transport_configured(config):
            return status
        try:
            health = self._codex_client(config).healthcheck()
        except CodexAppServerClientError as exc:
            return RuntimeProviderStatus(
                runtime_name=status.runtime_name,
                label=status.label,
                configured=status.configured,
                available=False,
                status="unavailable",
                message="Codex app-server healthcheck 失败。",
                operations=status.operations,
                details={**status.details, "provider_error": {"code": exc.code, **exc.details}},
            )
        health_status = str(health.get("status") or "").strip().lower()
        ready = health_status in {"ok", "ready"}
        return RuntimeProviderStatus(
            runtime_name=status.runtime_name,
            label=status.label,
            configured=status.configured,
            available=ready,
            status="ready" if ready else "unavailable",
            message="Codex app-server healthcheck 通过。" if ready else "Codex app-server healthcheck 未就绪。",
            operations=status.operations,
            details={**status.details, "health": health},
        )

    def _codex_client(self, config: Mapping[str, Any]) -> Any:
        return self._codex_client_factory(config)

    def provider_capabilities(self, runtime_name: RuntimeName) -> RuntimeProviderCapabilities:
        self._ensure_codex(runtime_name)
        config = self._provider_management_config("codex_app_server", self._codex_config)
        if _codex_http_transport_configured(config):
            try:
                return _transport_capabilities(self._codex_client(config).capabilities())
            except CodexAppServerClientError as exc:
                logger.info(
                    f"codex app-server capabilities unavailable, falling back to local capabilities: {exc}"
                )
                return _degraded_process_manager_capabilities(
                    self._codex_process_manager.capabilities(),
                    exc,
                )
        return self._codex_process_manager.capabilities()

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

    def _codex_status(self) -> RuntimeProviderStatus:
        config = self._provider_management_config("codex_app_server", self._codex_config)
        enabled = _as_bool(config.get("enabled"))
        endpoint = str(config.get("endpoint") or "").strip()
        unix_socket = str(config.get("unix_socket") or "").strip()
        ui_managed = _as_bool(config.get("ui_managed"))
        server_managed = _as_bool(config.get("server_managed"))
        configured = enabled and bool(endpoint or unix_socket)
        socket_exists = bool(unix_socket and Path(unix_socket).exists())
        available = bool(configured and (endpoint or socket_exists))
        if not enabled:
            status = "disabled"
            message = "Codex app-server 未启用。"
        elif not endpoint and not unix_socket:
            status = "missing_config"
            message = "Codex app-server 缺少 endpoint 或 Unix socket。"
        elif unix_socket and not socket_exists and not endpoint:
            status = "unavailable"
            message = "Codex app-server Unix socket 不存在。"
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
                "transport": str(config.get("transport") or ""),
                "endpoint": endpoint,
                "unix_socket": unix_socket,
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
        operation,
    ) -> RuntimeOperationResult:
        try:
            self._ensure_codex(runtime_name)
            self._ensure_codex_lifecycle_enabled()
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

    def _provider_management_config(
        self,
        runtime_name: RuntimeName,
        fallback: Mapping[str, Any],
    ) -> Mapping[str, Any]:
        if self._runtime_config_service is None:
            return fallback
        return self._runtime_config_service.management_config(runtime_name)

    def _ensure_codex_lifecycle_enabled(self) -> None:
        config = self._provider_management_config("codex_app_server", self._codex_config)
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


def _codex_http_transport_configured(config: Mapping[str, Any]) -> bool:
    return _as_bool(config.get("enabled")) and bool(str(config.get("endpoint") or "").strip())


def _default_codex_client_factory(config: Mapping[str, Any]) -> CodexAppServerHttpClient:
    return CodexAppServerHttpClient(
        endpoint=str(config.get("endpoint") or ""),
        timeout_seconds=_positive_number(
            config.get("timeout_seconds") or config.get("timeout"),
            default=10,
        ),
    )


def _transport_capabilities(payload: Mapping[str, Any]) -> RuntimeProviderCapabilities:
    return RuntimeProviderCapabilities(
        runtime_name="codex_app_server",
        available=True,
        actions=_string_list(payload.get("actions") or payload.get("tools")),
        artifacts=_string_list(payload.get("artifacts")),
        events=_string_list(payload.get("events")),
        details=dict(payload),
    )


def _degraded_process_manager_capabilities(
    capabilities: RuntimeProviderCapabilities,
    exc: CodexAppServerClientError,
) -> RuntimeProviderCapabilities:
    return RuntimeProviderCapabilities(
        runtime_name=capabilities.runtime_name,
        available=False,
        actions=capabilities.actions,
        artifacts=capabilities.artifacts,
        events=capabilities.events,
        details={
            **capabilities.details,
            "source": "process_manager_fallback",
            "transport_available": False,
            "transport_error": {
                "code": exc.code,
                **exc.details,
                "message": str(exc),
            },
        },
    )


def _positive_number(value: Any, *, default: int) -> int | float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    if parsed <= 0:
        return default
    return int(parsed) if parsed.is_integer() else parsed


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if isinstance(item, str)]


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "on"}
