from __future__ import annotations

from unittest.mock import MagicMock

from flask import Flask

from app.interfaces.api.middleware.error_handler import register_error_handlers
from app.interfaces.api.v1.execution_compiler import create_execution_compiler_blueprint
from app.interfaces.api.v1.governance import create_governance_blueprint
from app.interfaces.api.v1.ontology import create_ontology_blueprint
from app.interfaces.api.v1.semantic_mapper import create_semantic_mapper_blueprint


def _build_app(*blueprints):
    app = Flask(__name__)
    app.config.update(TESTING=True)
    register_error_handlers(app)
    for blueprint in blueprints:
        app.register_blueprint(blueprint)
    return app


def test_ontology_blueprint_covers_success_paths():
    service = MagicMock()
    mapper = MagicMock()
    service.list_objects.return_value = {"items": [], "total": 0}
    service.get_object.return_value = {"name": "order"}
    service.save_object.return_value = {"name": "order"}
    service.list_properties.return_value = {"items": [], "total": 0}
    service.get_property.return_value = {"name": "amount"}
    service.save_property.return_value = {"name": "amount", "property_type": "number"}
    service.list_metrics.return_value = {"items": [], "total": 0}
    service.get_metric.return_value = {"name": "gmv"}
    service.save_metric.return_value = {"name": "gmv", "semantic_formula": "已支付订单金额之和"}
    mapper.metric_links.return_value = {
        "metric_name": "gmv",
        "linked_measures": [{"measure_ref": "orders.gmv", "status": "linked"}],
        "linked_cubes": [{"cube_name": "orders"}],
    }
    service.list_glossary.return_value = {"items": [], "total": 0}
    service.get_glossary.return_value = {"canonical_name": "gmv"}
    service.save_glossary.return_value = {"canonical_name": "gmv", "entry_type": "metric"}
    service.list_relations.return_value = {"items": [], "total": 0}
    service.get_relation.return_value = {"name": "order_customer"}
    service.save_relation.return_value = {"name": "order_customer", "relation_type": "belongs_to"}
    service.list_actions.return_value = {"items": [], "total": 0}
    service.get_action.return_value = {"name": "payment"}
    service.save_action.return_value = {"name": "payment", "object_name": "order"}
    service.list_policies.return_value = {"items": [], "total": 0}
    service.get_policy.return_value = {"name": "gmv_policy"}
    service.save_policy.return_value = {
        "name": "gmv_policy",
        "target_type": "metric",
        "target_name": "gmv",
        "visibility": "restricted",
        "allowed_roles": ["finance"],
    }
    service.get_template.return_value = {
        "name": "order-domain",
        "title": "订单域模板",
        "summary": {"objects": 2},
        "items": {"objects": [{"name": "order"}]},
    }
    service.apply_template.return_value = {
        "template": "order-domain",
        "title": "订单域模板",
        "created": {"objects": ["order"]},
        "skipped": {},
        "summary": {"created": 1, "skipped": 0},
    }
    mapper.policy_impact.return_value = {
        "target_type": "metric",
        "target_name": "gmv",
        "projection_status": "ok",
        "linked_entity_count": 2,
        "analysis_links": {
            "measures": [{"measure_ref": "orders.gmv"}],
            "cubes": [{"cube_name": "orders"}],
            "join_paths": [],
            "event_cubes": [],
        },
        "governance_hooks": [{"hook": "semantic-router", "status": "active", "effect": "route-block"}],
        "issues": [],
    }

    client = _build_app(create_ontology_blueprint(service, mapper)).test_client()

    assert client.get("/api/v1/ontology/objects").status_code == 200
    assert client.get("/api/v1/ontology/objects/order").status_code == 200
    assert client.post("/api/v1/ontology/objects", json={"name": "order", "title": "订单"}).status_code == 201

    assert client.get("/api/v1/ontology/properties").status_code == 200
    assert client.get("/api/v1/ontology/properties/amount").status_code == 200
    assert client.post("/api/v1/ontology/properties", json={"name": "amount", "title": "金额", "object_name": "order"}).status_code == 201

    assert client.get("/api/v1/ontology/metrics").status_code == 200
    assert client.get("/api/v1/ontology/metrics/gmv").status_code == 200
    assert client.post("/api/v1/ontology/metrics", json={"name": "gmv", "title": "GMV", "object_name": "order", "semantic_formula": "已支付订单金额之和"}).status_code == 201
    assert client.get("/api/v1/ontology/metrics/gmv/links").status_code == 200

    assert client.get("/api/v1/ontology/glossary").status_code == 200
    assert client.get("/api/v1/ontology/glossary/gmv").status_code == 200
    assert client.post("/api/v1/ontology/glossary", json={"term": "GMV", "canonical_name": "gmv"}).status_code == 201

    assert client.get("/api/v1/ontology/relations").status_code == 200
    assert client.get("/api/v1/ontology/relations/order_customer").status_code == 200
    assert client.post("/api/v1/ontology/relations", json={"name": "order_customer", "title": "订单归属客户", "source_object_name": "order", "target_object_name": "customer"}).status_code == 201

    assert client.get("/api/v1/ontology/actions").status_code == 200
    assert client.get("/api/v1/ontology/actions/payment").status_code == 200
    assert client.post("/api/v1/ontology/actions", json={"name": "payment", "title": "支付", "object_name": "order"}).status_code == 201

    assert client.get("/api/v1/ontology/policies").status_code == 200
    assert client.get("/api/v1/ontology/policies/gmv_policy").status_code == 200
    assert client.get("/api/v1/ontology/policies/gmv_policy/impact").status_code == 200
    assert client.get("/api/v1/ontology/templates/order-domain").status_code == 200
    assert client.post("/api/v1/ontology/templates/order-domain/apply").status_code == 200
    assert client.post(
        "/api/v1/ontology/policies",
        json={"name": "gmv_policy", "target_type": "metric", "target_name": "gmv", "allowed_roles": ["finance"]},
    ).status_code == 201


