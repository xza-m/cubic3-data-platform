from __future__ import annotations

from flask import Flask

from app.application.execution_compiler.preview_service import ExecutionCompilerPreviewService
from app.application.execution_compiler.runtime_service import ExecutionCompilerRuntimeService
from app.application.agent.services.knowledge_service import KnowledgeService
from app.application.ontology.definition_service import OntologyDefinitionService
from app.application.ontology.policy_guard_service import PolicyGuardService
from app.application.ontology.workbench_read_service import OntologyWorkbenchReadService
from app.application.semantic_mapper.preview_service import SemanticMapperPreviewService
from app.application.semantic_router.preview_service import SemanticRouterPreviewService
from app.application.query.commands.execute_query import ExecuteQueryCommand
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
from app.domain.semantic.entities import CubeDefinition, DimensionDef, JoinDef, MeasureDef
from app.interfaces.api.middleware.error_handler import register_error_handlers
from app.interfaces.api.v1.execution_compiler import create_execution_compiler_blueprint
from app.interfaces.api.v1.governance import create_governance_blueprint
from app.interfaces.api.v1.ontology import create_ontology_blueprint
from app.interfaces.api.v1.semantic_mapper import create_semantic_mapper_blueprint
from app.interfaces.api.v1.semantic_router import create_semantic_router_blueprint


