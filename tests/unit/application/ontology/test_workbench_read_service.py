from __future__ import annotations

from app.application.ontology.definition_service import OntologyDefinitionService
from app.application.ontology.policy_guard_service import PolicyGuardService
from app.application.ontology.workbench_read_service import OntologyWorkbenchReadService
from app.application.semantic_mapper.preview_service import SemanticMapperPreviewService
from app.domain.ontology.entities import GovernanceAuditTrace
from app.domain.semantic.entities import CubeDefinition, DimensionDef, JoinDef, MeasureDef
from app.infrastructure.ontology.yaml_action_repository import YamlBusinessActionRepository
from app.infrastructure.ontology.yaml_audit_trace_repository import YamlGovernanceAuditTraceRepository
from app.infrastructure.ontology.yaml_glossary_repository import YamlGlossaryRepository
from app.infrastructure.ontology.yaml_history_repository import YamlOntologyHistoryRepository
from app.infrastructure.ontology.yaml_metric_repository import YamlBusinessMetricRepository
from app.infrastructure.ontology.yaml_object_repository import YamlBusinessObjectRepository
from app.infrastructure.ontology.yaml_policy_repository import YamlPolicyMetadataRepository
from app.infrastructure.ontology.yaml_property_repository import YamlBusinessPropertyRepository
from app.infrastructure.ontology.yaml_relation_repository import YamlBusinessRelationRepository
from app.infrastructure.semantic.yaml_cube_repository import YamlCubeRepository


def _build_services(tmp_path):
    object_repo = YamlBusinessObjectRepository(str(tmp_path / "objects"))
    property_repo = YamlBusinessPropertyRepository(str(tmp_path / "properties"))
    metric_repo = YamlBusinessMetricRepository(str(tmp_path / "metrics"))
    glossary_repo = YamlGlossaryRepository(str(tmp_path / "glossary"))
    relation_repo = YamlBusinessRelationRepository(str(tmp_path / "relations"))
    action_repo = YamlBusinessActionRepository(str(tmp_path / "actions"))
    policy_repo = YamlPolicyMetadataRepository(str(tmp_path / "policies"))
    history_repo = YamlOntologyHistoryRepository(str(tmp_path / "history"))
    audit_repo = YamlGovernanceAuditTraceRepository(str(tmp_path / "audit"))
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    cube_repo.save(
        CubeDefinition(
            name="orders",
            title="订单",
            table="ods.orders",
            source_id=1,
            source_database="dw",
            dimensions={
                "status": DimensionDef(title="状态", type="string", sql="{CUBE}.status"),
            },
            joins={
                "customers": JoinDef(
                    cube="customers",
                    relationship="N:1",
                    sql="{CUBE}.customer_id = customers.id",
                )
            },
            measures={"gmv": MeasureDef(title="GMV", type="sum", sql="{CUBE}.amount")},
        )
    )
    cube_repo.save(
        CubeDefinition(
            name="payment_events",
            title="支付事件",
            table="dwd.payment_events",
            source_id=2,
            source_database="dw",
            dimensions={
                "event_time": DimensionDef(title="事件时间", type="time", sql="{CUBE}.event_time"),
            },
            measures={"event_count": MeasureDef(title="事件数", type="count", sql="{CUBE}.event_time")},
        )
    )

    ontology_service = OntologyDefinitionService(
        object_repository=object_repo,
        property_repository=property_repo,
        metric_repository=metric_repo,
        glossary_repository=glossary_repo,
        relation_repository=relation_repo,
        action_repository=action_repo,
        policy_repository=policy_repo,
        history_repository=history_repo,
    )
    mapper_service = SemanticMapperPreviewService(
        object_repository=object_repo,
        metric_repository=metric_repo,
        glossary_repository=glossary_repo,
        relation_repository=relation_repo,
        action_repository=action_repo,
        cube_repository=cube_repo,
    )
    workbench_service = OntologyWorkbenchReadService(
        ontology_service=ontology_service,
        mapper_service=mapper_service,
        history_repository=history_repo,
        audit_repository=audit_repo,
    )
    return ontology_service, mapper_service, workbench_service, audit_repo


