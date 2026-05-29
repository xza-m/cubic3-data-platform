"""平台级 Agent Runtime 管理查询服务。"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping

from app.application.agent_inference_runtime.action_binding import (
    ActionRuntimeBindingRegistry,
)
from app.application.agent_inference_runtime.codex_process_manager import (
    CodexProcessManager,
)
from app.domain.agent_inference_runtime.types import (
    RuntimeActionBinding,
    RuntimeManagementSnapshot,
    RuntimeName,
    RuntimeOperationResult,
    RuntimeProviderCapabilities,
    RuntimeProviderLogView,
    RuntimeProviderStatus,
)


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
    ) -> None:
        self._openai_config = openai_config
        self._codex_config = codex_config
        self._action_bindings = action_bindings or ActionRuntimeBindingRegistry()
        self._codex_process_manager = codex_process_manager or CodexProcessManager(codex_config)

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

    def test_provider(self, runtime_name: RuntimeName) -> RuntimeProviderStatus:
        return self.provider_status(runtime_name)

    def start_provider(self, runtime_name: RuntimeName) -> RuntimeOperationResult:
        self._ensure_codex(runtime_name)
        return self._codex_process_manager.start()

    def stop_provider(self, runtime_name: RuntimeName) -> RuntimeOperationResult:
        self._ensure_codex(runtime_name)
        return self._codex_process_manager.stop()

    def restart_provider(self, runtime_name: RuntimeName) -> RuntimeOperationResult:
        self._ensure_codex(runtime_name)
        return self._codex_process_manager.restart()

    def provider_logs(self, runtime_name: RuntimeName) -> RuntimeProviderLogView:
        self._ensure_codex(runtime_name)
        return self._codex_process_manager.logs()

    def provider_capabilities(self, runtime_name: RuntimeName) -> RuntimeProviderCapabilities:
        self._ensure_codex(runtime_name)
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
        api_key = str(self._openai_config.get("api_key") or "").strip()
        model = str(self._openai_config.get("model") or "").strip()
        configured = bool(api_key and model)
        return RuntimeProviderStatus(
            runtime_name="openai_compatible",
            label="OpenAI Runtime",
            configured=configured,
            available=configured,
            status="ready" if configured else "missing_config",
            message="OpenAI Runtime 已配置。" if configured else "OpenAI Runtime 缺少 API Key 或模型配置。",
            operations=["test_connection"] if configured else [],
            details={
                "model": model,
                "api_base": str(self._openai_config.get("api_base") or ""),
            },
        )

    def _codex_status(self) -> RuntimeProviderStatus:
        enabled = _as_bool(self._codex_config.get("enabled"))
        endpoint = str(self._codex_config.get("endpoint") or "").strip()
        unix_socket = str(self._codex_config.get("unix_socket") or "").strip()
        ui_managed = _as_bool(self._codex_config.get("ui_managed"))
        server_managed = _as_bool(self._codex_config.get("server_managed"))
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
                "project_id": str(self._codex_config.get("project_id") or ""),
                "project_root": str(self._codex_config.get("project_root") or ""),
                "runtime_root": str(self._codex_config.get("runtime_root") or ""),
                "transport": str(self._codex_config.get("transport") or ""),
                "endpoint": endpoint,
                "unix_socket": unix_socket,
                "max_concurrency": self._codex_config.get("max_concurrency"),
                "ui_managed": ui_managed,
                "server_managed": server_managed,
            },
        )


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "on"}
