from __future__ import annotations

from app.application.execution_compiler.preview_service import ExecutionCompilerPreviewService
from app.application.execution_compiler.runtime_service import ExecutionCompilerRuntimeService
from app.application.query.commands.execute_query import ExecuteQueryCommand
from app.application.ontology.policy_guard_service import PolicyGuardService
from app.application.semantic_mapper.preview_service import SemanticMapperPreviewService
from app.domain.ontology.entities import (
    BusinessAction,
    BusinessMetric,
    BusinessObject,
    PolicyMetadata,
    BusinessProperty,
    BusinessRelation,
)
from app.infrastructure.ontology.yaml_property_repository import YamlBusinessPropertyRepository
from app.infrastructure.ontology.yaml_glossary_repository import YamlGlossaryRepository
from app.infrastructure.ontology.yaml_action_repository import YamlBusinessActionRepository
from app.infrastructure.ontology.yaml_audit_trace_repository import YamlGovernanceAuditTraceRepository
from app.infrastructure.ontology.yaml_metric_repository import YamlBusinessMetricRepository
from app.infrastructure.ontology.yaml_object_repository import YamlBusinessObjectRepository
from app.infrastructure.ontology.yaml_policy_repository import YamlPolicyMetadataRepository
from app.infrastructure.ontology.yaml_relation_repository import YamlBusinessRelationRepository
from app.infrastructure.semantic.yaml_cube_repository import YamlCubeRepository
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
                "region": DimensionDef(title="地区", type="string", sql="{CUBE}.region"),
            },
            measures={
                "gmv": MeasureDef(title="GMV", type="sum", sql="{CUBE}.amount"),
            },
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
                "region": DimensionDef(title="地区", type="string", sql="{CUBE}.region"),
            },
            measures={
                "customer_count": MeasureDef(title="客户数", type="count", sql="{CUBE}.id"),
            },
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
                "order_id": DimensionDef(title="订单ID", type="string", sql="{CUBE}.order_id"),
            },
            measures={
                "event_count": MeasureDef(title="事件数", type="count", sql="{CUBE}.order_id"),
            },
        )
    )


