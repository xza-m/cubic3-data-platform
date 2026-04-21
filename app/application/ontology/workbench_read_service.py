"""Ontology Workbench OWV2 聚合读模型服务。"""
from __future__ import annotations

from typing import Any


class OntologyWorkbenchReadService:
    def __init__(
        self,
        *,
        ontology_service,
        mapper_service,
        history_repository,
        audit_repository=None,
    ):
        self._ontology_service = ontology_service
        self._mapper_service = mapper_service
        self._history_repository = history_repository
        self._audit_repository = audit_repository

    @staticmethod
    def _sort_items(items: list[dict[str, Any]], *, field: str = "name") -> list[dict[str, Any]]:
        return sorted(items, key=lambda item: str(item.get(field) or item.get("title") or ""))

    @staticmethod
    def _extract_reason(item: dict[str, Any]) -> str:
        return str(item.get("reason") or item.get("message") or item.get("summary") or "待处理项")

    @staticmethod
    def _entity_name(item: dict[str, Any]) -> str:
        return str(item.get("entity_name") or item.get("target_name") or item.get("name") or "")

    def _history_items(self, entity_type: str, entity_name: str) -> list[dict[str, Any]]:
        return [item.model_dump(mode="json") for item in self._history_repository.list_by_entity(entity_type, entity_name)]

    def _last_activity(self, entity_type: str, entity_name: str) -> dict[str, Any] | None:
        items = self._history_items(entity_type, entity_name)
        return items[0] if items else None

    def _stale_and_consistency(self) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        stale_payload = self._mapper_service.stale_check() if self._mapper_service is not None else {"items": []}
        consistency_payload = (
            self._mapper_service.consistency_report() if self._mapper_service is not None else {"items": []}
        )
        return stale_payload.get("items", []), consistency_payload.get("items", [])

    def _policy_audits(self, policy_name: str) -> list[dict[str, Any]]:
        if self._audit_repository is None:
            return []
        return [item.model_dump(mode="json") for item in self._audit_repository.list_by_policy(policy_name)]

    def list_objects(self) -> dict[str, Any]:
        objects = self._ontology_service.list_objects().get("items", [])
        properties = self._ontology_service.list_properties().get("items", [])
        metrics = self._ontology_service.list_metrics().get("items", [])
        relations = self._ontology_service.list_relations().get("items", [])
        actions = self._ontology_service.list_actions().get("items", [])
        policies = self._ontology_service.list_policies().get("items", [])
        stale_items, consistency_items = self._stale_and_consistency()

        items: list[dict[str, Any]] = []
        for object_item in self._sort_items(objects):
            object_name = str(object_item.get("name") or "")
            object_metric_names = {
                str(metric.get("name") or "")
                for metric in metrics
                if str(metric.get("object_name") or "") == object_name
            }
            stats = {
                "property_count": sum(1 for item in properties if str(item.get("object_name") or "") == object_name),
                "metric_count": len(object_metric_names),
                "relation_count": sum(
                    1
                    for item in relations
                    if str(item.get("source_object_name") or "") == object_name
                    or str(item.get("target_object_name") or "") == object_name
                ),
                "action_count": sum(1 for item in actions if str(item.get("object_name") or "") == object_name),
                "rule_count": sum(
                    1
                    for item in policies
                    if (
                        str(item.get("target_type") or "") == "object"
                        and str(item.get("target_name") or "") == object_name
                    )
                    or (
                        str(item.get("target_type") or "") == "metric"
                        and str(item.get("target_name") or "") in object_metric_names
                    )
                ),
            }
            object_stale = [
                item for item in stale_items if self._entity_name(item) == object_name or self._entity_name(item) in object_metric_names
            ]
            object_consistency = [
                item
                for item in consistency_items
                if self._entity_name(item) == object_name or self._entity_name(item) in object_metric_names
            ]
            items.append(
                {
                    **object_item,
                    "stats": stats,
                    "risk_summary": {
                        "stale_count": len(object_stale),
                        "consistency_count": len(object_consistency),
                    },
                    "last_activity": self._last_activity("object", object_name),
                }
            )
        return {"items": items, "total": len(items)}

    def get_object_overview(self, object_name: str) -> dict[str, Any] | None:
        object_item = self._ontology_service.get_object(object_name)
        if object_item is None:
            return None

        properties = [
            item for item in self._ontology_service.list_properties().get("items", []) if str(item.get("object_name")) == object_name
        ]
        metrics = [
            item for item in self._ontology_service.list_metrics().get("items", []) if str(item.get("object_name")) == object_name
        ]
        relations = [
            item
            for item in self._ontology_service.list_relations().get("items", [])
            if str(item.get("source_object_name")) == object_name or str(item.get("target_object_name")) == object_name
        ]
        actions = [
            item for item in self._ontology_service.list_actions().get("items", []) if str(item.get("object_name")) == object_name
        ]
        metric_names = {str(item.get("name") or "") for item in metrics}
        policies = [
            item
            for item in self._ontology_service.list_policies().get("items", [])
            if (
                str(item.get("target_type") or "") == "object" and str(item.get("target_name") or "") == object_name
            )
            or (
                str(item.get("target_type") or "") == "metric" and str(item.get("target_name") or "") in metric_names
            )
        ]
        stale_items, consistency_items = self._stale_and_consistency()
        matched_stale = [
            item for item in stale_items if self._entity_name(item) == object_name or self._entity_name(item) in metric_names
        ]
        matched_consistency = [
            item
            for item in consistency_items
            if self._entity_name(item) == object_name or self._entity_name(item) in metric_names
        ]
        audits = []
        for policy in policies:
            audits.extend(self._policy_audits(str(policy.get("name") or "")))
        audits.sort(key=lambda item: str(item.get("timestamp") or ""), reverse=True)

        return {
            "object": object_item,
            "stats": {
                "property_count": len(properties),
                "metric_count": len(metrics),
                "relation_count": len(relations),
                "action_count": len(actions),
                "rule_count": len(policies),
            },
            "capabilities": {
                "properties": self._sort_items(properties),
                "actions": self._sort_items(actions),
            },
            "associations": {
                "metrics": self._sort_items(metrics),
                "relations": self._sort_items(relations),
                "rules": self._sort_items(policies),
            },
            "governance": {
                "stale_items": [
                    {**item, "reason": self._extract_reason(item)}
                    for item in matched_stale
                ],
                "consistency_items": [
                    {**item, "reason": self._extract_reason(item)}
                    for item in matched_consistency
                ],
                "audit_total": len(audits),
                "recent_audits": audits[:5],
            },
            "lifecycle": {
                "history_items": self._history_items("object", object_name),
                "history_total": len(self._history_items("object", object_name)),
                "last_activity": self._last_activity("object", object_name),
            },
        }

    def get_governance_summary(self) -> dict[str, Any]:
        policies = self._sort_items(self._ontology_service.list_policies().get("items", []))
        stale_items, consistency_items = self._stale_and_consistency()
        governance_items: list[dict[str, Any]] = []
        for policy in policies:
            audits = self._policy_audits(str(policy.get("name") or ""))
            impact = self._mapper_service.policy_impact(policy) if self._mapper_service is not None else {"issues": []}
            governance_items.append(
                {
                    **policy,
                    "issue_count": len(impact.get("issues", [])),
                    "issues": impact.get("issues", []),
                    "projection_status": impact.get("projection_status", "unknown"),
                    "audit_total": len(audits),
                    "last_audit": audits[0] if audits else None,
                }
            )
        recent_audits = self._audit_repository.list_all() if self._audit_repository is not None else []
        recent_audits_payload = [item.model_dump(mode="json") for item in recent_audits[:10]]
        return {
            "summary": {
                "policy_total": len(governance_items),
                "stale_count": len(stale_items),
                "consistency_count": len(consistency_items),
                "audit_total": len(recent_audits_payload),
            },
            "items": governance_items,
            "stale_items": [{**item, "reason": self._extract_reason(item)} for item in stale_items],
            "consistency_items": [{**item, "reason": self._extract_reason(item)} for item in consistency_items],
            "recent_audits": recent_audits_payload,
        }
