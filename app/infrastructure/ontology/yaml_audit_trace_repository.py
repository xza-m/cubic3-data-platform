from __future__ import annotations

from app.domain.ontology.entities import GovernanceAuditTrace
from app.domain.ontology.ports.audit_trace_repository import IGovernanceAuditTraceRepository
from app.infrastructure.ontology.yaml_store import YamlEntityStore


class YamlGovernanceAuditTraceRepository(IGovernanceAuditTraceRepository):
    def __init__(self, audit_dir: str):
        self._store = YamlEntityStore(audit_dir, GovernanceAuditTrace, "id")

    def get(self, trace_id: str):
        return self._store.get(trace_id)

    def list_all(self):
        items = self._store.list_all()
        return sorted(items, key=lambda item: item.timestamp, reverse=True)

    def list_by_policy(self, policy_name: str):
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
    ):
        items = []
        for item in self._store.list_all():
            if policy_name and not (isinstance(item.policy, dict) and item.policy.get("name") == policy_name):
                continue
            if target_type and item.target_type != target_type:
                continue
            if target_name and item.target_name != target_name:
                continue
            if decision and item.decision != decision:
                continue
            if route_type and item.route_type != route_type:
                continue
            if principal_id and item.principal_id != principal_id:
                continue
            if semantic_plan_id and item.semantic_plan_id != semantic_plan_id:
                continue
            if sql_hash and item.sql_hash != sql_hash:
                continue
            items.append(item)
        return sorted(items, key=lambda item: item.timestamp, reverse=True)

    def save(self, entity: GovernanceAuditTrace) -> None:
        self._store.save(entity)
