from __future__ import annotations

from app.application.execution_compiler.preview_service import ExecutionCompilerPreviewService
from app.application.execution_compiler.runtime_service import ExecutionCompilerRuntimeService
from app.application.ontology.policy_guard_service import PolicyGuardService
from app.application.semantic_mapper.preview_service import SemanticMapperPreviewService
from app.application.semantic_router.preview_service import SemanticRouterPreviewService
from app.infrastructure.ontology.yaml_action_repository import YamlBusinessActionRepository
from app.infrastructure.ontology.yaml_glossary_repository import YamlGlossaryRepository
from app.infrastructure.ontology.yaml_metric_repository import YamlBusinessMetricRepository
from app.infrastructure.ontology.yaml_object_repository import YamlBusinessObjectRepository
from app.infrastructure.ontology.yaml_policy_repository import YamlPolicyMetadataRepository
from app.infrastructure.ontology.yaml_relation_repository import YamlBusinessRelationRepository
from app.infrastructure.semantic.yaml_cube_repository import YamlCubeRepository
from app.domain.ontology.entities import BusinessAction, BusinessMetric, BusinessObject, BusinessRelation, GlossaryEntry, PolicyMetadata
from app.domain.semantic.entities import CubeDefinition, DimensionDef, JoinDef, MeasureDef


def _save_sample_cube(repo: YamlCubeRepository) -> None:
    repo.save(
        CubeDefinition(
            name="orders",
            title="订单",
            table="ods.orders",
            source_id=1,
            source_database="dw",
            dimensions={
                "status": DimensionDef(title="状态", type="string", sql="{CUBE}.status"),
            },
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


def test_router_routes_metric_and_alias_to_cube(tmp_path):
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    _save_sample_cube(cube_repo)
    object_repo = YamlBusinessObjectRepository(str(tmp_path / "objects"))
    metric_repo = YamlBusinessMetricRepository(str(tmp_path / "metrics"))
    glossary_repo = YamlGlossaryRepository(str(tmp_path / "glossary"))
    relation_repo = YamlBusinessRelationRepository(str(tmp_path / "relations"))
    action_repo = YamlBusinessActionRepository(str(tmp_path / "actions"))
    policy_repo = YamlPolicyMetadataRepository(str(tmp_path / "policies"))

    object_repo.save(BusinessObject(name="order", title="订单"))
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
    glossary_repo.save(
        GlossaryEntry(
            term="成交额",
            canonical_name="gmv",
            entry_type="metric",
        )
    )

    compiler = ExecutionCompilerPreviewService(
        metric_repository=metric_repo,
        cube_repository=cube_repo,
    )
    mapper = SemanticMapperPreviewService(
        object_repository=object_repo,
        metric_repository=metric_repo,
        glossary_repository=glossary_repo,
        relation_repository=relation_repo,
        action_repository=action_repo,
        cube_repository=cube_repo,
    )
    service = SemanticRouterPreviewService(
        object_repository=object_repo,
        metric_repository=metric_repo,
        glossary_repository=glossary_repo,
        relation_repository=relation_repo,
        action_repository=action_repo,
        mapper_preview_service=mapper,
        compiler_preview_service=compiler,
        policy_guard_service=PolicyGuardService(policy_repository=policy_repo),
    )

    metric_route = service.route(question="查看GMV趋势")
    assert metric_route["route_type"] == "cube"
    assert metric_route["matched"]["metric_name"] == "gmv"
    assert metric_route["execution_preview"]["status"] == "ready"

    alias_route = service.route(question="查看成交额趋势")
    assert alias_route["route_type"] == "cube"
    assert alias_route["matched"]["metric_name"] == "gmv"


def test_router_supports_hybrid_and_blocked_paths(tmp_path):
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    _save_sample_cube(cube_repo)
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
        )
    )
    metric_repo.save(
        BusinessMetric(
            name="refund_rate",
            title="退款率",
            object_name="order",
            semantic_formula="退款订单数 / 已支付订单数",
        )
    )
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
    policy_repo.save(
        PolicyMetadata(
            name="customer_policy",
            target_type="object",
            target_name="customer",
            visibility="private",
            allowed_roles=["admin"],
        )
    )

    compiler = ExecutionCompilerPreviewService(
        metric_repository=metric_repo,
        cube_repository=cube_repo,
    )
    mapper = SemanticMapperPreviewService(
        object_repository=object_repo,
        metric_repository=metric_repo,
        glossary_repository=glossary_repo,
        relation_repository=relation_repo,
        action_repository=action_repo,
        cube_repository=cube_repo,
    )
    service = SemanticRouterPreviewService(
        object_repository=object_repo,
        metric_repository=metric_repo,
        glossary_repository=glossary_repo,
        relation_repository=relation_repo,
        action_repository=action_repo,
        mapper_preview_service=mapper,
        compiler_preview_service=compiler,
        policy_guard_service=PolicyGuardService(policy_repository=policy_repo),
    )

    hybrid_route = service.route(question="解释GMV口径并查看趋势", viewer_roles=["finance"])
    assert hybrid_route["route_type"] == "hybrid"
    assert hybrid_route["matched"]["metric_name"] == "gmv"
    assert hybrid_route["targets"] == ["knowledge", "cube"]

    blocked_route = service.route(question="查看退款率趋势")
    assert blocked_route["route_type"] == "blocked"
    assert blocked_route["matched"]["metric_name"] == "refund_rate"
    assert blocked_route["execution_preview"]["status"] == "blocked"

    plan = service.plan(question="解释GMV口径并查看趋势", viewer_roles=["finance"])
    assert plan["route"]["route_type"] == "hybrid"
    assert plan["steps"][0]["step_type"] == "semantic_match"
    assert any(step["step_type"] == "knowledge_explain" for step in plan["steps"])
    assert plan["steps"][-1]["step_type"] == "traceability"

    relation_route = service.route(question="分析订单归属客户关系")
    assert relation_route["route_type"] == "blocked"
    assert relation_route["matched"]["entity_type"] == "relation"
    assert relation_route["policy"]["visibility"] == "private"

    action_route = service.route(question="触发支付通知")
    assert action_route["route_type"] == "tool"
    assert action_route["matched"]["entity_type"] == "action"

    object_route = service.route(question="查看订单趋势")
    assert object_route["route_type"] == "cube"
    assert object_route["matched"]["entity_type"] == "object"

    metric_policy_block = service.route(question="查看GMV趋势", viewer_roles=["analyst"])
    assert metric_policy_block["route_type"] == "blocked"
    assert metric_policy_block["policy"]["visibility"] == "restricted"


