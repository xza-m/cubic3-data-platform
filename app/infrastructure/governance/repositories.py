"""治理审计 PostgreSQL 仓储实现。"""
from __future__ import annotations

import uuid
from typing import Any, List, Optional

from sqlalchemy import func

from app.domain.governance.entities import DataPolicy, ExecutionProfile
from app.domain.ontology.entities import GovernanceAuditTrace
from app.domain.ontology.ports.audit_trace_repository import IGovernanceAuditTraceRepository
from app.infrastructure.governance.models import (
    AccessDataPolicyORM,
    AccessExecutionProfileORM,
    AccessPolicyDecisionORM,
    GovernanceAuditTraceORM,
)
from app.shared.utils.time import utcnow


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

    def save(self, entity: GovernanceAuditTrace, *, commit: bool = True) -> None:
        row = self._session.get(GovernanceAuditTraceORM, entity.id)
        if row is None:
            row = GovernanceAuditTraceORM(id=entity.id)
            self._session.add(row)
        self._apply(row, entity)
        self._session.flush()
        if commit:
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


class SqlAccessGovernanceRepository:
    """DataPolicy / ExecutionProfile / PolicyDecision SQL 仓储。"""

    def __init__(self, session):
        self._session = session

    # ------------------------------------------------------------------
    # ExecutionProfile
    # ------------------------------------------------------------------

    def upsert_execution_profile(
        self,
        data: dict[str, Any],
        *,
        created_by: str | None = None,
        commit: bool = True,
    ) -> AccessExecutionProfileORM:
        if created_by and "created_by" not in data:
            data = {**data, "created_by": created_by}
        profile_code = str(data.get("profile_code") or "").strip()
        row = self._session.get(AccessExecutionProfileORM, profile_code)
        if row is None:
            row = AccessExecutionProfileORM(profile_code=profile_code)
            self._session.add(row)
        row.name = str(data.get("name") or row.name or profile_code)
        row.description = data.get("description")
        row.credential_mode = str(data.get("credential_mode") or row.credential_mode or "internal_query_execution")
        # data-platform 只保存逻辑执行画像；真实 RAM Role/User 绑定归 gateway CredentialBinding 管理。
        row.credential_ref = None
        row.data_level = str(data.get("data_level") or row.data_level or "M1").upper()
        row.allowed_operations = list(data.get("allowed_operations") or row.allowed_operations or ["query"])
        row.max_rows = data.get("max_rows")
        row.timeout_seconds = data.get("timeout_seconds")
        row.export_allowed = bool(data.get("export_allowed", row.export_allowed or False))
        row.requires_strong_audit = bool(data.get("requires_strong_audit", row.requires_strong_audit or False))
        row.status = str(data.get("status") or row.status or "active")
        row.created_by = data.get("created_by") or row.created_by
        row.updated_at = utcnow()
        self._session.flush()
        if commit:
            self._session.commit()
        return row

    def get_execution_profile(self, profile_code: str) -> AccessExecutionProfileORM | None:
        return self._session.get(AccessExecutionProfileORM, profile_code)

    def list_execution_profiles(
        self,
        *,
        status: str | None = None,
        data_level: str | None = None,
    ) -> list[AccessExecutionProfileORM]:
        query = self._session.query(AccessExecutionProfileORM)
        if status:
            query = query.filter(AccessExecutionProfileORM.status == status)
        if data_level:
            query = query.filter(AccessExecutionProfileORM.data_level == data_level.upper())
        return query.order_by(AccessExecutionProfileORM.data_level.asc(), AccessExecutionProfileORM.profile_code.asc()).all()

    # ------------------------------------------------------------------
    # DataPolicy
    # ------------------------------------------------------------------

    def upsert_data_policy(
        self,
        data: dict[str, Any],
        *,
        created_by: str | None = None,
        commit: bool = True,
    ) -> AccessDataPolicyORM:
        if created_by and "created_by" not in data:
            data = {**data, "created_by": created_by}
        policy_code = str(data.get("policy_code") or "").strip()
        row = self._session.get(AccessDataPolicyORM, policy_code)
        current_epoch = self.current_policy_epoch()
        is_new = row is None
        old_payload = None if row is None else self._policy_epoch_payload(row)
        if row is None:
            row = AccessDataPolicyORM(policy_code=policy_code)
            self._session.add(row)
        next_values = {
            "name": str(data.get("name") or row.name or policy_code),
            "description": data.get("description"),
            "status": str(data.get("status") or row.status or "active"),
            "priority": int(data.get("priority") if data.get("priority") is not None else row.priority or 0),
            "subject_roles": list(data.get("subject_roles") or row.subject_roles or []),
            "resource_scope": dict(data.get("resource_scope") or row.resource_scope or {}),
            "actions": list(data.get("actions") or row.actions or ["query"]),
            "effect": str(data.get("effect") or row.effect or "allow"),
            "execution_profile_code": data.get("execution_profile_code"),
            "reason": data.get("reason"),
            "policy_version": str(data.get("policy_version") or row.policy_version or "v1"),
        }
        changed = is_new or old_payload != next_values
        row.name = next_values["name"]
        row.description = next_values["description"]
        row.status = next_values["status"]
        row.priority = next_values["priority"]
        row.subject_roles = next_values["subject_roles"]
        row.resource_scope = next_values["resource_scope"]
        row.actions = next_values["actions"]
        row.effect = next_values["effect"]
        row.execution_profile_code = next_values["execution_profile_code"]
        row.reason = next_values["reason"]
        row.policy_version = next_values["policy_version"]
        if changed:
            row.policy_epoch = current_epoch + 1
        else:
            row.policy_epoch = int(row.policy_epoch or 1)
        row.created_by = data.get("created_by") or row.created_by
        row.updated_at = utcnow()
        self._session.flush()
        if commit:
            self._session.commit()
        return row

    def get_data_policy(self, policy_code: str) -> AccessDataPolicyORM | None:
        return self._session.get(AccessDataPolicyORM, policy_code)

    def list_data_policies(
        self,
        *,
        status: str | None = None,
        data_level: str | None = None,
        q: str | None = None,
    ) -> list[AccessDataPolicyORM]:
        query = self._session.query(AccessDataPolicyORM)
        if status:
            query = query.filter(AccessDataPolicyORM.status == status)
        if q:
            keyword = f"%{q.strip()}%"
            query = query.filter(AccessDataPolicyORM.name.like(keyword))
        rows = query.order_by(AccessDataPolicyORM.priority.desc(), AccessDataPolicyORM.policy_code.asc()).all()
        if data_level:
            level = data_level.upper()
            rows = [
                row
                for row in rows
                if level in {str(item).upper() for item in (row.resource_scope or {}).get("data_levels") or []}
            ]
        return rows

    def list_policy_domains(
        self,
        *,
        status: str = "active",
    ) -> list[DataPolicy]:
        return [self._policy_to_domain(row) for row in self.list_data_policies(status=status)]

    def current_policy_epoch(self) -> int:
        value = self._session.query(func.max(AccessDataPolicyORM.policy_epoch)).scalar()
        return int(value or 0)

    def next_policy_epoch(self) -> int:
        return self.current_policy_epoch() + 1

    # ------------------------------------------------------------------
    # PolicyDecision
    # ------------------------------------------------------------------

    def save_policy_decision(self, data: dict[str, Any]) -> dict[str, Any]:
        decision_id = str(data.get("decision_id") or f"pd_{uuid.uuid4().hex}")
        row = self._session.get(AccessPolicyDecisionORM, decision_id)
        if row is None:
            row = AccessPolicyDecisionORM(decision_id=decision_id)
            self._session.add(row)
        row.principal_id = str(data.get("principal_id") or "anonymous")
        row.actor_id = data.get("actor_id")
        row.decision = str(data.get("decision") or "deny")
        row.reason_code = str(data.get("reason_code") or "unknown")
        row.reason = data.get("reason")
        row.data_level = str(data.get("data_level") or "M0")
        row.resource_set = dict(data.get("resource_set") or {})
        row.sql_hashes = list(data.get("sql_hashes") or [])
        row.matched_policies = list(data.get("matched_policies") or [])
        row.execution_profile_code = data.get("execution_profile_code")
        row.policy_version = data.get("policy_version")
        row.policy_epoch = int(data.get("policy_epoch") or 1)
        row.decision_type = str(data.get("decision_type") or "inline")
        row.governance_required = bool(data.get("governance_required") or False)
        self._session.flush()
        self._session.commit()
        return self._decision_to_dict(row)

    def list_policy_decisions(
        self,
        *,
        principal_id: str | None = None,
        decision: str | None = None,
        data_level: str | None = None,
        policy_code: str | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        query = self._session.query(AccessPolicyDecisionORM)
        if principal_id:
            query = query.filter(AccessPolicyDecisionORM.principal_id == principal_id)
        if decision:
            query = query.filter(AccessPolicyDecisionORM.decision == decision)
        if data_level:
            query = query.filter(AccessPolicyDecisionORM.data_level == data_level.upper())
        rows = query.order_by(AccessPolicyDecisionORM.created_at.desc()).limit(limit or 50).all()
        items = [self._decision_to_dict(row) for row in rows]
        if policy_code:
            items = [
                item
                for item in items
                if any(policy.get("policy_code") == policy_code for policy in item.get("matched_policies") or [])
            ]
        return items

    @staticmethod
    def _profile_to_domain(row: AccessExecutionProfileORM) -> ExecutionProfile:
        return ExecutionProfile(
            profile_code=row.profile_code,
            name=row.name,
            description=row.description,
            credential_mode=row.credential_mode,
            data_level=row.data_level,
            allowed_operations=list(row.allowed_operations or []),
            max_rows=row.max_rows,
            timeout_seconds=row.timeout_seconds,
            export_allowed=bool(row.export_allowed),
            requires_strong_audit=bool(row.requires_strong_audit),
            status=row.status,
        )

    @staticmethod
    def _policy_to_domain(row: AccessDataPolicyORM) -> DataPolicy:
        return DataPolicy(
            policy_code=row.policy_code,
            name=row.name,
            description=row.description,
            status=row.status,
            priority=row.priority,
            subject_roles=list(row.subject_roles or []),
            resource_scope=dict(row.resource_scope or {}),
            actions=list(row.actions or []),
            effect=row.effect,
            execution_profile_code=row.execution_profile_code,
            reason=row.reason,
            policy_version=row.policy_version,
            policy_epoch=int(row.policy_epoch or 1),
        )

    @staticmethod
    def _policy_epoch_payload(row: AccessDataPolicyORM) -> dict[str, Any]:
        return {
            "name": row.name,
            "description": row.description,
            "status": row.status,
            "priority": int(row.priority or 0),
            "subject_roles": list(row.subject_roles or []),
            "resource_scope": dict(row.resource_scope or {}),
            "actions": list(row.actions or []),
            "effect": row.effect,
            "execution_profile_code": row.execution_profile_code,
            "reason": row.reason,
            "policy_version": row.policy_version,
        }

    @staticmethod
    def _decision_to_dict(row: AccessPolicyDecisionORM) -> dict[str, Any]:
        return {
            "decision_id": row.decision_id,
            "principal_id": row.principal_id,
            "actor_id": row.actor_id,
            "decision": row.decision,
            "reason_code": row.reason_code,
            "reason": row.reason,
            "data_level": row.data_level,
            "resource_set": dict(row.resource_set or {}),
            "sql_hashes": list(row.sql_hashes or []),
            "matched_policies": list(row.matched_policies or []),
            "execution_profile_code": row.execution_profile_code,
            "policy_version": row.policy_version,
            "policy_epoch": int(row.policy_epoch or 1),
            "decision_type": row.decision_type,
            "governance_required": bool(row.governance_required),
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
