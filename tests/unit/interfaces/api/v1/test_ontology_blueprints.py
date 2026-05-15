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
    return _AppWithAuthClient(app)


class _AppWithAuthClient:
    """Flask app 包装器：``.test_client()`` 默认携带 admin Bearer Token。

    这些 unit 测试直接构造 blueprint 并调用 ``test_client()``，
    在路由开启 ``@require_auth`` / ``@require_admin`` 之后，需要默认带 token。
    """

    def __init__(self, app):
        self._app = app

    def test_client(self):
        from tests.conftest import install_default_admin_auth
        return install_default_admin_auth(self._app.test_client(), roles=("admin", "platform_admin"))

    def __getattr__(self, name):
        return getattr(self._app, name)


def test_ontology_blueprint_covers_success_paths():
    service = MagicMock()
    mapper = MagicMock()
    workbench = MagicMock()
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
    workbench.list_objects.return_value = {
        "items": [{"name": "order", "title": "订单", "stats": {"metric_count": 1}}],
        "total": 1,
    }
    workbench.get_object_overview.return_value = {
        "object": {"name": "order", "title": "订单"},
        "stats": {"metric_count": 1},
        "capabilities": {"properties": [], "actions": []},
        "associations": {"metrics": [], "relations": [], "rules": []},
        "governance": {"stale_items": [], "consistency_items": [], "audit_total": 0, "recent_audits": []},
        "lifecycle": {"history_items": [], "history_total": 0, "last_activity": None},
    }
    workbench.get_governance_summary.return_value = {
        "summary": {"policy_total": 1, "stale_count": 0, "consistency_count": 0, "audit_total": 0},
        "items": [],
        "stale_items": [],
        "consistency_items": [],
        "recent_audits": [],
    }

    client = _build_app(create_ontology_blueprint(service, mapper, None, workbench)).test_client()

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
    assert client.get("/api/v1/ontology/workbench/objects").status_code == 200
    assert client.get("/api/v1/ontology/workbench/objects/order/overview").status_code == 200
    assert client.get("/api/v1/ontology/workbench/governance").status_code == 200
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


