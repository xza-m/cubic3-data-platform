from __future__ import annotations

import pytest

from app.application.ontology.definition_service import OntologyDefinitionService
from app.infrastructure.ontology.yaml_action_repository import YamlBusinessActionRepository
from app.infrastructure.ontology.yaml_glossary_repository import YamlGlossaryRepository
from app.infrastructure.ontology.yaml_history_repository import YamlOntologyHistoryRepository
from app.infrastructure.ontology.yaml_metric_repository import YamlBusinessMetricRepository
from app.infrastructure.ontology.yaml_object_repository import YamlBusinessObjectRepository
from app.infrastructure.ontology.yaml_policy_repository import YamlPolicyMetadataRepository
from app.infrastructure.ontology.yaml_property_repository import YamlBusinessPropertyRepository
from app.infrastructure.ontology.yaml_relation_repository import YamlBusinessRelationRepository


def _build_service(tmp_path) -> OntologyDefinitionService:
    return OntologyDefinitionService(
        object_repository=YamlBusinessObjectRepository(str(tmp_path / "objects")),
        property_repository=YamlBusinessPropertyRepository(str(tmp_path / "properties")),
        metric_repository=YamlBusinessMetricRepository(str(tmp_path / "metrics")),
        glossary_repository=YamlGlossaryRepository(str(tmp_path / "glossary")),
        relation_repository=YamlBusinessRelationRepository(str(tmp_path / "relations")),
        action_repository=YamlBusinessActionRepository(str(tmp_path / "actions")),
        policy_repository=YamlPolicyMetadataRepository(str(tmp_path / "policies")),
        history_repository=YamlOntologyHistoryRepository(str(tmp_path / "history")),
    )


def test_save_action_requires_trigger_time_property_to_exist_and_belong_to_object(tmp_path):
    service = _build_service(tmp_path)
    service.save_object({"name": "order", "title": "订单"})
    service.save_object({"name": "customer", "title": "客户"})
    service.save_property(
        {
            "name": "pay_time",
            "title": "支付时间",
            "object_name": "order",
            "property_type": "time",
        }
    )
    service.save_property(
        {
            "name": "signup_time",
            "title": "注册时间",
            "object_name": "customer",
            "property_type": "time",
        }
    )

    saved = service.save_action(
        {
            "name": "pay",
            "title": "支付",
            "object_name": "order",
            "trigger_time_property": "pay_time",
        }
    )
    assert saved["trigger_time_property"] == "pay_time"

    with pytest.raises(ValueError, match="不存在的时间属性"):
        service.save_action(
            {
                "name": "refund",
                "title": "退款",
                "object_name": "order",
                "trigger_time_property": "refund_time",
            }
        )

    with pytest.raises(ValueError, match="时间属性不属于当前业务对象"):
        service.save_action(
            {
                "name": "order_signup",
                "title": "订单注册",
                "object_name": "order",
                "trigger_time_property": "signup_time",
            }
        )


def test_save_policy_requires_existing_target(tmp_path):
    service = _build_service(tmp_path)
    service.save_object({"name": "order", "title": "订单"})

    saved = service.save_policy(
        {
            "name": "order_visibility",
            "target_type": "object",
            "target_name": "order",
            "visibility": "restricted",
            "allowed_roles": ["analyst", "analyst", "admin"],
        }
    )
    assert saved["target_name"] == "order"
    assert saved["allowed_roles"] == ["analyst", "admin"]

    with pytest.raises(ValueError, match="不存在的目标"):
        service.save_policy(
            {
                "name": "ghost_metric_policy",
                "target_type": "metric",
                "target_name": "ghost_metric",
                "visibility": "private",
            }
        )


def test_publish_entity_records_history_and_activates_status(tmp_path):
    service = _build_service(tmp_path)
    service.save_object({"name": "order", "title": "订单"})

    published = service.publish_entity("objects", "order", validation={"preview_status": "ok", "issues": []})
    assert published["status"] == "active"

    history = service.history("objects", "order")
    assert history["total"] == 2
    assert history["items"][0]["action"] == "published"
    assert history["items"][0]["validation"]["preview_status"] == "ok"
    assert history["items"][1]["action"] == "saved"


def test_apply_order_domain_template_creates_missing_assets_and_skips_existing(tmp_path):
    service = _build_service(tmp_path)

    first = service.apply_template("order-domain")
    assert first["template"] == "order-domain"
    assert first["summary"]["created"] == 10
    assert first["summary"]["skipped"] == 0
    assert "order" in first["created"]["objects"]
    assert "gmv" in first["created"]["metrics"]
    assert service.get_metric("gmv") is not None
    assert service.get_policy("gmv_policy") is not None

    second = service.apply_template("order-domain")
    assert second["summary"]["created"] == 0
    assert second["summary"]["skipped"] == 10
    assert "order" in second["skipped"]["objects"]
    assert "pay" in second["skipped"]["actions"]