def test_router_builds_multi_intent_plan_for_metric_relation_and_action(tmp_path):
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    _save_sample_cube(cube_repo)
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
    relation_repo.save(
        BusinessRelation(
            name="order_customer",
            title="订单归属客户",
            source_object_name="order",
            target_object_name="customer",
            relation_type="belongs_to",
            aliases=["订单客户关系"],
        )
    )
    action_repo.save(
        BusinessAction(
            name="payment",
            title="支付",
            object_name="order",
            event_cube_refs=["payment_events"],
            aliases=["支付通知"],
        )
    )

    compiler = ExecutionCompilerPreviewService(
        metric_repository=metric_repo,
        cube_repository=cube_repo,
    )
    mapper = SemanticMapperPreviewService(
        object_repository=object_repo,
        metric_repository=metric_repo,
        glossary_repository=glossary_repo,
        relation_repository=relation_repo,
        action_repository=action_repo,
        cube_repository=cube_repo,
    )
    service = SemanticRouterPreviewService(
        object_repository=object_repo,
        metric_repository=metric_repo,
        glossary_repository=glossary_repo,
        relation_repository=relation_repo,
        action_repository=action_repo,
        mapper_preview_service=mapper,
        compiler_preview_service=compiler,
        policy_guard_service=PolicyGuardService(policy_repository=policy_repo),
    )

    question = "解释GMV口径，分析订单客户关系，并触发支付通知"
    route = service.route(question=question)
    assert route["route_type"] == "hybrid"
    assert route["planning_mode"] == "multi_step"
    assert route["primary_match"]["entity_type"] == "metric"
    assert route["targets"] == ["knowledge", "cube", "tool"]
    assert [target["target_type"] for target in route["execution_targets"]] == ["sql", "retrieval", "tool"]
    assert route["execution_targets"][2]["tool_name"] == "describe_cube"
    assert {item["entity_type"] for item in route["matched_entities"]} == {"metric", "relation", "action"}

    plan = service.plan(question=question)
    assert plan["planning_mode"] == "multi_step"
    assert plan["route"]["route_type"] == "hybrid"
    assert plan["route"]["targets"] == ["knowledge", "cube", "tool"]
    assert any(step["step_type"] == "tool_dispatch" for step in plan["steps"])
    assert any(step["step_type"] == "knowledge_explain" for step in plan["steps"])
    assert any(step["step_type"] == "analysis_preview" for step in plan["steps"])
    assert len(plan["execution_targets"]) == 3

    execute_plan_preview = service.execute_plan_preview(question=question)
    assert len(execute_plan_preview["compiled_targets"]) == 3
    assert execute_plan_preview["compiled_targets"][0]["preview"]["target_type"] == "sql"
    assert execute_plan_preview["compiled_targets"][1]["preview"]["target_type"] == "retrieval"
    assert execute_plan_preview["compiled_targets"][2]["preview"]["target_type"] == "tool"