def test_mapper_and_compiler_blueprints_cover_error_paths():
    mapper = MagicMock()
    mapper.preview.side_effect = ValueError("unknown object")
    mapper.stale_check.return_value = {"summary": {"stale_count": 1}, "items": []}
    mapper.consistency_report.return_value = {"summary": {"issue_count": 1}, "items": []}
    mapper.diff.return_value = {"items": [], "total": 0}
    mapper.measure_backlinks.return_value = {"status": "orphan", "linked_metrics": []}
    mapper.cube_backlinks.return_value = {"status": "orphan", "linked_objects": [], "linked_metrics": []}

    compiler = MagicMock()
    compiler.compile_preview.side_effect = ValueError("unknown metric")
    compiler.compile_plan_preview.side_effect = ValueError("unknown metric")
    compiler.execute.side_effect = ValueError("unknown metric")

    client = _build_app(
        create_semantic_mapper_blueprint(mapper),
        create_execution_compiler_blueprint(compiler),
    ).test_client()

    assert client.post("/api/v1/semantic-mapper/preview", json={}).status_code == 400
    assert client.post("/api/v1/semantic-mapper/preview", json={"entity_type": "object", "entity_name": "ghost"}).status_code == 400
    assert client.get("/api/v1/semantic-mapper/stale-check").status_code == 200
    assert client.get("/api/v1/semantic-mapper/consistency-report").status_code == 200
    assert client.get("/api/v1/semantic-mapper/diff").status_code == 200
    assert client.get("/api/v1/semantic-mapper/measure-backlinks", query_string={"measure_ref": "orders.gmv"}).status_code == 200
    assert client.get("/api/v1/semantic-mapper/measure-backlinks").status_code == 400
    assert client.get("/api/v1/semantic-mapper/cube-backlinks", query_string={"cube_name": "orders"}).status_code == 200
    assert client.get("/api/v1/semantic-mapper/cube-backlinks").status_code == 400

    assert client.post("/api/v1/execution-compiler/compile-preview", json={}).status_code == 400
    assert client.post("/api/v1/execution-compiler/compile-preview", json={"metric_name": "ghost"}).status_code == 400
    assert client.post("/api/v1/execution-compiler/plan-preview", json={}).status_code == 400
    assert client.post("/api/v1/execution-compiler/execute", json={"metric_name": "ghost"}).status_code == 400


def test_governance_blueprint_supports_filtered_audit_queries():
    audit_repository = MagicMock()
    audit_repository.list_filtered.return_value = [
        MagicMock(model_dump=MagicMock(return_value={"id": "audit-1", "decision": "allow", "target_name": "gmv"}))
    ]
    audit_repository.get.return_value = MagicMock(
        model_dump=MagicMock(return_value={"id": "audit-1", "decision": "allow", "target_name": "gmv"})
    )

    client = _build_app(create_governance_blueprint(audit_repository)).test_client()

    list_resp = client.get(
        "/api/v1/governance/audit-traces",
        query_string={
            "policy": "gmv_policy",
            "target_type": "metric",
            "target_name": "gmv",
            "decision": "allow",
            "route_type": "direct",
        },
    )
    assert list_resp.status_code == 200
    audit_repository.list_filtered.assert_called_once_with(
        policy_name="gmv_policy",
        target_type="metric",
        target_name="gmv",
        decision="allow",
        route_type="direct",
    )

    detail_resp = client.get("/api/v1/governance/audit-traces/audit-1")
    assert detail_resp.status_code == 200