def _build_sample_cube_repo(tmp_path) -> YamlCubeRepository:
    repo = YamlCubeRepository(str(tmp_path / "cubes"))
    repo.save(
        CubeDefinition(
            name="orders",
            title="订单",
            table="dws.orders",
            source_id=1,
            source_database="dw",
            dimensions={
                "status": DimensionDef(title="状态", type="string", sql="{CUBE}.status"),
                "region": DimensionDef(title="地区", type="string", sql="{CUBE}.region"),
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
    repo.save(
        CubeDefinition(
            name="customers",
            title="客户",
            table="dim.customers",
            source_id=2,
            source_database="dw",
            dimensions={
                "id": DimensionDef(title="客户ID", type="string", sql="{CUBE}.id"),
            },
            measures={"customer_count": MeasureDef(title="客户数", type="count", sql="{CUBE}.id")},
        )
    )
    repo.save(
        CubeDefinition(
            name="payment_events",
            title="支付事件",
            table="dwd.payment_events",
            source_id=3,
            source_database="dw",
            dimensions={
                "event_time": DimensionDef(title="事件时间", type="time", sql="{CUBE}.event_time"),
            },
            measures={"event_count": MeasureDef(title="事件数", type="count", sql="{CUBE}.event_time")},
        )
    )
    return repo


def _make_client(tmp_path, *, roles=("finance", "platform_admin", "data_m1_reader")):
    object_repo = YamlBusinessObjectRepository(str(tmp_path / "objects"))
    property_repo = YamlBusinessPropertyRepository(str(tmp_path / "properties"))
    metric_repo = YamlBusinessMetricRepository(str(tmp_path / "metrics"))
    glossary_repo = YamlGlossaryRepository(str(tmp_path / "glossary"))
    relation_repo = YamlBusinessRelationRepository(str(tmp_path / "relations"))
    action_repo = YamlBusinessActionRepository(str(tmp_path / "actions"))
    policy_repo = YamlPolicyMetadataRepository(str(tmp_path / "policies"))
    history_repo = YamlOntologyHistoryRepository(str(tmp_path / "history"))
    audit_repo = YamlGovernanceAuditTraceRepository(str(tmp_path / "audit"))
    cube_repo = _build_sample_cube_repo(tmp_path)
    knowledge_dir = tmp_path / "knowledge"
    knowledge_dir.mkdir(parents=True, exist_ok=True)
    (knowledge_dir / "orders.md").write_text("# 订单口径\nGMV 指已支付订单金额之和。", encoding="utf-8")

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
    compiler_service = ExecutionCompilerPreviewService(
        metric_repository=metric_repo,
        cube_repository=cube_repo,
        policy_guard_service=PolicyGuardService(policy_repository=policy_repo),
    )
    semantic_service = type(
        "SemanticStub",
        (),
        {
            "list_cubes": lambda self: [{"name": "orders", "title": "订单"}, {"name": "payment_events", "title": "支付事件"}],
            "describe_cube": lambda self, cube_name: {"cube_name": cube_name, "title": f"{cube_name} 标题"},
        },
    )()

    class _RuntimeHandler:
        def handle(self, command: ExecuteQueryCommand):
            return {
                "columns": ["gmv"],
                "data": [{"gmv": 100}],
                "row_count": 1,
                "execution_time_ms": 18,
                "status": "success",
                "source_id": command.source_id,
            }

    runtime_service = ExecutionCompilerRuntimeService(
        preview_service=compiler_service,
        execute_query_handler_factory=lambda: _RuntimeHandler(),
        knowledge_service=KnowledgeService(str(knowledge_dir)),
        semantic_service=semantic_service,
        audit_trace_repository=audit_repo,
    )
    router_service = SemanticRouterPreviewService(
        object_repository=object_repo,
        metric_repository=metric_repo,
        glossary_repository=glossary_repo,
        relation_repository=relation_repo,
        action_repository=action_repo,
        mapper_preview_service=mapper_service,
        compiler_preview_service=compiler_service,
        policy_guard_service=PolicyGuardService(policy_repository=policy_repo),
    )

    app = Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(create_ontology_blueprint(ontology_service, mapper_service, audit_repo, workbench_service))
    app.register_blueprint(create_semantic_mapper_blueprint(mapper_service))
    app.register_blueprint(create_execution_compiler_blueprint(compiler_service, runtime_service))
    app.register_blueprint(create_semantic_router_blueprint(router_service))
    app.register_blueprint(create_governance_blueprint(audit_repo))
    register_error_handlers(app)
    from tests.conftest import install_default_admin_auth
    return install_default_admin_auth(app.test_client(), roles=roles)


def test_ontology_foundation_and_preview_flow(tmp_path):
    client = _make_client(tmp_path)

    create_object_resp = client.post(
        "/api/v1/ontology/objects",
        json={
            "name": "order",
            "title": "订单",
            "description": "订单业务对象",
            "aliases": ["订单单据"],
        },
    )
    assert create_object_resp.status_code == 201
    assert create_object_resp.get_json()["data"]["name"] == "order"

    create_customer_resp = client.post(
        "/api/v1/ontology/objects",
        json={
            "name": "customer",
            "title": "客户",
            "description": "客户业务对象",
        },
    )
    assert create_customer_resp.status_code == 201

    create_property_resp = client.post(
        "/api/v1/ontology/properties",
        json={
            "name": "amount",
            "title": "金额",
            "object_name": "order",
            "description": "订单金额",
            "property_type": "number",
        },
    )
    assert create_property_resp.status_code == 201
    assert create_property_resp.get_json()["data"]["property_type"] == "number"

    create_metric_resp = client.post(
        "/api/v1/ontology/metrics",
        json={
            "name": "gmv",
            "title": "GMV",
            "object_name": "order",
            "semantic_formula": "已支付订单金额之和",
            "measure_refs": ["orders.gmv"],
        },
    )
    assert create_metric_resp.status_code == 201
    assert create_metric_resp.get_json()["data"]["semantic_formula"] == "已支付订单金额之和"

    create_relation_resp = client.post(
        "/api/v1/ontology/relations",
        json={
            "name": "order_customer",
            "title": "订单归属客户",
            "source_object_name": "order",
            "target_object_name": "customer",
            "relation_type": "belongs_to",
        },
    )
    assert create_relation_resp.status_code == 201

    create_action_resp = client.post(
        "/api/v1/ontology/actions",
        json={
            "name": "payment",
            "title": "支付",
            "object_name": "order",
            "event_cube_refs": ["payment_events"],
        },
    )
    assert create_action_resp.status_code == 201

    create_glossary_resp = client.post(
        "/api/v1/ontology/glossary",
        json={
            "term": "GMV",
            "canonical_name": "gmv",
            "aliases": ["成交额"],
            "entry_type": "metric",
        },
    )
    assert create_glossary_resp.status_code == 201
    assert create_glossary_resp.get_json()["data"]["entry_type"] == "metric"

    create_policy_resp = client.post(
        "/api/v1/ontology/policies",
        json={
            "name": "gmv_policy",
            "target_type": "metric",
            "target_name": "gmv",
            "visibility": "restricted",
            "allowed_roles": ["finance"],
        },
    )
    assert create_policy_resp.status_code == 201

    policy_impact_resp = client.get("/api/v1/ontology/policies/gmv_policy/impact")
    assert policy_impact_resp.status_code == 200
    policy_impact_payload = policy_impact_resp.get_json()["data"]
    assert policy_impact_payload["projection_status"] == "ok"
    assert policy_impact_payload["linked_entity_count"] == 2
    assert policy_impact_payload["analysis_links"]["measures"][0]["measure_ref"] == "orders.gmv"

    list_object_resp = client.get("/api/v1/ontology/objects")
    assert list_object_resp.status_code == 200
    object_titles = {item["title"] for item in list_object_resp.get_json()["data"]["items"]}
    assert {"订单", "客户"}.issubset(object_titles)

    metric_links_resp = client.get("/api/v1/ontology/metrics/gmv/links")
    assert metric_links_resp.status_code == 200
    metric_links_payload = metric_links_resp.get_json()["data"]
    assert metric_links_payload["linked_measures"][0]["measure_ref"] == "orders.gmv"

    preview_resp = client.post(
        "/api/v1/semantic-mapper/preview",
        json={"entity_type": "metric", "entity_name": "gmv"},
    )
    assert preview_resp.status_code == 200
    preview_payload = preview_resp.get_json()["data"]
    assert preview_payload["projection"]["targets"][0]["target_name"] == "orders.gmv"
    assert preview_payload["consistency"]["status"] == "ok"

    stale_resp = client.get("/api/v1/semantic-mapper/stale-check")
    assert stale_resp.status_code == 200
    assert stale_resp.get_json()["data"]["summary"]["stale_count"] == 0

    backlinks_resp = client.get(
        "/api/v1/semantic-mapper/measure-backlinks",
        query_string={"measure_ref": "orders.gmv"},
    )
    assert backlinks_resp.status_code == 200
    backlinks_payload = backlinks_resp.get_json()["data"]
    assert backlinks_payload["linked_metrics"][0]["metric_name"] == "gmv"

    cube_backlinks_resp = client.get(
        "/api/v1/semantic-mapper/cube-backlinks",
        query_string={"cube_name": "orders"},
    )
    assert cube_backlinks_resp.status_code == 200
    cube_backlinks_payload = cube_backlinks_resp.get_json()["data"]
    assert cube_backlinks_payload["linked_objects"][0]["object_name"] == "order"
    assert cube_backlinks_payload["linked_metrics"][0]["metric_name"] == "gmv"

    compile_resp = client.post(
        "/api/v1/execution-compiler/compile-preview",
        json={"metric_name": "gmv", "viewer_roles": ["finance"]},
    )
    assert compile_resp.status_code == 200
    compile_payload = compile_resp.get_json()["data"]
    assert compile_payload["status"] == "ready"
    assert "FROM dws.orders" in compile_payload["pseudo_sql"]
    assert compile_payload["traceability"]["analysis_measure"]["measure_ref"] == "orders.gmv"

    retrieval_compile_resp = client.post(
        "/api/v1/execution-compiler/compile-preview",
        json={
            "target_type": "retrieval",
            "retrieval_query": "解释订单口径",
            "retrieval_sources": ["knowledge-base"],
        },
    )
    assert retrieval_compile_resp.status_code == 200
    retrieval_compile_payload = retrieval_compile_resp.get_json()["data"]
    assert retrieval_compile_payload["target_type"] == "retrieval"
    assert retrieval_compile_payload["retrieval_request"]["query"] == "解释订单口径"

    tool_plan_resp = client.post(
        "/api/v1/execution-compiler/plan-preview",
        json={
            "target_type": "tool",
            "tool_name": "send_notification",
            "tool_arguments": {"channel": "lark"},
        },
    )
    assert tool_plan_resp.status_code == 200
    tool_plan_payload = tool_plan_resp.get_json()["data"]
    assert tool_plan_payload["target_type"] == "tool"
    assert tool_plan_payload["steps"][0] == "识别工具调用意图"

    blocked_client = _make_client(tmp_path, roles=("analyst",))
    blocked_compile_resp = blocked_client.post(
        "/api/v1/execution-compiler/compile-preview",
        json={"metric_name": "gmv", "viewer_roles": ["finance"]},
    )
    assert blocked_compile_resp.status_code == 200
    blocked_compile_payload = blocked_compile_resp.get_json()["data"]
    assert blocked_compile_payload["status"] == "blocked"
    assert blocked_compile_payload["policy"]["visibility"] == "restricted"

    execute_resp = client.post(
        "/api/v1/execution-compiler/execute",
        json={"metric_name": "gmv", "viewer_roles": ["finance"]},
    )
    assert execute_resp.status_code == 200
    execute_payload = execute_resp.get_json()["data"]
    assert execute_payload["status"] == "executed"
    assert execute_payload["target_type"] == "sql"
    assert execute_payload["result"]["row_count"] == 1
    assert execute_payload["governance_trace"]["status"] == "allow"
    assert execute_payload["governance_trace"]["execution_status"] == "executed"

    retrieval_execute_resp = client.post(
        "/api/v1/execution-compiler/execute",
        json={"target_type": "retrieval", "retrieval_query": "解释订单口径", "retrieval_sources": ["knowledge-base"]},
    )
    assert retrieval_execute_resp.status_code == 200
    retrieval_execute_payload = retrieval_execute_resp.get_json()["data"]
    assert retrieval_execute_payload["status"] == "executed"
    assert retrieval_execute_payload["target_type"] == "retrieval"
    assert retrieval_execute_payload["result"]["total"] == 1
    assert retrieval_execute_payload["governance_trace"]["execution_status"] == "executed"
    assert retrieval_execute_payload["audit_trace_id"]

    tool_execute_resp = client.post(
        "/api/v1/execution-compiler/execute",
        json={"target_type": "tool", "tool_name": "describe_cube", "tool_arguments": {"cube_name": "payment_events"}},
    )
    assert tool_execute_resp.status_code == 200
    tool_execute_payload = tool_execute_resp.get_json()["data"]
    assert tool_execute_payload["status"] == "executed"
    assert tool_execute_payload["result"]["cube_name"] == "payment_events"
    assert tool_execute_payload["audit_trace_id"]

    object_publish_resp = client.post("/api/v1/ontology/objects/order/publish")
    assert object_publish_resp.status_code == 200

    metric_publish_resp = client.post("/api/v1/ontology/metrics/gmv/publish")
    assert metric_publish_resp.status_code == 200
    assert metric_publish_resp.get_json()["data"]["entity"]["status"] == "active"

    metric_history_resp = client.get("/api/v1/ontology/metrics/gmv/history")
    assert metric_history_resp.status_code == 200
    assert metric_history_resp.get_json()["data"]["items"][0]["action"] == "published"

    metric_impact_resp = client.get("/api/v1/ontology/metrics/gmv/impact")
    assert metric_impact_resp.status_code == 200
    assert metric_impact_resp.get_json()["data"]["projection"]["targets"][0]["target_name"] == "orders.gmv"

    policy_audit_resp = client.get("/api/v1/ontology/policies/gmv_policy/audit")
    assert policy_audit_resp.status_code == 200
    policy_audit_payload = policy_audit_resp.get_json()["data"]
    assert policy_audit_payload["total"] >= 1
    audit_trace_id = policy_audit_payload["items"][0]["id"]

    audit_trace_resp = client.get(f"/api/v1/governance/audit-traces/{audit_trace_id}")
    assert audit_trace_resp.status_code == 200
    assert audit_trace_resp.get_json()["data"]["target_name"] == "gmv"

    audit_trace_list_resp = client.get("/api/v1/governance/audit-traces?policy=gmv_policy")
    assert audit_trace_list_resp.status_code == 200
    audit_trace_list_payload = audit_trace_list_resp.get_json()["data"]
    assert audit_trace_list_payload["items"][0]["id"] == audit_trace_id

    audit_trace_filtered_resp = client.get(
        "/api/v1/governance/audit-traces",
        query_string={
            "policy": "gmv_policy",
            "target_type": "sql",
            "target_name": "gmv",
            "decision": "allow",
            "route_type": "direct",
        },
    )
    assert audit_trace_filtered_resp.status_code == 200
    audit_trace_filtered_payload = audit_trace_filtered_resp.get_json()["data"]
    assert audit_trace_filtered_payload["total"] >= 1
    assert audit_trace_filtered_payload["items"][0]["target_name"] == "gmv"
    assert audit_trace_filtered_payload["items"][0]["decision"] == "allow"

    execute_plan_preview_resp = client.post(
        "/api/v1/semantic-router/execute-plan-preview",
        json={"question": "解释GMV口径并查看趋势", "viewer_roles": ["finance"]},
    )
    assert execute_plan_preview_resp.status_code == 200
    execute_plan_preview_payload = execute_plan_preview_resp.get_json()["data"]
    assert execute_plan_preview_payload["compiled_targets"][0]["preview"]["target_type"] == "sql"

    relation_preview_resp = client.post(
        "/api/v1/semantic-mapper/preview",
        json={"entity_type": "relation", "entity_name": "order_customer"},
    )
    assert relation_preview_resp.status_code == 200
    relation_preview_payload = relation_preview_resp.get_json()["data"]
    assert relation_preview_payload["projection"]["targets"][0]["join_path"] == "orders.customers"

    action_preview_resp = client.post(
        "/api/v1/semantic-mapper/preview",
        json={"entity_type": "action", "entity_name": "payment"},
    )
    assert action_preview_resp.status_code == 200
    action_preview_payload = action_preview_resp.get_json()["data"]
    assert action_preview_payload["projection"]["targets"][0]["target_name"] == "payment_events"


def test_metric_and_property_require_existing_object(tmp_path):
    client = _make_client(tmp_path)

    create_property_resp = client.post(
        "/api/v1/ontology/properties",
        json={
            "name": "amount",
            "title": "金额",
            "object_name": "missing_object",
            "property_type": "number",
        },
    )
    assert create_property_resp.status_code == 400

    create_metric_resp = client.post(
        "/api/v1/ontology/metrics",
        json={
            "name": "gmv",
            "title": "GMV",
            "object_name": "missing_object",
            "semantic_formula": "已支付订单金额之和",
        },
    )
    assert create_metric_resp.status_code == 400


def test_order_domain_template_preview_and_apply_flow(tmp_path):
    client = _make_client(tmp_path)

    preview_resp = client.get("/api/v1/ontology/templates/order-domain")
    assert preview_resp.status_code == 200
    preview_payload = preview_resp.get_json()["data"]
    assert preview_payload["title"] == "订单域模板"
    assert preview_payload["summary"]["objects"] == 2
    assert preview_payload["items"]["objects"][0]["name"] == "order"

    apply_resp = client.post("/api/v1/ontology/templates/order-domain/apply")
    assert apply_resp.status_code == 200
    apply_payload = apply_resp.get_json()["data"]
    assert apply_payload["summary"]["created"] == 10
    assert apply_payload["summary"]["skipped"] == 0

    metric_links_resp = client.get("/api/v1/ontology/metrics/gmv/links")
    assert metric_links_resp.status_code == 200
    assert metric_links_resp.get_json()["data"]["linked_measures"][0]["measure_ref"] == "orders.gmv"

    workbench_objects_resp = client.get("/api/v1/ontology/workbench/objects")
    assert workbench_objects_resp.status_code == 200
    workbench_objects = workbench_objects_resp.get_json()["data"]["items"]
    order_summary = next(item for item in workbench_objects if item["name"] == "order")
    assert order_summary["stats"]["metric_count"] == 1

    workbench_overview_resp = client.get("/api/v1/ontology/workbench/objects/order/overview")
    assert workbench_overview_resp.status_code == 200
    overview_payload = workbench_overview_resp.get_json()["data"]
    assert overview_payload["object"]["name"] == "order"
    assert overview_payload["capabilities"]["properties"][0]["name"] == "order_amount"
    assert overview_payload["associations"]["metrics"][0]["name"] == "gmv"

    workbench_governance_resp = client.get("/api/v1/ontology/workbench/governance")
    assert workbench_governance_resp.status_code == 200
    governance_payload = workbench_governance_resp.get_json()["data"]
    assert governance_payload["summary"]["policy_total"] == 1
    assert governance_payload["items"][0]["name"] == "gmv_policy"

    reapply_resp = client.post("/api/v1/ontology/templates/order-domain/apply")
    assert reapply_resp.status_code == 200
    reapply_payload = reapply_resp.get_json()["data"]
    assert reapply_payload["summary"]["created"] == 0
    assert reapply_payload["summary"]["skipped"] == 10


def test_metric_publish_requires_active_object_and_measure_ref(tmp_path):
    client = _make_client(tmp_path)

    create_object_resp = client.post(
        "/api/v1/ontology/objects",
        json={
            "name": "order",
            "title": "订单",
            "description": "订单业务对象",
        },
    )
    assert create_object_resp.status_code == 201

    create_metric_resp = client.post(
        "/api/v1/ontology/metrics",
        json={
            "name": "gmv",
            "title": "GMV",
            "object_name": "order",
            "semantic_formula": "已支付订单金额之和",
            "measure_refs": ["orders.gmv"],
        },
    )
    assert create_metric_resp.status_code == 201

    publish_metric_resp = client.post("/api/v1/ontology/metrics/gmv/publish")
    assert publish_metric_resp.status_code == 400
    assert "业务对象尚未发布" in publish_metric_resp.get_json()["message"]

    publish_object_resp = client.post("/api/v1/ontology/objects/order/publish")
    assert publish_object_resp.status_code == 200

    republish_metric_resp = client.post("/api/v1/ontology/metrics/gmv/publish")
    assert republish_metric_resp.status_code == 200
    assert republish_metric_resp.get_json()["data"]["entity"]["status"] == "active"

    create_invalid_metric_resp = client.post(
        "/api/v1/ontology/metrics",
        json={
            "name": "order_count",
            "title": "订单数",
            "object_name": "order",
            "semantic_formula": "订单数量",
            "measure_refs": [],
        },
    )
    assert create_invalid_metric_resp.status_code == 201

    publish_invalid_metric_resp = client.post("/api/v1/ontology/metrics/order_count/publish")
    assert publish_invalid_metric_resp.status_code == 400
    assert "至少关联一个 Measure" in publish_invalid_metric_resp.get_json()["message"]
