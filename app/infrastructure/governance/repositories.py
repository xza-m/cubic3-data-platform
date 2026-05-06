"""治理审计 PostgreSQL 仓储实现。"""
from __future__ import annotations

from typing import List, Optional

from app.domain.ontology.entities import GovernanceAuditTrace
from app.domain.ontology.ports.audit_trace_repository import IGovernanceAuditTraceRepository
from app.infrastructure.governance.models import GovernanceAuditTraceORM


class SqlGovernanceAuditTraceRepository(IGovernanceAuditTraceRepository):
    """基于 SQL 数据库的治理审计仓储。"""

    def __init__(self, session):
        self._session = session

    def get(self, trace_id: str) -> Optional[GovernanceAuditTrace]:
        row = self._session.get(GovernanceAuditTraceORM, trace_id)
        return self._to_domain(row) if row else None

    def list_all(self) -> List[GovernanceAuditTrace]:
        rows = (
            self._session.query(GovernanceAuditTraceORM)
            .order_by(GovernanceAuditTraceORM.timestamp.desc())
            .all()
        )
        return [self._to_domain(row) for row in rows]

    def list_by_policy(self, policy_name: str) -> List[GovernanceAuditTrace]:
        return self.list_filtered(policy_name=policy_name)

    def list_filtered(
        self,
        *,
        policy_name: str | None = None,
        target_type: str | None = None,
        target_name: str | None = None,
        decision: str | None = None,
        route_type: str | None = None,
        principal_id: str | None = None,
        semantic_plan_id: str | None = None,
        sql_hash: str | None = None,
    ) -> List[GovernanceAuditTrace]:
        query = self._session.query(GovernanceAuditTraceORM)
        if target_type:
            query = query.filter(GovernanceAuditTraceORM.target_type == target_type)
        if target_name:
            query = query.filter(GovernanceAuditTraceORM.target_name == target_name)
        if decision:
            query = query.filter(GovernanceAuditTraceORM.decision == decision)
        if route_type:
            query = query.filter(GovernanceAuditTraceORM.route_type == route_type)
        if principal_id:
            query = query.filter(GovernanceAuditTraceORM.principal_id == principal_id)
        if semantic_plan_id:
            query = query.filter(GovernanceAuditTraceORM.semantic_plan_id == semantic_plan_id)
        if sql_hash:
            query = query.filter(GovernanceAuditTraceORM.sql_hash == sql_hash)

        rows = query.order_by(GovernanceAuditTraceORM.timestamp.desc()).all()
        items = [self._to_domain(row) for row in rows]
        if policy_name:
            items = [
                item
                for item in items
                if isinstance(item.policy, dict) and item.policy.get("name") == policy_name
            ]
        return items

    def save(self, entity: GovernanceAuditTrace) -> None:
        row = self._session.get(GovernanceAuditTraceORM, entity.id)
        if row is None:
            row = GovernanceAuditTraceORM(id=entity.id)
            self._session.add(row)
        self._apply(row, entity)
        self._session.commit()

    @staticmethod
    def _apply(row: GovernanceAuditTraceORM, entity: GovernanceAuditTrace) -> None:
        row.target_type = entity.target_type
        row.target_name = entity.target_name
        row.principal_id = entity.principal_id
        row.semantic_plan_id = entity.semantic_plan_id
        row.sql_hash = entity.sql_hash
        row.gateway_query_id = entity.gateway_query_id
        row.maxcompute_task_id = entity.maxcompute_task_id
        row.viewer_roles = list(entity.viewer_roles or [])
        row.route_type = entity.route_type
        row.execution_target = entity.execution_target
        row.decision = entity.decision
        row.policy = entity.policy
        row.policy_decision = dict(entity.policy_decision or {})
        row.traceability = dict(entity.traceability or {})
        row.reason = entity.reason
        row.timestamp = entity.timestamp

    @staticmethod
    def _to_domain(row: GovernanceAuditTraceORM) -> GovernanceAuditTrace:
        return GovernanceAuditTrace(
            id=row.id,
            target_type=row.target_type,
            target_name=row.target_name,
            principal_id=row.principal_id,
            semantic_plan_id=row.semantic_plan_id,
            sql_hash=row.sql_hash,
            gateway_query_id=row.gateway_query_id,
            maxcompute_task_id=row.maxcompute_task_id,
            viewer_roles=list(row.viewer_roles or []),
            route_type=row.route_type,
            execution_target=row.execution_target,
            decision=row.decision,
            policy=row.policy,
            policy_decision=dict(row.policy_decision or {}),
            traceability=dict(row.traceability or {}),
            reason=row.reason,
            timestamp=row.timestamp,
        )
