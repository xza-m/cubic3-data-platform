"""Agent Runtime provider 配置合并服务。"""
from __future__ import annotations

from typing import Any, Mapping

from app.domain.agent_inference_runtime.ports import RuntimeConfigRepositoryPort
from app.domain.agent_inference_runtime.types import (
    RuntimeManagementAuditEvent,
    RuntimeName,
    RuntimeProviderConfigSnapshot,
    RuntimeProviderConfigUpdate,
)
from app.infrastructure.agent_inference_runtime.secret_cipher import decrypt_secret


class RuntimeConfigService:
    """合并环境/bootstrap 配置与数据库覆盖项。

    DB 配置只覆盖 provider 自身的启用、endpoint/base_url、model、密钥引用
    与少量运行调优项；Codex SDK 的项目根和运行根只来自当前服务环境配置。
    `ui_managed` 等管理面 fail-closed 开关仍以环境配置为准。
    """

    def __init__(
        self,
        *,
        repository: RuntimeConfigRepositoryPort | None,
        openai_config: Mapping[str, Any],
        codex_config: Mapping[str, Any],
    ) -> None:
        self._repository = repository
        self._openai_config = openai_config
        self._codex_config = codex_config

    def provider_config(
        self,
        runtime_name: RuntimeName,
    ) -> RuntimeProviderConfigSnapshot:
        base = self._base_config(runtime_name)
        override = self._get_override(runtime_name)
        if override is None:
            return base
        return RuntimeProviderConfigSnapshot(
            runtime_name=runtime_name,
            enabled=override.enabled,
            endpoint=override.endpoint if override.endpoint is not None else base.endpoint,
            model=override.model if override.model is not None else base.model,
            secret_ref=override.secret_ref if override.secret_ref is not None else base.secret_ref,
            secret_ciphertext=(
                override.secret_ciphertext if override.secret_ref is not None else base.secret_ciphertext
            ),
            extra={**base.extra, **_runtime_extra(runtime_name, override.extra)},
            updated_by=override.updated_by,
            updated_at=override.updated_at,
        )

    def provider_config_public(self, runtime_name: RuntimeName) -> dict[str, Any]:
        return self.provider_config(runtime_name).to_public_dict()

    def update_provider_config(
        self,
        update: RuntimeProviderConfigUpdate,
    ) -> RuntimeProviderConfigSnapshot:
        if self._repository is None:
            raise RuntimeError("runtime config repository is not configured")
        return self._repository.upsert_provider_config(update)

    def management_config(self, runtime_name: RuntimeName) -> dict[str, Any]:
        snapshot = self.provider_config(runtime_name)
        if runtime_name == "openai_compatible":
            return {
                "enabled": snapshot.enabled,
                "api_key": self._openai_api_key(snapshot),
                "api_base": snapshot.endpoint or "",
                "model": snapshot.model or "",
                "timeout": self._openai_config.get("timeout"),
                "extra": snapshot.extra,
            }
        if runtime_name == "codex_sdk":
            env_enabled = _as_bool(self._codex_config.get("enabled"))
            extra = dict(snapshot.extra)
            tuning_config = {
                key: extra[key]
                for key in (
                    "timeout_seconds",
                    "sandbox",
                    "codex_path",
                    "max_concurrency",
                )
                if extra.get(key) is not None
            }
            return {
                **dict(self._codex_config),
                **tuning_config,
                "enabled": env_enabled and snapshot.enabled,
                "base_url": snapshot.endpoint or extra.get("base_url") or self._codex_config.get("base_url"),
                "model": snapshot.model or self._codex_config.get("model"),
                "provider_extra": extra,
            }
        raise KeyError(runtime_name)

    def _openai_api_key(self, snapshot: RuntimeProviderConfigSnapshot) -> str:
        if snapshot.secret_ref == "db":
            return decrypt_secret(snapshot.secret_ciphertext)
        if snapshot.secret_ref == "env:AGENT_OPENAI_API_KEY":
            return str(self._openai_config.get("api_key") or "").strip()
        return ""

    def record_audit_event(
        self,
        *,
        runtime_name: RuntimeName,
        action: str,
        principal_id: str | None,
        status: str,
        metadata: dict[str, Any],
    ) -> None:
        if self._repository is None:
            return
        self._repository.record_audit_event(
            runtime_name=runtime_name,
            action=action,
            principal_id=principal_id,
            status=status,
            metadata=metadata,
        )

    def latest_audit_event(
        self,
        runtime_name: RuntimeName,
        *,
        action: str | None = None,
    ) -> RuntimeManagementAuditEvent | None:
        if self._repository is None:
            return None
        return self._repository.get_latest_audit_event(runtime_name, action=action)

    def _get_override(
        self,
        runtime_name: RuntimeName,
    ) -> RuntimeProviderConfigSnapshot | None:
        if self._repository is None:
            return None
        return self._repository.get_provider_config(runtime_name)

    def _base_config(self, runtime_name: RuntimeName) -> RuntimeProviderConfigSnapshot:
        if runtime_name == "openai_compatible":
            api_key = str(self._openai_config.get("api_key") or "").strip()
            model = str(self._openai_config.get("model") or "").strip()
            return RuntimeProviderConfigSnapshot(
                runtime_name=runtime_name,
                enabled=bool(api_key and model),
                endpoint=str(self._openai_config.get("api_base") or "").strip() or None,
                model=model or None,
                secret_ref="env:AGENT_OPENAI_API_KEY" if api_key else None,
                extra={},
                updated_by=None,
                updated_at=None,
            )
        if runtime_name == "codex_sdk":
            base_url = str(self._codex_config.get("base_url") or "").strip()
            return RuntimeProviderConfigSnapshot(
                runtime_name=runtime_name,
                enabled=_as_bool(self._codex_config.get("enabled")),
                endpoint=base_url or None,
                model=str(self._codex_config.get("model") or "").strip() or None,
                secret_ref=None,
                extra={},
                updated_by=None,
                updated_at=None,
            )
        raise KeyError(runtime_name)


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


_CODEX_ENV_BOUND_EXTRA_KEYS = {
    "project_root",
    "runtime_root",
    "runtime_workspace_roots",
    "allowed_project_roots",
    "allowed_workspace_roots",
    "runtime_env_id",
    "env_id",
}


def _runtime_extra(runtime_name: RuntimeName, extra: Mapping[str, Any]) -> dict[str, Any]:
    if runtime_name != "codex_sdk":
        return dict(extra)
    return {
        key: value
        for key, value in dict(extra).items()
        if key not in _CODEX_ENV_BOUND_EXTRA_KEYS
    }