def test_ontology_blueprint_publish_impact_and_history_cover_extended_semantic_paths():
    service = MagicMock()
    mapper = MagicMock()
    audit_repository = MagicMock()
    workbench = MagicMock()

    active_entities = {
        ("objects", "order"),
        ("objects", "customer"),
        ("properties", "pay_time"),
        ("metrics", "gmv"),
        ("relations", "order_customer"),
        ("actions", "payment"),
        ("glossary", "gmv_alias"),
        ("policies", "gmv_policy"),
    }
    service.entity_status.side_effect = lambda entity_type, entity_name: "active" if (entity_type, entity_name) in active_entities else "draft"
    service.get_object.side_effect = lambda name: {"name": name, "title": "订单"} if name == "order" else {"name": name, "title": "客户"} if name == "customer" else None
    service.get_property.return_value = {"name": "pay_time", "object_name": "order"}
    service.get_metric.return_value = {
        "name": "gmv",
        "object_name": "order",
        "semantic_formula": "已支付订单金额之和",
        "measure_refs": ["orders.gmv"],
    }
    service.get_relation.return_value = {
        "name": "order_customer",
        "source_object_name": "order",
        "target_object_name": "customer",
    }
    service.get_action.return_value = {
        "name": "payment",
        "object_name": "order",
        "trigger_time_property": "pay_time",
        "event_cube_refs": ["payment_events"],
    }
    service.get_glossary.return_value = {
        "canonical_name": "gmv",
        "entry_type": "metric",
    }
    service.get_policy.return_value = {
        "name": "gmv_policy",
        "target_type": "metric",
        "target_name": "gmv",
        "visibility": "restricted",
        "allowed_roles": ["finance"],
    }
    service.publish_entity.side_effect = lambda entity_type, entity_name, validation=None: {
        "entity_type": entity_type,
        "entity_name": entity_name,
        "status": "active",
        "validation": validation,
    }
    service.history.side_effect = lambda entity_type, entity_name: {
        "entity_type": entity_type,
        "entity_name": entity_name,
        "items": [{"version": 1, "status": "active"}],
    }

    mapper.preview.side_effect = lambda entity_type, entity_name: {
        "projection": {
            "targets": (
                [{"target_name": "orders"}]
                if entity_type == "object"
                else [{"target_name": "orders.gmv"}]
                if entity_type == "metric"
                else [{"join_path": "orders.customers"}]
                if entity_type == "relation"
                else [{"target_name": "payment_events"}]
                if entity_type == "action"
                else [{"target_name": "gmv"}]
            )
        },
        "consistency": {"status": "ok", "issues": []},
        "traceability": {"entity_type": entity_type, "entity_name": entity_name},
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
    audit_repository.list_filtered.return_value = [
        MagicMock(model_dump=MagicMock(return_value={"id": "audit-1", "decision": "allow", "target_name": "gmv"}))
    ]

    client = _build_app(create_ontology_blueprint(service, mapper, audit_repository, workbench)).test_client()

    metric_publish = client.post("/api/v1/ontology/metrics/gmv/publish")
    assert metric_publish.status_code == 200
    assert metric_publish.get_json()["data"]["validation"]["preview_status"] == "ok"

    relation_publish = client.post("/api/v1/ontology/relations/order_customer/publish")
    assert relation_publish.status_code == 200

    action_publish = client.post("/api/v1/ontology/actions/payment/publish")
    assert action_publish.status_code == 200

    glossary_publish = client.post("/api/v1/ontology/glossary/gmv_alias/publish")
    assert glossary_publish.status_code == 200

    policy_publish = client.post("/api/v1/ontology/policies/gmv_policy/publish")
    assert policy_publish.status_code == 200

    object_impact = client.get("/api/v1/ontology/objects/order/impact")
    assert object_impact.status_code == 200
    assert object_impact.get_json()["data"]["projection"]["targets"][0]["target_name"] == "orders"

    property_impact = client.get("/api/v1/ontology/properties/pay_time/impact")
    assert property_impact.status_code == 200
    assert property_impact.get_json()["data"]["consistency"]["status"] == "pending"

    policy_impact = client.get("/api/v1/ontology/policies/gmv_policy/impact")
    assert policy_impact.status_code == 200

    policy_audit = client.get(
        "/api/v1/ontology/policies/gmv_policy/audit",
        query_string={"target_type": "metric", "target_name": "gmv", "decision": "allow", "route_type": "cube"},
    )
    assert policy_audit.status_code == 200
    assert policy_audit.get_json()["data"]["total"] == 1

    metric_history = client.get("/api/v1/ontology/metrics/gmv/history")
    assert metric_history.status_code == 200
    assert metric_history.get_json()["data"]["items"][0]["status"] == "active"


def test_ontology_blueprint_reports_missing_services_and_invalid_entities():
    service = MagicMock()
    service.get_metric.return_value = {"name": "gmv"}
    service.get_policy.return_value = {"name": "gmv_policy"}
    service.get_property.return_value = {"name": "pay_time"}

    client = _build_app(create_ontology_blueprint(service, None, None, None)).test_client()

    assert client.get("/api/v1/ontology/metrics/gmv/links").status_code == 400
    assert client.get("/api/v1/ontology/policies/gmv_policy/impact").status_code == 400
    assert client.get("/api/v1/ontology/policies/gmv_policy/audit").status_code == 400

    invalid_publish = client.post("/api/v1/ontology/unknown/ghost/publish")
    assert invalid_publish.status_code == 400
    assert "不支持的 Ontology 资产类型" in invalid_publish.get_json()["message"]

    property_impact = client.get("/api/v1/ontology/properties/pay_time/impact")
    assert property_impact.status_code == 400
    assert "当前未启用语义投影能力" in property_impact.get_json()["message"]


def test_ontology_blueprint_covers_not_found_and_create_template_error_paths():
    service = MagicMock()
    service.get_object.return_value = None
    service.get_property.return_value = None
    service.get_metric.return_value = None
    service.get_glossary.return_value = None
    service.get_relation.return_value = None
    service.get_action.return_value = None
    service.get_policy.return_value = None
    service.save_object.side_effect = ValueError("bad object")
    service.save_glossary.side_effect = ValueError("bad glossary")
    service.save_relation.side_effect = ValueError("bad relation")
    service.save_action.side_effect = ValueError("bad action")
    service.save_policy.side_effect = ValueError("bad policy")
    service.get_template.side_effect = ValueError("missing template")
    service.apply_template.side_effect = ValueError("apply failed")

    client = _build_app(create_ontology_blueprint(service, MagicMock(), None, None)).test_client()

    assert client.get("/api/v1/ontology/objects/order").status_code == 404
    assert client.get("/api/v1/ontology/properties/pay_time").status_code == 404
    assert client.get("/api/v1/ontology/metrics/gmv").status_code == 404
    assert client.get("/api/v1/ontology/glossary/gmv").status_code == 404
    assert client.get("/api/v1/ontology/relations/order_customer").status_code == 404
    assert client.get("/api/v1/ontology/actions/pay").status_code == 404
    assert client.get("/api/v1/ontology/policies/gmv_policy").status_code == 404
    assert client.get("/api/v1/ontology/policies/gmv_policy/audit").status_code == 404

    assert client.post("/api/v1/ontology/objects", json={"name": "order"}).status_code == 400
    assert client.post("/api/v1/ontology/glossary", json={"term": "GMV"}).status_code == 400
    assert client.post("/api/v1/ontology/relations", json={"name": "rel"}).status_code == 400
    assert client.post("/api/v1/ontology/actions", json={"name": "pay"}).status_code == 400
    assert client.post("/api/v1/ontology/policies", json={"name": "gmv_policy"}).status_code == 400


def test_ontology_blueprint_workbench_routes_cover_not_found_and_error_paths():
    service = MagicMock()
    mapper = MagicMock()
    workbench = MagicMock()
    service.get_template.side_effect = ValueError("missing template")
    service.apply_template.side_effect = ValueError("apply failed")
    workbench.list_objects.return_value = {"items": [], "total": 0}
    workbench.get_object_overview.return_value = None
    workbench.get_governance_summary.side_effect = ValueError("governance summary failed")

    client = _build_app(create_ontology_blueprint(service, mapper, None, workbench)).test_client()

    list_resp = client.get("/api/v1/ontology/workbench/objects")
    assert list_resp.status_code == 200
    assert list_resp.get_json()["data"]["total"] == 0

    overview_resp = client.get("/api/v1/ontology/workbench/objects/missing/overview")
    assert overview_resp.status_code == 404

    governance_resp = client.get("/api/v1/ontology/workbench/governance")
    assert governance_resp.status_code == 400

    template_resp = client.get("/api/v1/ontology/templates/ghost")
    assert template_resp.status_code == 400

    apply_resp = client.post("/api/v1/ontology/templates/ghost/apply")
    assert apply_resp.status_code == 400

    assert client.get("/api/v1/ontology/templates/ghost").status_code == 400
    assert client.post("/api/v1/ontology/templates/ghost/apply").status_code == 400


def test_ontology_blueprint_covers_publish_validation_and_impact_history_error_paths():
    def _client(service, mapper=None, audit_repository=None):
        return _build_app(create_ontology_blueprint(service, mapper, audit_repository)).test_client()

    def _fail_publish(_entity_type, _entity_name, validation=None):
        issues = (validation or {}).get("issues") or []
        raise ValueError("；".join(issues) or "validation failed")

    mapper = MagicMock()

    metric_service = MagicMock()
    metric_service.get_metric.side_effect = [{"name": "gmv"}, {"name": "gmv", "semantic_formula": "", "measure_refs": [], "object_name": ""}]
    metric_service.publish_entity.side_effect = _fail_publish
    metric_client = _client(metric_service, mapper)
    mapper.preview.return_value = {"consistency": {"status": "warning", "issues": ["Measure 未绑定"]}}
    metric_publish = metric_client.post("/api/v1/ontology/metrics/gmv/publish")
    assert metric_publish.status_code == 400
    assert "业务指标缺少语义公式" in metric_publish.get_json()["message"]

    object_service = MagicMock()
    object_service.get_object.side_effect = [{"name": "order"}, {"name": "order"}]
    object_service.publish_entity.side_effect = _fail_publish
    object_client = _client(object_service, mapper)
    mapper.preview.return_value = {"projection": {"targets": []}, "consistency": {"status": "warning", "issues": ["对象投影不完整"]}}
    object_publish = object_client.post("/api/v1/ontology/objects/order/publish")
    assert object_publish.status_code == 400
    assert "业务对象尚未投影到任何分析实体" in object_publish.get_json()["message"]

    property_service = MagicMock()
    property_service.get_property.side_effect = [{"name": "pay_time"}, {"name": "pay_time", "object_name": ""}]
    property_service.publish_entity.side_effect = _fail_publish
    property_client = _client(property_service, mapper)
    property_publish = property_client.post("/api/v1/ontology/properties/pay_time/publish")
    assert property_publish.status_code == 400
    assert "业务属性缺少归属对象" in property_publish.get_json()["message"]

    relation_service = MagicMock()
    relation_service.get_relation.side_effect = [
        {"name": "order_customer"},
        {"name": "order_customer", "source_object_name": "order", "target_object_name": "customer"},
    ]
    relation_service.entity_status.return_value = "draft"
    relation_service.publish_entity.side_effect = _fail_publish
    relation_client = _client(relation_service, mapper)
    mapper.preview.return_value = {"consistency": {"status": "warning", "issues": ["关联路径缺失"]}}
    relation_publish = relation_client.post("/api/v1/ontology/relations/order_customer/publish")
    assert relation_publish.status_code == 400
    assert "业务关系的源对象尚未发布" in relation_publish.get_json()["message"]

    action_service = MagicMock()
    action_service.get_action.side_effect = [
        {"name": "pay"},
        {"name": "pay", "object_name": "order", "trigger_time_property": "pay_time", "event_cube_refs": []},
    ]
    action_service.entity_status.return_value = "draft"
    action_service.publish_entity.side_effect = _fail_publish
    action_client = _client(action_service, mapper)
    mapper.preview.return_value = {"consistency": {"status": "warning", "issues": ["事件事实未绑定"]}}
    action_publish = action_client.post("/api/v1/ontology/actions/pay/publish")
    assert action_publish.status_code == 400
    assert "业务动作发布前至少关联一个事件事实 Cube" in action_publish.get_json()["message"]

    glossary_service = MagicMock()
    glossary_service.get_glossary.side_effect = [
        {"canonical_name": "gmv_alias"},
        {"canonical_name": "gmv", "entry_type": "metric"},
    ]
    glossary_service.get_metric.return_value = None
    glossary_service.publish_entity.side_effect = _fail_publish
    glossary_client = _client(glossary_service, mapper)
    glossary_publish = glossary_client.post("/api/v1/ontology/glossary/gmv_alias/publish")
    assert glossary_publish.status_code == 400
    assert "术语引用的语义资产不存在" in glossary_publish.get_json()["message"]

    policy_service = MagicMock()
    policy_service.get_policy.side_effect = [
        {"name": "gmv_policy"},
        {"name": "gmv_policy", "target_type": "glossary", "target_name": "gmv", "visibility": "private", "allowed_roles": []},
    ]
    policy_service.publish_entity.side_effect = _fail_publish
    policy_client = _client(policy_service, mapper)
    mapper.policy_impact.return_value = {"projection_status": "warning", "issues": ["权限影响未完成"]}
    policy_publish = policy_client.post("/api/v1/ontology/policies/gmv_policy/publish")
    assert policy_publish.status_code == 400
    assert "不支持的目标类型" in policy_publish.get_json()["message"]

    missing_policy_service = MagicMock()
    missing_policy_service.get_policy.return_value = None
    missing_policy_client = _client(missing_policy_service, mapper)
    assert missing_policy_client.get("/api/v1/ontology/policies/ghost/impact").status_code == 404

    impact_error_service = MagicMock()
    impact_error_service.get_policy.return_value = {"name": "gmv_policy"}
    impact_error_client = _client(impact_error_service, mapper)
    mapper.policy_impact.side_effect = ValueError("impact failed")
    assert impact_error_client.get("/api/v1/ontology/policies/gmv_policy/impact").status_code == 400

    invalid_entity_service = MagicMock()
    invalid_entity_client = _client(invalid_entity_service, mapper)
    assert invalid_entity_client.get("/api/v1/ontology/unknown/ghost/impact").status_code == 400
    assert invalid_entity_client.get("/api/v1/ontology/unknown/ghost/history").status_code == 400

    missing_history_service = MagicMock()
    missing_history_service.get_object.return_value = None
    missing_history_client = _client(missing_history_service, mapper)
    assert missing_history_client.get("/api/v1/ontology/objects/ghost/history").status_code == 404

    history_error_service = MagicMock()
    history_error_service.get_object.return_value = {"name": "order"}
    history_error_service.history.side_effect = ValueError("history failed")
    history_error_client = _client(history_error_service, mapper)
    assert history_error_client.get("/api/v1/ontology/objects/order/history").status_code == 400