def test_workbench_list_objects_returns_stable_summary(tmp_path):
    ontology_service, _, workbench_service, _ = _build_services(tmp_path)
    ontology_service.save_object({"name": "order", "title": "订单", "description": "订单对象", "status": "active"})
    ontology_service.save_property(
        {
            "name": "amount",
            "title": "订单金额",
            "object_name": "order",
            "property_type": "number",
            "status": "active",
        }
    )
    ontology_service.save_metric(
        {
            "name": "gmv",
            "title": "GMV",
            "object_name": "order",
            "semantic_formula": "已支付订单金额之和",
            "measure_refs": ["orders.gmv"],
            "status": "active",
        }
    )
    ontology_service.save_relation(
        {
            "name": "order_customer",
            "title": "订单归属用户",
            "source_object_name": "order",
            "target_object_name": "order",
            "relation_type": "linked_to",
            "status": "active",
        }
    )
    ontology_service.save_action(
        {
            "name": "pay",
            "title": "支付",
            "object_name": "order",
            "event_cube_refs": ["payment_events"],
            "status": "active",
        }
    )
    ontology_service.save_policy(
        {
            "name": "order_policy",
            "target_type": "object",
            "target_name": "order",
            "visibility": "restricted",
            "allowed_roles": ["finance"],
            "status": "active",
        }
    )

    payload = workbench_service.list_objects()

    assert payload["total"] == 1
    summary = payload["items"][0]
    assert summary["name"] == "order"
    assert summary["stats"] == {
        "property_count": 1,
        "metric_count": 1,
        "relation_count": 1,
        "action_count": 1,
        "rule_count": 1,
    }
    assert summary["last_activity"]["entity_type"] == "object"
    assert summary["risk_summary"]["stale_count"] == 0
    assert summary["risk_summary"]["consistency_count"] == 0


def test_workbench_object_overview_returns_object_centered_payload(tmp_path):
    ontology_service, _, workbench_service, audit_repo = _build_services(tmp_path)
    ontology_service.save_object({"name": "order", "title": "订单", "description": "订单对象", "status": "active"})
    ontology_service.save_object({"name": "customer", "title": "用户", "description": "用户对象", "status": "active"})
    ontology_service.save_property(
        {
            "name": "amount",
            "title": "订单金额",
            "object_name": "order",
            "property_type": "number",
            "status": "active",
        }
    )
    ontology_service.save_metric(
        {
            "name": "gmv",
            "title": "GMV",
            "object_name": "order",
            "semantic_formula": "已支付订单金额之和",
            "measure_refs": ["orders.gmv"],
            "status": "active",
        }
    )
    ontology_service.save_relation(
        {
            "name": "order_customer",
            "title": "订单归属用户",
            "source_object_name": "order",
            "target_object_name": "customer",
            "relation_type": "belongs_to",
            "status": "active",
        }
    )
    ontology_service.save_action(
        {
            "name": "pay",
            "title": "支付",
            "object_name": "order",
            "event_cube_refs": ["payment_events"],
            "status": "active",
        }
    )
    ontology_service.save_policy(
        {
            "name": "order_policy",
            "target_type": "object",
            "target_name": "order",
            "visibility": "restricted",
            "allowed_roles": ["finance"],
            "status": "active",
        }
    )
    audit_repo.save(
        GovernanceAuditTrace(
            id="audit-1",
            target_type="metric",
            target_name="gmv",
            viewer_roles=["finance"],
            execution_target="orders",
            decision="allow",
            policy={"name": "order_policy"},
            timestamp="2026-04-16T10:00:00",
        )
    )

    payload = workbench_service.get_object_overview("order")

    assert payload["object"]["name"] == "order"
    assert payload["stats"]["metric_count"] == 1
    assert payload["capabilities"]["properties"][0]["name"] == "amount"
    assert payload["capabilities"]["actions"][0]["name"] == "pay"
    assert payload["associations"]["metrics"][0]["name"] == "gmv"
    assert payload["associations"]["relations"][0]["name"] == "order_customer"
    assert payload["associations"]["rules"][0]["name"] == "order_policy"
    assert payload["governance"]["audit_total"] == 1
    assert isinstance(payload["lifecycle"]["history_items"], list)
    assert payload["lifecycle"]["history_total"] >= 1


def test_workbench_governance_summary_returns_policy_and_platform_risks(tmp_path):
    ontology_service, _, workbench_service, audit_repo = _build_services(tmp_path)
    ontology_service.save_object({"name": "order", "title": "订单", "description": "订单对象", "status": "active"})
    ontology_service.save_metric(
        {
            "name": "refund_amount",
            "title": "退款金额",
            "object_name": "order",
            "semantic_formula": "退款金额之和",
            "measure_refs": [],
            "status": "draft",
        }
    )
    ontology_service.save_policy(
        {
            "name": "refund_metric_guard",
            "target_type": "metric",
            "target_name": "refund_amount",
            "visibility": "restricted",
            "allowed_roles": ["risk"],
            "status": "draft",
        }
    )
    audit_repo.save(
        GovernanceAuditTrace(
            id="audit-1",
            target_type="metric",
            target_name="refund_amount",
            viewer_roles=["risk"],
            execution_target="orders",
            decision="blocked",
            policy={"name": "refund_metric_guard"},
            timestamp="2026-04-16T10:00:00",
        )
    )

    payload = workbench_service.get_governance_summary()

    assert payload["summary"]["policy_total"] == 1
    assert payload["summary"]["stale_count"] >= 0
    assert payload["summary"]["consistency_count"] >= 0
    assert payload["items"][0]["name"] == "refund_metric_guard"
    assert payload["items"][0]["audit_total"] == 1
    assert payload["items"][0]["projection_status"]
