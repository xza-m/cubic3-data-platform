"""Ontology 定义服务。"""
from __future__ import annotations

from datetime import datetime
import uuid
from typing import Any, Dict

from app.domain.ontology.entities import (
    BusinessAction,
    BusinessMetric,
    BusinessObject,
    BusinessProperty,
    BusinessRelation,
    OntologyHistoryEvent,
    GlossaryEntry,
    PolicyMetadata,
)
from app.domain.ontology.ports.history_repository import IOntologyHistoryRepository
from app.domain.ontology.ports.action_repository import IBusinessActionRepository
from app.domain.ontology.ports.glossary_repository import IGlossaryRepository
from app.domain.ontology.ports.metric_repository import IBusinessMetricRepository
from app.domain.ontology.ports.object_repository import IBusinessObjectRepository
from app.domain.ontology.ports.policy_repository import IPolicyMetadataRepository
from app.domain.ontology.ports.property_repository import IBusinessPropertyRepository
from app.domain.ontology.ports.relation_repository import IBusinessRelationRepository


class OntologyDefinitionService:
    def __init__(
        self,
        *,
        object_repository: IBusinessObjectRepository,
        property_repository: IBusinessPropertyRepository,
        metric_repository: IBusinessMetricRepository,
        glossary_repository: IGlossaryRepository,
        relation_repository: IBusinessRelationRepository,
        action_repository: IBusinessActionRepository,
        policy_repository: IPolicyMetadataRepository,
        history_repository: IOntologyHistoryRepository,
    ):
        self._object_repository = object_repository
        self._property_repository = property_repository
        self._metric_repository = metric_repository
        self._glossary_repository = glossary_repository
        self._relation_repository = relation_repository
        self._action_repository = action_repository
        self._policy_repository = policy_repository
        self._history_repository = history_repository

    @staticmethod
    def _order_domain_template() -> Dict[str, list[Dict[str, Any]]]:
        return {
            "objects": [
                {
                    "name": "order",
                    "title": "订单",
                    "description": "订单域核心业务对象，承载下单、支付、退款等关键行为。",
                    "aliases": ["交易订单"],
                    "status": "draft",
                },
                {
                    "name": "customer",
                    "title": "客户",
                    "description": "订单域中的客户对象，用于描述提交订单的业务主体。",
                    "aliases": ["用户", "购买用户"],
                    "status": "draft",
                },
            ],
            "properties": [
                {
                    "name": "order_amount",
                    "title": "订单金额",
                    "object_name": "order",
                    "property_type": "number",
                    "description": "订单支付金额，可作为 GMV 等经营指标的输入属性。",
                    "aliases": ["支付金额"],
                    "status": "draft",
                },
                {
                    "name": "order_status",
                    "title": "订单状态",
                    "object_name": "order",
                    "property_type": "enum",
                    "description": "订单当前状态，例如待支付、已支付、已退款。",
                    "aliases": ["状态"],
                    "status": "draft",
                },
                {
                    "name": "pay_time",
                    "title": "支付时间",
                    "object_name": "order",
                    "property_type": "time",
                    "description": "订单完成支付的时间点。",
                    "aliases": ["支付完成时间"],
                    "status": "draft",
                },
            ],
            "metrics": [
                {
                    "name": "gmv",
                    "title": "GMV",
                    "object_name": "order",
                    "semantic_formula": "已支付订单金额之和",
                    "description": "订单域核心成交指标，用于经营分析与趋势监控。",
                    "semantic_labels": ["订单域", "经营分析"],
                    "measure_refs": ["orders.gmv"],
                    "aliases": ["成交额"],
                    "status": "draft",
                }
            ],
            "relations": [
                {
                    "name": "customer_submits_order",
                    "title": "客户下单",
                    "source_object_name": "customer",
                    "target_object_name": "order",
                    "relation_type": "submits",
                    "description": "客户对订单发起下单行为，是订单域最核心的对象关系。",
                    "aliases": ["客户提交订单"],
                    "status": "draft",
                }
            ],
            "actions": [
                {
                    "name": "pay",
                    "title": "支付",
                    "object_name": "order",
                    "trigger_time_property": "pay_time",
                    "description": "订单完成支付的关键动作，用于事件事实和口径解释。",
                    "event_cube_refs": ["payment_events"],
                    "aliases": ["完成支付"],
                    "status": "draft",
                }
            ],
            "glossary": [
                {
                    "term": "成交额",
                    "canonical_name": "gmv",
                    "entry_type": "metric",
                    "aliases": ["GMV"],
                    "description": "订单域中最常用的经营指标术语。",
                    "status": "draft",
                }
            ],
            "policies": [
                {
                    "name": "gmv_policy",
                    "target_type": "metric",
                    "target_name": "gmv",
                    "visibility": "restricted",
                    "allowed_roles": ["finance"],
                    "description": "GMV 仅财务与授权角色可见。",
                    "status": "draft",
                }
            ],
        }

    @staticmethod
    def _now_iso() -> str:
        return datetime.utcnow().isoformat(timespec="microseconds")

    @staticmethod
    def _dedupe(values: list[str] | None) -> list[str]:
        if not values:
            return []
        deduped: list[str] = []
        for value in values:
            normalized = value.strip()
            if normalized and normalized not in deduped:
                deduped.append(normalized)
        return deduped

    def _record_history(
        self,
        *,
        entity_type: str,
        entity_name: str,
        action: str,
        status: str,
        summary: str,
        validation: Dict[str, Any] | None = None,
    ) -> None:
        self._history_repository.save(
            OntologyHistoryEvent(
                id=f"{entity_type}-{entity_name}-{action}-{uuid.uuid4().hex[:10]}",
                entity_type=entity_type,
                entity_name=entity_name,
                action=action,
                status=status,
                summary=summary,
                validation=validation or {},
                timestamp=self._now_iso(),
            )
        )

    def _entity_repo_and_dump(self, entity_type: str):
        mapping = {
            "objects": ("object", self._object_repository, self.get_object),
            "properties": ("property", self._property_repository, self.get_property),
            "metrics": ("metric", self._metric_repository, self.get_metric),
            "relations": ("relation", self._relation_repository, self.get_relation),
            "actions": ("action", self._action_repository, self.get_action),
            "glossary": ("glossary", self._glossary_repository, self.get_glossary),
            "policies": ("policy", self._policy_repository, self.get_policy),
        }
        resolved = mapping.get(entity_type)
        if resolved is None:
            raise ValueError(f"不支持的 Ontology 资产类型: {entity_type}")
        return resolved

    def list_objects(self) -> Dict[str, Any]:
        items = [item.model_dump(mode="json") for item in self._object_repository.list_all()]
        items.sort(key=lambda item: item["name"])
        return {"items": items, "total": len(items)}

    def get_object(self, name: str) -> Dict[str, Any] | None:
        entity = self._object_repository.get(name)
        return None if entity is None else entity.model_dump(mode="json")

    def save_object(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        entity = BusinessObject(
            **{
                **payload,
                "aliases": self._dedupe(payload.get("aliases")),
            }
        )
        self._object_repository.save(entity)
        self._record_history(
            entity_type="object",
            entity_name=entity.name,
            action="saved",
            status=entity.status,
            summary=f"保存业务对象 {entity.title}",
        )
        return entity.model_dump(mode="json")

    def list_properties(self) -> Dict[str, Any]:
        items = [item.model_dump(mode="json") for item in self._property_repository.list_all()]
        items.sort(key=lambda item: item["name"])
        return {"items": items, "total": len(items)}

    def get_property(self, name: str) -> Dict[str, Any] | None:
        entity = self._property_repository.get(name)
        return None if entity is None else entity.model_dump(mode="json")

    def save_property(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        object_name = str(payload.get("object_name", "")).strip()
        if not object_name or self._object_repository.get(object_name) is None:
            raise ValueError(f"业务属性引用了不存在的业务对象: {object_name or '未提供'}")
        entity = BusinessProperty(
            **{
                **payload,
                "object_name": object_name,
                "aliases": self._dedupe(payload.get("aliases")),
            }
        )
        self._property_repository.save(entity)
        self._record_history(
            entity_type="property",
            entity_name=entity.name,
            action="saved",
            status=entity.status,
            summary=f"保存业务属性 {entity.title}",
        )
        return entity.model_dump(mode="json")

    def list_metrics(self) -> Dict[str, Any]:
        items = [item.model_dump(mode="json") for item in self._metric_repository.list_all()]
        items.sort(key=lambda item: item["name"])
        return {"items": items, "total": len(items)}

    def get_metric(self, name: str) -> Dict[str, Any] | None:
        entity = self._metric_repository.get(name)
        return None if entity is None else entity.model_dump(mode="json")

    def save_metric(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        object_name = str(payload.get("object_name", "")).strip()
        if not object_name or self._object_repository.get(object_name) is None:
            raise ValueError(f"业务指标引用了不存在的业务对象: {object_name or '未提供'}")
        entity = BusinessMetric(
            **{
                **payload,
                "object_name": object_name,
                "aliases": self._dedupe(payload.get("aliases")),
                "semantic_labels": self._dedupe(payload.get("semantic_labels")),
                "measure_refs": self._dedupe(payload.get("measure_refs")),
            }
        )
        self._metric_repository.save(entity)
        self._record_history(
            entity_type="metric",
            entity_name=entity.name,
            action="saved",
            status=entity.status,
            summary=f"保存业务指标 {entity.title}",
        )
        return entity.model_dump(mode="json")

    def list_glossary(self) -> Dict[str, Any]:
        items = [item.model_dump(mode="json") for item in self._glossary_repository.list_all()]
        items.sort(key=lambda item: item["canonical_name"])
        return {"items": items, "total": len(items)}

    def get_glossary(self, canonical_name: str) -> Dict[str, Any] | None:
        entity = self._glossary_repository.get(canonical_name)
        return None if entity is None else entity.model_dump(mode="json")

    def save_glossary(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        entity = GlossaryEntry(
            **{
                **payload,
                "aliases": self._dedupe(payload.get("aliases")),
            }
        )
        self._glossary_repository.save(entity)
        self._record_history(
            entity_type="glossary",
            entity_name=entity.canonical_name,
            action="saved",
            status=entity.status,
            summary=f"保存术语 {entity.term}",
        )
        return entity.model_dump(mode="json")

    def list_relations(self) -> Dict[str, Any]:
        items = [item.model_dump(mode="json") for item in self._relation_repository.list_all()]
        items.sort(key=lambda item: item["name"])
        return {"items": items, "total": len(items)}

    def get_relation(self, name: str) -> Dict[str, Any] | None:
        entity = self._relation_repository.get(name)
        return None if entity is None else entity.model_dump(mode="json")

    def save_relation(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        source_object_name = str(payload.get("source_object_name", "")).strip()
        target_object_name = str(payload.get("target_object_name", "")).strip()
        if not source_object_name or self._object_repository.get(source_object_name) is None:
            raise ValueError(f"业务关系引用了不存在的源业务对象: {source_object_name or '未提供'}")
        if not target_object_name or self._object_repository.get(target_object_name) is None:
            raise ValueError(f"业务关系引用了不存在的目标业务对象: {target_object_name or '未提供'}")
        entity = BusinessRelation(
            **{
                **payload,
                "source_object_name": source_object_name,
                "target_object_name": target_object_name,
                "aliases": self._dedupe(payload.get("aliases")),
            }
        )
        self._relation_repository.save(entity)
        self._record_history(
            entity_type="relation",
            entity_name=entity.name,
            action="saved",
            status=entity.status,
            summary=f"保存业务关系 {entity.title}",
        )
        return entity.model_dump(mode="json")

    def list_actions(self) -> Dict[str, Any]:
        items = [item.model_dump(mode="json") for item in self._action_repository.list_all()]
        items.sort(key=lambda item: item["name"])
        return {"items": items, "total": len(items)}

    def get_action(self, name: str) -> Dict[str, Any] | None:
        entity = self._action_repository.get(name)
        return None if entity is None else entity.model_dump(mode="json")

    def save_action(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        object_name = str(payload.get("object_name", "")).strip()
        if not object_name or self._object_repository.get(object_name) is None:
            raise ValueError(f"业务动作引用了不存在的业务对象: {object_name or '未提供'}")
        trigger_time_property = str(payload.get("trigger_time_property", "")).strip()
        if trigger_time_property:
            property_entity = self._property_repository.get(trigger_time_property)
            if property_entity is None:
                raise ValueError(f"业务动作引用了不存在的时间属性: {trigger_time_property}")
            if property_entity.object_name != object_name:
                raise ValueError(
                    f"业务动作的时间属性不属于当前业务对象: {trigger_time_property} -> {property_entity.object_name}"
                )
        entity = BusinessAction(
            **{
                **payload,
                "object_name": object_name,
                "trigger_time_property": trigger_time_property or None,
                "aliases": self._dedupe(payload.get("aliases")),
                "event_cube_refs": self._dedupe(payload.get("event_cube_refs")),
            }
        )
        self._action_repository.save(entity)
        self._record_history(
            entity_type="action",
            entity_name=entity.name,
            action="saved",
            status=entity.status,
            summary=f"保存业务动作 {entity.title}",
        )
        return entity.model_dump(mode="json")

    def list_policies(self) -> Dict[str, Any]:
        items = [item.model_dump(mode="json") for item in self._policy_repository.list_all()]
        items.sort(key=lambda item: item["name"])
        return {"items": items, "total": len(items)}

    def get_policy(self, name: str) -> Dict[str, Any] | None:
        entity = self._policy_repository.get(name)
        return None if entity is None else entity.model_dump(mode="json")

    def entity_status(self, entity_type: str, entity_name: str) -> str | None:
        _, repository, _ = self._entity_repo_and_dump(entity_type)
        entity = repository.get(entity_name)
        if entity is None:
            return None
        return getattr(entity, "status", None)

    def save_policy(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        target_type = str(payload.get("target_type", "")).strip()
        target_name = str(payload.get("target_name", "")).strip()
        if not target_type:
            raise ValueError("语义权限缺少 target_type")
        if not target_name:
            raise ValueError("语义权限缺少 target_name")
        target_repo = {
            "object": self._object_repository,
            "property": self._property_repository,
            "metric": self._metric_repository,
            "action": self._action_repository,
        }.get(target_type)
        if target_repo is None:
            raise ValueError(f"不支持的权限目标类型: {target_type}")
        if target_repo.get(target_name) is None:
            raise ValueError(f"语义权限引用了不存在的目标: {target_type}.{target_name}")
        entity = PolicyMetadata(
            **{
                **payload,
                "target_type": target_type,
                "target_name": target_name,
                "allowed_roles": self._dedupe(payload.get("allowed_roles")),
            }
        )
        self._policy_repository.save(entity)
        self._record_history(
            entity_type="policy",
            entity_name=entity.name,
            action="saved",
            status=entity.status,
            summary=f"保存语义权限 {entity.name}",
        )
        return entity.model_dump(mode="json")

    def publish_entity(self, entity_type: str, entity_name: str, validation: Dict[str, Any] | None = None) -> Dict[str, Any]:
        canonical_type, repository, getter = self._entity_repo_and_dump(entity_type)
        entity = repository.get(entity_name)
        if entity is None:
            raise ValueError(f"未找到要发布的 Ontology 资产: {entity_type}.{entity_name}")
        validation = validation or {}
        issues = validation.get("issues") or []
        if issues:
            raise ValueError("发布校验未通过: " + "；".join(str(issue) for issue in issues))
        if hasattr(entity, "status"):
            entity = entity.model_copy(update={"status": "active"})
            repository.save(entity)
        self._record_history(
            entity_type=canonical_type,
            entity_name=entity_name,
            action="published",
            status=getattr(entity, "status", "active"),
            summary=f"发布 {entity_type}.{entity_name}",
            validation=validation,
        )
        return getter(entity_name) or entity.model_dump(mode="json")

    def history(self, entity_type: str, entity_name: str) -> Dict[str, Any]:
        canonical_type, _, _ = self._entity_repo_and_dump(entity_type)
        items = [item.model_dump(mode="json") for item in self._history_repository.list_by_entity(canonical_type, entity_name)]
        return {
            "entity_type": canonical_type,
            "entity_name": entity_name,
            "items": items,
            "total": len(items),
        }

    def get_template(self, template_name: str) -> Dict[str, Any]:
        if template_name != "order-domain":
            raise ValueError(f"未找到 Ontology 模板: {template_name}")
        template = self._order_domain_template()
        summary = {entity_type: len(items) for entity_type, items in template.items()}
        return {
            "name": template_name,
            "title": "订单域模板",
            "description": "提供订单域的对象、属性、业务指标、关系、动作、术语和权限的最小标准样板。",
            "summary": summary,
            "items": template,
        }

    def apply_template(self, template_name: str) -> Dict[str, Any]:
        template = self.get_template(template_name)
        created: dict[str, list[str]] = {key: [] for key in template["items"].keys()}
        skipped: dict[str, list[str]] = {key: [] for key in template["items"].keys()}

        for payload in template["items"]["objects"]:
            if self._object_repository.get(payload["name"]) is None:
                self.save_object(payload)
                created["objects"].append(payload["name"])
            else:
                skipped["objects"].append(payload["name"])

        for payload in template["items"]["properties"]:
            if self._property_repository.get(payload["name"]) is None:
                self.save_property(payload)
                created["properties"].append(payload["name"])
            else:
                skipped["properties"].append(payload["name"])

        for payload in template["items"]["metrics"]:
            if self._metric_repository.get(payload["name"]) is None:
                self.save_metric(payload)
                created["metrics"].append(payload["name"])
            else:
                skipped["metrics"].append(payload["name"])

        for payload in template["items"]["relations"]:
            if self._relation_repository.get(payload["name"]) is None:
                self.save_relation(payload)
                created["relations"].append(payload["name"])
            else:
                skipped["relations"].append(payload["name"])

        for payload in template["items"]["actions"]:
            if self._action_repository.get(payload["name"]) is None:
                self.save_action(payload)
                created["actions"].append(payload["name"])
            else:
                skipped["actions"].append(payload["name"])

        for payload in template["items"]["glossary"]:
            if self._glossary_repository.get(payload["canonical_name"]) is None:
                self.save_glossary(payload)
                created["glossary"].append(payload["canonical_name"])
            else:
                skipped["glossary"].append(payload["canonical_name"])

        for payload in template["items"]["policies"]:
            if self._policy_repository.get(payload["name"]) is None:
                self.save_policy(payload)
                created["policies"].append(payload["name"])
            else:
                skipped["policies"].append(payload["name"])

        total_created = sum(len(items) for items in created.values())
        total_skipped = sum(len(items) for items in skipped.values())
        return {
            "template": template["name"],
            "title": template["title"],
            "created": created,
            "skipped": skipped,
            "summary": {
                "created": total_created,
                "skipped": total_skipped,
            },
        }
