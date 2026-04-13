from __future__ import annotations

from flask import Flask

from app.application.execution_compiler.preview_service import ExecutionCompilerPreviewService
from app.application.execution_compiler.runtime_service import ExecutionCompilerRuntimeService
from app.application.ontology.policy_guard_service import PolicyGuardService
from app.application.semantic_mapper.preview_service import SemanticMapperPreviewService
from app.application.semantic_router.preview_service import SemanticRouterPreviewService
from app.domain.ontology.entities import (
    BusinessAction,
    BusinessMetric,
    BusinessObject,
    BusinessRelation,
    GlossaryEntry,
    PolicyMetadata,
)
from app.domain.semantic.entities import CubeDefinition, DimensionDef, JoinDef, MeasureDef
from app.infrastructure.ontology.yaml_action_repository import YamlBusinessActionRepository
from app.infrastructure.ontology.yaml_glossary_repository import YamlGlossaryRepository
from app.infrastructure.ontology.yaml_metric_repository import YamlBusinessMetricRepository
from app.infrastructure.ontology.yaml_object_repository import YamlBusinessObjectRepository
from app.infrastructure.ontology.yaml_policy_repository import YamlPolicyMetadataRepository
from app.infrastructure.ontology.yaml_relation_repository import YamlBusinessRelationRepository
from app.infrastructure.semantic.yaml_cube_repository import YamlCubeRepository
from app.interfaces.api.middleware.error_handler import register_error_handlers
from app.interfaces.api.v1.semantic_router import create_semantic_router_blueprint


def _build_client(tmp_path):
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    cube_repo.save(
        CubeDefinition(
            name="orders",
            title="订单",
            table="ods.orders",
            source_id=1,
            source_database="dw",
            dimensions={"status": DimensionDef(title="状态", type="string", sql="{CUBE}.status")},
            measures={"gmv": MeasureDef(title="GMV", type="sum", sql="{CUBE}.amount")},
            joins={
                "customers": JoinDef(
                    cube="customers",
                    relationship="N:1",
                    sql="{CUBE}.customer_id = customers.id",
                )
            },
        )
    )
    cube_repo.save(
        CubeDefinition(
            name="customers",
            title="客户",
            table="dim.customers",
            source_id=2,
            source_database="dw",
            dimensions={"id": DimensionDef(title="客户ID", type="string", sql="{CUBE}.id")},
            measures={"customer_count": MeasureDef(title="客户数", type="count", sql="{CUBE}.id")},
        )
    )
    cube_repo.save(
        CubeDefinition(
            name="payment_events",
            title="支付事件",
            table="dwd.payment_events",
            source_id=3,
            source_database="dw",
            dimensions={"event_time": DimensionDef(title="事件时间", type="time", sql="{CUBE}.event_time")},
            measures={"event_count": MeasureDef(title="事件数", type="count", sql="{CUBE}.event_time")},
        )
    )

    object_repo = YamlBusinessObjectRepository(str(tmp_path / "objects"))
    metric_repo = YamlBusinessMetricRepository(str(tmp_path / "metrics"))
    glossary_repo = YamlGlossaryRepository(str(tmp_path / "glossary"))
    relation_repo = YamlBusinessRelationRepository(str(tmp_path / "relations"))
    action_repo = YamlBusinessActionRepository(str(tmp_path / "actions"))
    policy_repo = YamlPolicyMetadataRepository(str(tmp_path / "policies"))

    object_repo.save(BusinessObject(name="order", title="订单"))
    object_repo.save(BusinessObject(name="customer", title="客户"))
    metric_repo.save(
        BusinessMetric(
            name="gmv",
            title="GMV",
            object_name="order",
            semantic_formula="已支付订单金额之和",
            measure_refs=["orders.gmv"],
            aliases=["成交额"],
        )
    )
    glossary_repo.save(GlossaryEntry(term="成交额", canonical_name="gmv", entry_type="metric"))
    relation_repo.save(
        BusinessRelation(
            name="order_customer",
            title="订单归属客户",
            source_object_name="order",
            target_object_name="customer",
            relation_type="belongs_to",
        )
    )
    action_repo.save(
        BusinessAction(
            name="payment",
            title="支付",
            object_name="order",
            event_cube_refs=["payment_events"],
        )
    )
    policy_repo.save(
        PolicyMetadata(
            name="gmv_policy",
            target_type="metric",
            target_name="gmv",
            visibility="restricted",
            allowed_roles=["finance"],
        )
    )

    compiler = ExecutionCompilerPreviewService(
        metric_repository=metric_repo,
        cube_repository=cube_repo,
        policy_guard_service=PolicyGuardService(policy_repository=policy_repo),
    )
    mapper = SemanticMapperPreviewService(
        object_repository=object_repo,
        metric_repository=metric_repo,
        glossary_repository=glossary_repo,
        relation_repository=relation_repo,
        action_repository=action_repo,
        cube_repository=cube_repo,
    )
    runtime = ExecutionCompilerRuntimeService(
        preview_service=compiler,
        execute_query_handler_factory=lambda: type(
            "FakeExecuteQueryHandler",
            (),
            {"handle": lambda self, command: {"columns": [{"name": "gmv", "type": "number"}], "data": [{"gmv": 100}], "row_count": 1}},
        )(),
    )
    router = SemanticRouterPreviewService(
        object_repository=object_repo,
        metric_repository=metric_repo,
        glossary_repository=glossary_repo,
        relation_repository=relation_repo,
        action_repository=action_repo,
        mapper_preview_service=mapper,
        compiler_preview_service=compiler,
        runtime_service=runtime,
        policy_guard_service=PolicyGuardService(policy_repository=policy_repo),
    )

    app = Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(create_semantic_router_blueprint(router))
    register_error_handlers(app)
    return app.test_client()


