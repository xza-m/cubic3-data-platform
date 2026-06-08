"""平台级 Agent Runtime 管理查询服务。"""
from __future__ import annotations

import hashlib
import json
from typing import Any, Callable, Mapping

from app.application.agent_inference_runtime.action_binding import (
    ActionRuntimeBindingRegistry,
)
from app.application.agent_inference_runtime.errors import RuntimeProviderOperationError
from app.application.agent_inference_runtime.runtime_config_service import RuntimeConfigService
from app.domain.agent_inference_runtime.types import (
    RuntimeActionBinding,
    RuntimeManagementAuditEvent,
    RuntimeManagementSnapshot,
    RuntimeName,
    RuntimeOperationResult,
    RuntimeProviderCapabilities,
    RuntimeProviderConfigSnapshot,
    RuntimeProviderConfigUpdate,
    RuntimeProviderLogView,
    RuntimeProviderStatus,
)
from app.infrastructure.agent_inference_runtime.codex_client import CodexSdkClientError
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
        runtime_config_service: RuntimeConfigService | None = None,
        codex_client_factory: Callable[[Mapping[str, Any]], Any] | None = None,
    ) -> None:
        self._openai_config = openai_config
        self._codex_config = codex_config
        self._action_bindings = action_bindings or ActionRuntimeBindingRegistry()
        self._runtime_config_service = runtime_config_service
        self._codex_client_factory = codex_client_factory

    def snapshot(self) -> RuntimeManagementSnapshot:
        return RuntimeManagementSnapshot(
            providers=[
                self.provider_status("openai_compatible"),
                self.provider_status("codex_sdk"),
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
        if update.runtime_name not in {"openai_compatible", "codex_sdk"}:
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
                if runtime_name == "codex_sdk"
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
            metadata=self._test_audit_metadata(runtime_name, result),
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
        config = self._provider_management_config("codex_sdk", self._codex_config)
        runtime_root = str(config.get("runtime_root") or ".cubic3/agent-codex")
        return RuntimeProviderLogView(
            runtime_name="codex_sdk",
            log_path=f"{runtime_root}/logs/codex-sdk.log",
            lines=[],
            truncated=False,
        )

    def _test_codex_provider(self) -> RuntimeProviderStatus:
        config = self._provider_management_config("codex_sdk", self._codex_config)
        base = self._codex_status()
        if not base.configured or self._codex_client_factory is None:
            return base
        return self._codex_sdk_status(config)

    def provider_capabilities(self, runtime_name: RuntimeName) -> RuntimeProviderCapabilities:
        self._ensure_codex(runtime_name)
        config = self._provider_management_config("codex_sdk", self._codex_config)
        if self._codex_client_factory is not None:
            return self._codex_sdk_capabilities(config)
        return RuntimeProviderCapabilities(
            runtime_name="codex_sdk",
            available=_as_bool(config.get("enabled")),
            actions=["semantic.modeling.review_proposal", "semantic.modeling.repair_validation_failure"],
            artifacts=["codex_final_response", "codex_thread_items"],
            events=["run.started", "run.succeeded", "run.failed"],
            details={"provider": "codex-sdk", "transport": "sdk"},
        )

    def provider_status(self, runtime_name: RuntimeName) -> RuntimeProviderStatus:
        if runtime_name == "openai_compatible":
            return self._openai_status()
        if runtime_name == "codex_sdk":
            return self._codex_status()
        raise KeyError(runtime_name)

    @staticmethod
    def _ensure_codex(runtime_name: RuntimeName) -> None:
        if runtime_name != "codex_sdk":
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

    def _codex_sdk_status(self, config: Mapping[str, Any]) -> RuntimeProviderStatus:
        base = self._codex_status()
        try:
            health = self._codex_client(config).healthcheck()
        except CodexSdkClientError as exc:
            return RuntimeProviderStatus(
                runtime_name=base.runtime_name,
                label=base.label,
                configured=base.configured,
                available=False,
                status="unavailable",
                message="Codex SDK 联通测试失败。",
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
            message="Codex SDK 联通测试通过。",
            operations=list(base.operations),
            details={**dict(base.details), "health": dict(health)},
        )

    def _codex_sdk_capabilities(self, config: Mapping[str, Any]) -> RuntimeProviderCapabilities:
        try:
            payload = self._codex_client(config).capabilities()
        except CodexSdkClientError as exc:
            return RuntimeProviderCapabilities(
                runtime_name="codex_sdk",
                available=False,
                actions=[],
                artifacts=[],
                events=[],
                details={"provider_error": _provider_error_details(exc)},
            )
        return RuntimeProviderCapabilities(
            runtime_name="codex_sdk",
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
        config = self._provider_management_config("codex_sdk", self._codex_config)
        enabled = _as_bool(config.get("enabled"))
        project_root = str(config.get("project_root") or "").strip()
        runtime_root = str(config.get("runtime_root") or "").strip()
        sandbox = str(config.get("sandbox") or "read-only").strip() or "read-only"
        ui_managed = _as_bool(config.get("ui_managed"))
        configured = enabled and bool(project_root)
        available = False
        if not enabled:
            status = "disabled"
            message = "Codex SDK 未启用。"
        elif not project_root:
            status = "missing_config"
            message = "Codex SDK 缺少项目根目录。"
        else:
            status = "not_verified"
            message = "Codex SDK 已配置，等待真实联通测试。"
        details = {
            "provider": "codex-sdk",
            "project_id": str(config.get("project_id") or ""),
            "project_root": project_root,
            "runtime_root": runtime_root,
            "transport": "sdk",
            "sandbox": sandbox,
            "max_concurrency": config.get("max_concurrency"),
            "ui_managed": ui_managed,
        }
        if configured:
            latest_test = self._latest_codex_test_status(config)
            if latest_test is not None:
                available = latest_test["available"]
                status = latest_test["status"]
                message = latest_test["message"]
                details["last_test"] = latest_test["details"]
        operations = ["test_connection"] if configured else []
        if ui_managed:
            operations.extend(["capabilities"])
        return RuntimeProviderStatus(
            runtime_name="codex_sdk",
            label="Codex SDK",
            configured=configured,
            available=available,
            status=status,
            message=message,
            operations=operations,
            details=details,
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
            config = self._provider_management_config("codex_sdk", self._codex_config)
            self._ensure_codex_lifecycle_enabled(config)
            raise RuntimeProviderOperationError(
                "Codex SDK provider 不支持前端启停。",
                code="RUNTIME_OPERATION_DISABLED",
                status_code=403,
            )
        except Exception as exc:
            self._audit(
                runtime_name=runtime_name,
                action=action,
                principal_id=principal_id,
                status="failed",
                metadata={"error": str(exc)},
            )
            raise

    def _codex_client(self, config: Mapping[str, Any]) -> Any:
        if self._codex_client_factory is None:
            raise CodexSdkClientError(
                "Codex SDK client factory 未配置。",
                code="RUNTIME_PROVIDER_NOT_CONFIGURED",
            )
        return self._codex_client_factory(config)

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
            raise RuntimeProviderOperationError(
                "Codex SDK 未启用。",
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

    def _test_audit_metadata(
        self,
        runtime_name: RuntimeName,
        result: RuntimeProviderStatus,
    ) -> dict[str, Any]:
        metadata = _test_audit_metadata(result)
        if runtime_name == "codex_sdk":
            config = self._provider_management_config("codex_sdk", self._codex_config)
            metadata["config_fingerprint"] = _codex_config_fingerprint(config)
        return metadata

    def _latest_codex_test_status(
        self,
        config: Mapping[str, Any],
    ) -> dict[str, Any] | None:
        latest_event = self._latest_runtime_audit_event("codex_sdk", action="test")
        if latest_event is None:
            return None
        metadata = dict(latest_event.metadata or {})
        if metadata.get("config_fingerprint") != _codex_config_fingerprint(config):
            return None
        provider_status = str(metadata.get("provider_status") or "").strip()
        available = _as_bool(metadata.get("available"))
        details = {
            "status": latest_event.status,
            "provider_status": provider_status,
            "available": available,
            "created_at": latest_event.created_at.isoformat() if latest_event.created_at else None,
        }
        health_status = str(metadata.get("health_status") or "").strip()
        if health_status:
            details["health_status"] = health_status
        provider_error = metadata.get("provider_error")
        if isinstance(provider_error, Mapping):
            details["provider_error"] = dict(provider_error)
        if latest_event.status == "succeeded" and provider_status == "ready" and available:
            return {
                "available": True,
                "status": "ready",
                "message": "Codex SDK 最近一次连接测试通过。",
                "details": details,
            }
        if provider_status == "unavailable" or latest_event.status == "failed":
            return {
                "available": False,
                "status": "unavailable",
                "message": "Codex SDK 最近一次连接测试失败，请重新测试。",
                "details": details,
            }
        return None

    def _latest_runtime_audit_event(
        self,
        runtime_name: RuntimeName,
        *,
        action: str,
    ) -> RuntimeManagementAuditEvent | None:
        if self._runtime_config_service is None:
            return None
        latest_audit = getattr(self._runtime_config_service, "latest_audit_event", None)
        if not callable(latest_audit):
            return None
        try:
            return latest_audit(runtime_name, action=action)
        except Exception:
            logger.debug("agent runtime latest audit event lookup failed", exc_info=True)
            return None


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


def _provider_error_details(exc: CodexSdkClientError) -> dict[str, Any]:
    return {
        "code": exc.code,
        "message": str(exc),
        **dict(exc.details),
    }


def _codex_config_fingerprint(config: Mapping[str, Any]) -> str:
    stable_config = {
        "enabled": _as_bool(config.get("enabled")),
        "base_url": str(config.get("base_url") or ""),
        "codex_path": str(config.get("codex_path") or ""),
        "model": str(config.get("model") or ""),
        "project_root": str(config.get("project_root") or ""),
        "runtime_root": str(config.get("runtime_root") or ""),
        "sandbox": str(config.get("sandbox") or "read-only"),
    }
    payload = json.dumps(stable_config, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if isinstance(item, str)]