def test_router_execute_plan_runs_targets_and_returns_results(tmp_path):
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    _save_sample_cube(cube_repo)
    object_repo = YamlBusinessObjectRepository(str(tmp_path / "objects"))
    metric_repo = YamlBusinessMetricRepository(str(tmp_path / "metrics"))
    glossary_repo = YamlGlossaryRepository(str(tmp_path / "glossary"))
    relation_repo = YamlBusinessRelationRepository(str(tmp_path / "relations"))
    action_repo = YamlBusinessActionRepository(str(tmp_path / "actions"))
    policy_repo = YamlPolicyMetadataRepository(str(tmp_path / "policies"))

    object_repo.save(BusinessObject(name="order", title="订单"))
    metric_repo.save(
        BusinessMetric(
            name="gmv",
            title="GMV",
            object_name="order",
            semantic_formula="已支付订单金额之和",
            measure_refs=["orders.gmv"],
        )
    )

    compiler = ExecutionCompilerPreviewService(
        metric_repository=metric_repo,
        cube_repository=cube_repo,
        policy_guard_service=PolicyGuardService(policy_repository=policy_repo),
    )
    execute_query_handler = type(
        "FakeExecuteQueryHandler",
        (),
        {"handle": lambda self, command: {"columns": [{"name": "gmv", "type": "number"}], "data": [{"gmv": 100}], "row_count": 1}},
    )()
    runtime = ExecutionCompilerRuntimeService(
        preview_service=compiler,
        execute_query_handler_factory=lambda: execute_query_handler,
    )
    mapper = SemanticMapperPreviewService(
        object_repository=object_repo,
        metric_repository=metric_repo,
        glossary_repository=glossary_repo,
        relation_repository=relation_repo,
        action_repository=action_repo,
        cube_repository=cube_repo,
    )
    service = SemanticRouterPreviewService(
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

    result = service.execute_plan(question="查看GMV趋势")
    assert result["route"]["route_type"] == "cube"
    assert result["execution_results"][0]["status"] == "executed"
    assert result["execution_results"][0]["target_type"] == "sql"
    assert result["execution_results"][0]["result"]["row_count"] == 1


def test_router_plan_returns_stable_structure_for_frontend_consumption(tmp_path):
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    _save_sample_cube(cube_repo)
    object_repo = YamlBusinessObjectRepository(str(tmp_path / "objects"))
    metric_repo = YamlBusinessMetricRepository(str(tmp_path / "metrics"))
    glossary_repo = YamlGlossaryRepository(str(tmp_path / "glossary"))
    relation_repo = YamlBusinessRelationRepository(str(tmp_path / "relations"))
    action_repo = YamlBusinessActionRepository(str(tmp_path / "actions"))
    policy_repo = YamlPolicyMetadataRepository(str(tmp_path / "policies"))

    object_repo.save(BusinessObject(name="order", title="订单"))
    metric_repo.save(
        BusinessMetric(
            name="gmv",
            title="GMV",
            object_name="order",
            semantic_formula="已支付订单金额之和",
            measure_refs=["orders.gmv"],
        )
    )

    compiler = ExecutionCompilerPreviewService(
        metric_repository=metric_repo,
        cube_repository=cube_repo,
    )
    mapper = SemanticMapperPreviewService(
        object_repository=object_repo,
        metric_repository=metric_repo,
        glossary_repository=glossary_repo,
        relation_repository=relation_repo,
        action_repository=action_repo,
        cube_repository=cube_repo,
    )
    service = SemanticRouterPreviewService(
        object_repository=object_repo,
        metric_repository=metric_repo,
        glossary_repository=glossary_repo,
        relation_repository=relation_repo,
        action_repository=action_repo,
        mapper_preview_service=mapper,
        compiler_preview_service=compiler,
        policy_guard_service=PolicyGuardService(policy_repository=policy_repo),
    )

    plan = service.plan(question="解释GMV口径并查看趋势")
    assert plan["planning_mode"] == "multi_step"
    assert isinstance(plan["dependencies"], list)
    assert isinstance(plan["expected_outputs"], list)
    assert isinstance(plan["execution_targets"], list)
    assert plan["execution_targets"][0]["target_type"] == "sql"
    assert plan["execution_targets"][0]["target_key"] == "metric:gmv:sql"
    assert plan["steps"][0]["step_key"] == "semantic_match"
    assert plan["steps"][0]["expected_output"] == "matched_entities"
    assert any(output["output_key"] == "analysis_result" for output in plan["expected_outputs"])