def test_semantic_router_api_returns_route_and_plan(tmp_path):
    client = _build_client(tmp_path)

    route_resp = client.post(
        "/api/v1/semantic-router/route",
        json={"question": "查看成交额趋势", "viewer_roles": ["finance"]},
    )
    assert route_resp.status_code == 200
    route_payload = route_resp.get_json()["data"]
    assert route_payload["route_type"] == "cube"
    assert route_payload["matched"]["metric_name"] == "gmv"

    plan_resp = client.post(
        "/api/v1/semantic-router/plan",
        json={"question": "解释GMV口径并查看趋势", "viewer_roles": ["finance"]},
    )
    assert plan_resp.status_code == 200
    plan_payload = plan_resp.get_json()["data"]
    assert plan_payload["route"]["route_type"] == "hybrid"
    assert isinstance(plan_payload["dependencies"], list)
    assert isinstance(plan_payload["expected_outputs"], list)
    assert plan_payload["steps"][0]["step_key"] == "semantic_match"
    assert plan_payload["steps"][0]["step_type"] == "semantic_match"
    assert plan_payload["steps"][0]["expected_output"] == "matched_entities"
    assert [item["target_type"] for item in plan_payload["execution_targets"]] == ["sql", "retrieval"]

    execute_plan_preview_resp = client.post(
        "/api/v1/semantic-router/execute-plan-preview",
        json={"question": "解释GMV口径并查看趋势", "viewer_roles": ["finance"]},
    )
    assert execute_plan_preview_resp.status_code == 200
    execute_plan_preview_payload = execute_plan_preview_resp.get_json()["data"]
    assert execute_plan_preview_payload["compiled_targets"][0]["preview"]["target_type"] == "sql"

    execute_plan_resp = client.post(
        "/api/v1/semantic-router/execute-plan",
        json={"question": "查看GMV趋势", "viewer_roles": ["finance"]},
    )
    assert execute_plan_resp.status_code == 200
    execute_plan_payload = execute_plan_resp.get_json()["data"]
    assert execute_plan_payload["execution_results"][0]["status"] == "executed"
    assert execute_plan_payload["execution_results"][0]["target_type"] == "sql"
    assert execute_plan_payload["execution_summary"]["executed"] == 1


def test_semantic_router_api_supports_relation_and_action(tmp_path):
    client = _build_client(tmp_path)

    relation_resp = client.post("/api/v1/semantic-router/route", json={"question": "分析订单归属客户关系"})
    assert relation_resp.status_code == 200
    relation_payload = relation_resp.get_json()["data"]
    assert relation_payload["route_type"] == "cube"
    assert relation_payload["matched"]["entity_type"] == "relation"
    assert relation_payload["projection_preview"]["projection"]["targets"][0]["join_path"] == "orders.customers"

    action_resp = client.post("/api/v1/semantic-router/route", json={"question": "触发支付通知"})
    assert action_resp.status_code == 200
    action_payload = action_resp.get_json()["data"]
    assert action_payload["route_type"] == "tool"
    assert action_payload["matched"]["entity_type"] == "action"

    blocked_metric_resp = client.post(
        "/api/v1/semantic-router/route",
        json={"question": "查看GMV趋势", "viewer_roles": ["analyst"]},
    )
    assert blocked_metric_resp.status_code == 200
    blocked_metric_payload = blocked_metric_resp.get_json()["data"]
    assert blocked_metric_payload["route_type"] == "blocked"
    assert blocked_metric_payload["policy"]["visibility"] == "restricted"


def test_semantic_router_api_returns_multi_intent_plan(tmp_path):
    client = _build_client(tmp_path)

    resp = client.post(
        "/api/v1/semantic-router/plan",
        json={"question": "解释GMV口径，分析订单归属客户关系，并触发支付"},
    )
    assert resp.status_code == 200
    payload = resp.get_json()["data"]
    assert payload["planning_mode"] == "multi_step"
    assert payload["route"]["route_type"] == "hybrid"
    assert payload["route"]["targets"] == ["knowledge", "cube", "tool"]
    assert {item["entity_type"] for item in payload["route"]["matched_entities"]} == {"metric", "relation", "action"}
