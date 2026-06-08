from __future__ import annotations

from sqlalchemy.orm import Session

from app.domain.agent_inference_runtime.types import (
    RuntimeManagementAuditEvent,
    RuntimeName,
    RuntimeProviderConfigSnapshot,
    RuntimeProviderConfigUpdate,
)
from app.infrastructure.agent_inference_runtime.models import (
    AgentRuntimeAuditLogORM,
    AgentRuntimeProviderConfigORM,
)


class SqlRuntimeConfigRepository:
    """Agent Runtime 配置和管理审计 SQL 仓储。"""

    def __init__(self, session: Session):
        self.session = session

    def get_provider_config(
        self,
        runtime_name: RuntimeName,
    ) -> RuntimeProviderConfigSnapshot | None:
        row = self.session.get(AgentRuntimeProviderConfigORM, runtime_name)
        if row is None:
            return None
        return self._config_from_row(row)

    def upsert_provider_config(
        self,
        update: RuntimeProviderConfigUpdate,
    ) -> RuntimeProviderConfigSnapshot:
        if update.api_key and update.api_key.strip():
            raise ValueError("runtime config secret store is not configured")

        row = self.session.get(AgentRuntimeProviderConfigORM, update.runtime_name)
        if row is None:
            row = AgentRuntimeProviderConfigORM(runtime_name=update.runtime_name)
            self.session.add(row)

        row.enabled = update.enabled
        row.endpoint = update.endpoint
        row.model = update.model
        row.secret_ref = None
        row.extra_json = dict(update.extra or {})
        row.updated_by = update.updated_by
        self.session.commit()
        return self._config_from_row(row)

    def record_audit_event(
        self,
        *,
        runtime_name: RuntimeName,
        action: str,
        principal_id: str | None,
        status: str,
        metadata: dict,
    ) -> RuntimeManagementAuditEvent:
        row = AgentRuntimeAuditLogORM(
            runtime_name=runtime_name,
            action=action,
            principal_id=principal_id,
            status=status,
            metadata_json=dict(metadata or {}),
        )
        self.session.add(row)
        self.session.commit()
        return self._audit_from_row(row)

    def get_latest_audit_event(
        self,
        runtime_name: RuntimeName,
        *,
        action: str | None = None,
    ) -> RuntimeManagementAuditEvent | None:
        query = self.session.query(AgentRuntimeAuditLogORM).filter(
            AgentRuntimeAuditLogORM.runtime_name == runtime_name,
        )
        if action:
            query = query.filter(AgentRuntimeAuditLogORM.action == action)
        row = query.order_by(
            AgentRuntimeAuditLogORM.created_at.desc(),
            AgentRuntimeAuditLogORM.id.desc(),
        ).first()
        return self._audit_from_row(row) if row is not None else None

    def _config_from_row(
        self,
        row: AgentRuntimeProviderConfigORM,
    ) -> RuntimeProviderConfigSnapshot:
        return RuntimeProviderConfigSnapshot(
            runtime_name=row.runtime_name,
            enabled=bool(row.enabled),
            endpoint=row.endpoint,
            model=row.model,
            secret_ref=row.secret_ref,
            extra=dict(row.extra_json or {}),
            updated_by=row.updated_by,
            updated_at=row.updated_at,
        )

    def _audit_from_row(
        self,
        row: AgentRuntimeAuditLogORM,
    ) -> RuntimeManagementAuditEvent:
        return RuntimeManagementAuditEvent(
            id=row.id,
            runtime_name=row.runtime_name,
            action=row.action,
            principal_id=row.principal_id,
            status=row.status,
            metadata=dict(row.metadata_json or {}),
            created_at=row.created_at,
        )
