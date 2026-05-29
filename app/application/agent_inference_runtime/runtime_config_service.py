"""Agent Runtime provider 配置合并服务。"""
from __future__ import annotations

from typing import Any, Mapping

from app.domain.agent_inference_runtime.ports import RuntimeConfigRepositoryPort
from app.domain.agent_inference_runtime.types import (
    RuntimeName,
    RuntimeProviderConfigSnapshot,
    RuntimeProviderConfigUpdate,
)


class RuntimeConfigService:
    """合并环境/bootstrap 配置与数据库覆盖项。

    DB 配置只覆盖 provider 自身的启用、endpoint、model 与密钥引用；
    `ui_managed`、`server_managed` 等管理面 fail-closed 开关仍以环境配置为准。
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
            extra={**base.extra, **override.extra},
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
        if runtime_name == "codex_app_server":
            env_enabled = _as_bool(self._codex_config.get("enabled"))
            extra = dict(snapshot.extra)
            directory_config = {
                key: extra[key]
                for key in ("project_root", "runtime_root", "runtime_workspace_roots", "timeout_seconds")
                if extra.get(key) is not None
            }
            return {
                **dict(self._codex_config),
                **directory_config,
                "enabled": env_enabled and snapshot.enabled,
                "endpoint": snapshot.endpoint or self._codex_config.get("endpoint"),
                "model": snapshot.model or self._codex_config.get("model"),
                "provider_extra": extra,
            }
        raise KeyError(runtime_name)

    def _openai_api_key(self, snapshot: RuntimeProviderConfigSnapshot) -> str:
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
        if runtime_name == "codex_app_server":
            endpoint = str(self._codex_config.get("endpoint") or "").strip()
            return RuntimeProviderConfigSnapshot(
                runtime_name=runtime_name,
                enabled=_as_bool(self._codex_config.get("enabled")),
                endpoint=endpoint or None,
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