def test_mapper_preview_and_stale_check(tmp_path):
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    _save_sample_cube(cube_repo)

    object_repo = YamlBusinessObjectRepository(str(tmp_path / "objects"))
    metric_repo = YamlBusinessMetricRepository(str(tmp_path / "metrics"))
    glossary_repo = YamlGlossaryRepository(str(tmp_path / "glossary"))
    relation_repo = YamlBusinessRelationRepository(str(tmp_path / "relations"))
    action_repo = YamlBusinessActionRepository(str(tmp_path / "actions"))
    property_repo = YamlBusinessPropertyRepository(str(tmp_path / "properties"))
    object_repo.save(
        BusinessObject(
            name="order",
            title="订单",
            aliases=["订单单据"],
            description="订单业务对象",
        )
    )
    object_repo.save(
        BusinessObject(
            name="customer",
            title="客户",
            description="客户业务对象",
        )
    )
    property_repo.save(
        BusinessProperty(
            name="pay_time",
            title="支付时间",
            object_name="order",
            property_type="time",
        )
    )
    metric_repo.save(
        BusinessMetric(
            name="gmv",
            title="GMV",
            object_name="order",
            semantic_formula="已支付订单金额之和",
            measure_refs=["orders.gmv"],
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

    service = SemanticMapperPreviewService(
        object_repository=object_repo,
        metric_repository=metric_repo,
        glossary_repository=glossary_repo,
        relation_repository=relation_repo,
        action_repository=action_repo,
        cube_repository=cube_repo,
    )

    object_preview = service.preview(entity_type="object", entity_name="order")
    assert object_preview["entity"]["name"] == "order"
    assert object_preview["projection"]["targets"][0]["target_name"] == "orders"
    assert object_preview["consistency"]["status"] == "ok"

    metric_preview = service.preview(entity_type="metric", entity_name="gmv")
    assert metric_preview["projection"]["targets"][0]["target_name"] == "orders.gmv"
    assert metric_preview["consistency"]["status"] == "ok"

    stale = service.stale_check()
    assert stale["summary"]["stale_count"] == 0

    metric_repo.save(
        BusinessMetric(
            name="invalid_metric",
            title="无效指标",
            object_name="order",
            semantic_formula="无效示例",
            measure_refs=["orders.missing_measure"],
        )
    )
    stale_after_invalid = service.stale_check()
    assert stale_after_invalid["summary"]["stale_count"] == 1
    assert stale_after_invalid["items"][0]["entity_name"] == "invalid_metric"
    assert stale_after_invalid["summary"]["linked_measure_ref_count"] == 1

    metric_links = service.metric_links("gmv")
    assert metric_links["metric_name"] == "gmv"
    assert metric_links["linked_measures"][0]["measure_ref"] == "orders.gmv"
    assert metric_links["linked_measures"][0]["status"] == "linked"

    measure_backlinks = service.measure_backlinks("orders.gmv")
    assert measure_backlinks["measure_ref"] == "orders.gmv"
    assert measure_backlinks["linked_metrics"][0]["metric_name"] == "gmv"
    assert measure_backlinks["status"] == "linked"

    cube_backlinks = service.cube_backlinks("orders")
    assert cube_backlinks["cube_name"] == "orders"
    assert cube_backlinks["linked_objects"][0]["object_name"] == "order"
    assert cube_backlinks["linked_metrics"][0]["metric_name"] == "gmv"
    assert cube_backlinks["status"] == "linked"

    relation_preview = service.preview(entity_type="relation", entity_name="order_customer")
    assert relation_preview["projection"]["targets"][0]["join_path"] == "orders.customers"
    assert relation_preview["consistency"]["status"] == "ok"
    assert relation_preview["traceability"]["source_object"] == "order"
    assert relation_preview["traceability"]["target_object"] == "customer"

    action_preview = service.preview(entity_type="action", entity_name="payment")
    assert action_preview["projection"]["targets"][0]["target_name"] == "payment_events"
    assert action_preview["consistency"]["status"] == "ok"
    assert action_preview["traceability"]["object_name"] == "order"


def test_execution_compiler_preview_returns_pseudo_sql(tmp_path):
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    _save_sample_cube(cube_repo)
    metric_repo = YamlBusinessMetricRepository(str(tmp_path / "metrics"))
    policy_repo = YamlPolicyMetadataRepository(str(tmp_path / "policies"))
    metric_repo.save(
        BusinessMetric(
            name="gmv",
            title="GMV",
            object_name="order",
            semantic_formula="已支付订单金额之和",
            measure_refs=["orders.gmv"],
        )
    )

    service = ExecutionCompilerPreviewService(
        metric_repository=metric_repo,
        cube_repository=cube_repo,
    )

    preview = service.compile_metric_preview("gmv")
    assert preview["status"] == "ready"
    assert preview["target_type"] == "sql"
    assert "FROM ods.orders" in preview["pseudo_sql"]
    assert preview["bindings"]["measure_ref"] == "orders.gmv"
    assert preview["traceability"]["business_metric"]["name"] == "gmv"
    assert preview["traceability"]["analysis_measure"]["measure_ref"] == "orders.gmv"

    retrieval_preview = service.compile_preview(
        target_type="retrieval",
        retrieval_query="解释订单口径",
        retrieval_sources=["knowledge-base", "docs"],
    )
    assert retrieval_preview["status"] == "ready"
    assert retrieval_preview["target_type"] == "retrieval"
    assert retrieval_preview["retrieval_request"]["query"] == "解释订单口径"
    assert retrieval_preview["retrieval_request"]["sources"] == ["knowledge-base", "docs"]

    tool_preview = service.compile_preview(
        target_type="tool",
        tool_name="send_notification",
        tool_arguments={"channel": "lark", "template": "payment_success"},
    )
    assert tool_preview["status"] == "ready"
    assert tool_preview["target_type"] == "tool"
    assert tool_preview["tool_call"]["name"] == "send_notification"
    assert tool_preview["tool_call"]["arguments"]["channel"] == "lark"

    plan_preview = service.compile_plan_preview(
        target_type="retrieval",
        retrieval_query="解释订单口径",
        retrieval_sources=["knowledge-base"],
    )
    assert plan_preview["target_type"] == "retrieval"
    assert plan_preview["steps"][0] == "识别检索意图"

    policy_repo.save(
        PolicyMetadata(
            name="gmv_policy",
            target_type="metric",
            target_name="gmv",
            visibility="restricted",
            allowed_roles=["finance"],
        )
    )
    guarded_service = ExecutionCompilerPreviewService(
        metric_repository=metric_repo,
        cube_repository=cube_repo,
        policy_guard_service=PolicyGuardService(policy_repository=policy_repo),
    )
    blocked_preview = guarded_service.compile_metric_preview("gmv", viewer_roles=["analyst"])
    assert blocked_preview["status"] == "blocked"
    assert blocked_preview["policy"]["visibility"] == "restricted"

    allowed_preview = guarded_service.compile_metric_preview("gmv", viewer_roles=["finance"])
    assert allowed_preview["status"] == "ready"

    object_repo = YamlBusinessObjectRepository(str(tmp_path / "objects"))
    glossary_repo = YamlGlossaryRepository(str(tmp_path / "glossary"))
    relation_repo = YamlBusinessRelationRepository(str(tmp_path / "relations"))
    action_repo = YamlBusinessActionRepository(str(tmp_path / "actions"))
    object_repo.save(
        BusinessObject(
            name="order",
            title="订单",
            description="订单业务对象",
        )
    )
    mapper_service = SemanticMapperPreviewService(
        object_repository=object_repo,
        metric_repository=metric_repo,
        glossary_repository=glossary_repo,
        relation_repository=relation_repo,
        action_repository=action_repo,
        cube_repository=cube_repo,
    )
    policy_impact = mapper_service.policy_impact(
        {
            "name": "gmv_policy",
            "target_type": "metric",
            "target_name": "gmv",
            "visibility": "restricted",
            "allowed_roles": ["finance"],
        }
    )
    assert policy_impact["projection_status"] == "ok"
    assert policy_impact["linked_entity_count"] == 2
    assert policy_impact["analysis_links"]["measures"][0]["measure_ref"] == "orders.gmv"
    assert policy_impact["governance_hooks"][0]["hook"] == "semantic-router"


def test_execution_compiler_runtime_executes_sql_and_blocks_unconfigured_targets(tmp_path):
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    _save_sample_cube(cube_repo)
    metric_repo = YamlBusinessMetricRepository(str(tmp_path / "metrics"))
    policy_repo = YamlPolicyMetadataRepository(str(tmp_path / "policies"))
    metric_repo.save(
        BusinessMetric(
            name="gmv",
            title="GMV",
            object_name="order",
            semantic_formula="已支付订单金额之和",
            measure_refs=["orders.gmv"],
        )
    )

    preview_service = ExecutionCompilerPreviewService(
        metric_repository=metric_repo,
        cube_repository=cube_repo,
        policy_guard_service=PolicyGuardService(policy_repository=policy_repo),
    )

    class _Handler:
        def __init__(self):
            self.commands = []

        def handle(self, command: ExecuteQueryCommand):
            self.commands.append(command)
            return {
                "columns": ["gmv"],
                "data": [{"gmv": 100}],
                "row_count": 1,
                "execution_time_ms": 12,
                "status": "success",
            }

    handler = _Handler()
    audit_repo = YamlGovernanceAuditTraceRepository(str(tmp_path / "audit"))
    service = ExecutionCompilerRuntimeService(
        preview_service=preview_service,
        execute_query_handler_factory=lambda: handler,
        knowledge_service=type("KnowledgeStub", (), {
            "search": lambda self, query, max_results=5: [{"path": "knowledge/orders.md", "title": "订单", "match_count": 1}],
            "read": lambda self, path: "# 订单知识",
        })(),
        semantic_service=type("SemanticStub", (), {
            "list_cubes": lambda self: [{"name": "orders", "title": "订单"}],
            "describe_cube": lambda self, cube_name: {"cube_name": cube_name, "title": "支付事件"},
        })(),
        audit_trace_repository=audit_repo,
    )

    sql_result = service.execute(target_type="sql", metric_name="gmv", viewer_roles=["analyst"])
    assert sql_result["status"] == "executed"
    assert sql_result["target_type"] == "sql"
    assert sql_result["result"]["row_count"] == 1
    assert sql_result["governance_trace"]["status"] == "allow"
    assert sql_result["governance_trace"]["matched_policy"] is None
    assert sql_result["governance_trace"]["execution_status"] == "executed"
    assert handler.commands[0].source_id == 1
    assert "SELECT" in handler.commands[0].sql_query

    retrieval_result = service.execute(target_type="retrieval", retrieval_query="解释订单口径", retrieval_sources=["knowledge-base"])
    assert retrieval_result["status"] == "executed"
    assert retrieval_result["target_type"] == "retrieval"
    assert retrieval_result["result"]["total"] == 1
    assert retrieval_result["governance_trace"]["execution_status"] == "executed"
    assert retrieval_result["audit_trace_id"] is not None

    tool_result = service.execute(target_type="tool", tool_name="describe_cube", tool_arguments={"cube_name": "payment_events"})
    assert tool_result["status"] == "executed"
    assert tool_result["target_type"] == "tool"
    assert tool_result["result"]["cube_name"] == "payment_events"
    assert tool_result["governance_trace"]["execution_status"] == "executed"
    assert tool_result["audit_trace_id"] is not None

    assert len(audit_repo.list_all()) == 3

    policy_repo.save(
        PolicyMetadata(
            name="gmv_policy",
            target_type="metric",
            target_name="gmv",
            visibility="restricted",
            allowed_roles=["finance"],
            description="GMV 仅财务可见",
        )
    )
    blocked_result = service.execute(target_type="sql", metric_name="gmv", viewer_roles=["analyst"])
    assert blocked_result["status"] == "blocked"
    assert blocked_result["governance_trace"]["status"] == "blocked"
    assert blocked_result["governance_trace"]["execution_status"] == "blocked"
    assert blocked_result["governance_trace"]["matched_policy"]["name"] == "gmv_policy"
