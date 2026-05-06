from __future__ import annotations

import pytest

from app.application.execution_compiler.preview_service import ExecutionCompilerPreviewService
from app.application.execution_compiler.runtime_service import ExecutionCompilerRuntimeService
from app.application.query.commands.execute_query import ExecuteQueryCommand
from app.application.ontology.policy_guard_service import PolicyGuardService
from app.application.semantic_mapper.preview_service import SemanticMapperPreviewService
from app.domain.ontology.entities import (
    BusinessAction,
    GlossaryEntry,
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
            table="dws.orders",
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
    assert "FROM dws.orders" in preview["pseudo_sql"]
    assert preview["bindings"]["measure_ref"] == "orders.gmv"
    assert preview["traceability"]["business_metric"]["name"] == "gmv"
    assert preview["traceability"]["analysis_measure"]["measure_ref"] == "orders.gmv"
    assert preview["resource_set"]["logical"]["cubes"] == ["orders"]
    assert preview["resource_set"]["logical"]["metrics"] == ["gmv"]
    assert preview["resource_set"]["physical"][0]["data_source_id"] == "1"
    assert preview["resource_set"]["physical"][0]["project"] == "dw"
    assert preview["resource_set"]["physical"][0]["schema"] == "dws"
    assert preview["resource_set"]["physical"][0]["table"] == "orders"
    assert preview["ticket_material"]["resource_set"] == preview["resource_set"]

    retrieval_preview = service.compile_preview(
        target_type="retrieval",
        retrieval_query="解释订单口径",
        retrieval_sources=["knowledge-base", "docs"],
    )
    assert retrieval_preview["status"] == "ready"
    assert retrieval_preview["target_type"] == "retrieval"
    assert retrieval_preview["retrieval_request"]["query"] == "解释订单口径"
    assert retrieval_preview["retrieval_request"]["sources"] == ["knowledge-base", "docs"]
    assert retrieval_preview["resource_set"] == {
        "logical": {"retrieval_sources": ["knowledge-base", "docs"]},
        "physical": [],
    }

    tool_preview = service.compile_preview(
        target_type="tool",
        tool_name="send_notification",
        tool_arguments={"channel": "lark", "template": "payment_success"},
    )
    assert tool_preview["status"] == "ready"
    assert tool_preview["target_type"] == "tool"
    assert tool_preview["tool_call"]["name"] == "send_notification"
    assert tool_preview["tool_call"]["arguments"]["channel"] == "lark"
    assert tool_preview["resource_set"] == {
        "logical": {"tools": ["send_notification"]},
        "physical": [],
    }

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


def test_execution_compiler_preview_covers_error_and_source_sql_paths(tmp_path):
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    _save_sample_cube(cube_repo)
    cube_repo.save(
        CubeDefinition(
            name="orders_sql",
            title="订单快照",
            table="ods.orders",
            source_sql="SELECT * FROM dwd.orders_snapshot",
            source_id=9,
            source_database="dw",
            dimensions={
                "ds": DimensionDef(title="分区日期", type="time", sql="{CUBE}.ds"),
            },
            measures={
                "gmv": MeasureDef(title="GMV", type="sum", sql="{CUBE}.amount"),
            },
        )
    )
    metric_repo = YamlBusinessMetricRepository(str(tmp_path / "metrics"))
    metric_repo.save(
        BusinessMetric(
            name="no_binding",
            title="未绑定指标",
            object_name="order",
            semantic_formula="未绑定",
            measure_refs=[],
        )
    )
    metric_repo.save(
        BusinessMetric(
            name="missing_measure",
            title="缺失 Measure",
            object_name="order",
            semantic_formula="缺失 Measure",
            measure_refs=["orders.unknown"],
        )
    )
    metric_repo.save(
        BusinessMetric(
            name="gmv_source_sql",
            title="SQL 来源指标",
            object_name="order",
            semantic_formula="来源于 source_sql",
            measure_refs=["orders_sql.gmv"],
        )
    )

    service = ExecutionCompilerPreviewService(
        metric_repository=metric_repo,
        cube_repository=cube_repo,
    )

    with pytest.raises(ValueError, match="metric_name"):
        service.compile_preview(target_type="sql")
    with pytest.raises(ValueError, match="不支持的执行目标类型"):
        service.compile_preview(target_type="agent")
    with pytest.raises(ValueError, match="未找到业务指标"):
        service.compile_metric_preview("missing")
    with pytest.raises(ValueError, match="retrieval_query"):
        service.compile_preview(target_type="retrieval", retrieval_query="   ")
    with pytest.raises(ValueError, match="tool_name"):
        service.compile_preview(target_type="tool", tool_name="  ")

    no_binding_preview = service.compile_metric_preview("no_binding")
    assert no_binding_preview["status"] == "blocked"
    assert no_binding_preview["reason"] == "业务指标尚未绑定可执行 Measure"

    missing_measure_preview = service.compile_metric_preview("missing_measure")
    assert missing_measure_preview["status"] == "blocked"
    assert missing_measure_preview["bindings"]["measure_ref"] == "orders.unknown"

    source_sql_preview = service.compile_metric_preview("gmv_source_sql")
    assert source_sql_preview["status"] == "ready"
    assert "FROM (\nSELECT * FROM dwd.orders_snapshot\n) AS orders_sql" in source_sql_preview["pseudo_sql"]
    assert "FROM (\nSELECT * FROM dwd.orders_snapshot\n) AS orders_sql" in source_sql_preview["execution_request"]["sql_query"]

    retrieval_preview = service.compile_retrieval_preview(
        retrieval_query="  解释订单口径  ",
        retrieval_sources=[],
        viewer_roles=["analyst"],
    )
    assert retrieval_preview["execution_request"]["sources"] == ["knowledge-base"]
    assert retrieval_preview["traceability"]["retrieval"]["viewer_roles"] == ["analyst"]


def test_execution_compiler_runtime_covers_validation_fallback_and_tool_paths(tmp_path):
    audit_repo = YamlGovernanceAuditTraceRepository(str(tmp_path / "audit"))

    class _PreviewStub:
        def __init__(self, preview):
            self.preview = preview

        def compile_preview(self, **_kwargs):
            return self.preview

    invalid_runtime = ExecutionCompilerRuntimeService(
        preview_service=_PreviewStub({"status": "ready", "target_type": "agent"}),
        execute_query_handler_factory=lambda: None,
    )
    with pytest.raises(ValueError, match="不支持的执行目标类型"):
        invalid_runtime.execute(target_type="agent")

    sql_runtime = ExecutionCompilerRuntimeService(
        preview_service=_PreviewStub({"status": "ready", "target_type": "sql", "execution_request": {"source_id": 1}}),
        execute_query_handler_factory=lambda: None,
    )
    with pytest.raises(ValueError, match="source_id 或 sql_query"):
        sql_runtime.execute(target_type="sql")

    retrieval_preview = {
        "status": "ready",
        "target_type": "retrieval",
        "execution_request": {"query": "解释订单趋势", "top_k": 2},
        "bindings": {"retrieval_query": "解释订单趋势"},
        "policy": {"status": "allow", "visibility": "public", "required_roles": []},
        "traceability": {},
    }
    retrieval_runtime = ExecutionCompilerRuntimeService(
        preview_service=_PreviewStub(retrieval_preview),
        execute_query_handler_factory=lambda: None,
        audit_trace_repository=audit_repo,
    )
    retrieval_result = retrieval_runtime.execute(
        target_type="retrieval",
        retrieval_query="解释订单趋势",
        viewer_roles=["analyst"],
        route_type="hybrid",
    )
    assert retrieval_result["status"] == "not_configured"
    assert retrieval_result["governance_trace"]["execution_status"] == "not_configured"
    assert retrieval_result["governance_trace"]["target_name"] == "解释订单趋势"
    assert retrieval_result["audit_trace_id"] is not None

    class _KnowledgeStub:
        def __init__(self):
            self.calls: list[tuple[str, int]] = []

        def search(self, query, max_results=5):
            self.calls.append((query, max_results))
            if query == "订单":
                return [{"path": "knowledge/orders.md", "title": "订单"}]
            return []

        def read(self, path):
            return f"content:{path}"

    class _SemanticStub:
        def list_cubes(self):
            return [{"name": "orders"}]

        def describe_cube(self, cube_name):
            return {"cube_name": cube_name, "title": "订单立方体"}

    knowledge_service = _KnowledgeStub()
    semantic_service = _SemanticStub()
    runtime = ExecutionCompilerRuntimeService(
        preview_service=_PreviewStub({"status": "ready", "target_type": "tool"}),
        execute_query_handler_factory=lambda: None,
        knowledge_service=knowledge_service,
        semantic_service=semantic_service,
        audit_trace_repository=audit_repo,
    )

    search_result = runtime._execute_tool(
        {
            "target_type": "tool",
            "execution_request": {
                "name": "search_knowledge",
                "arguments": {"query": "订单", "max_results": 2},
            },
            "bindings": {"tool_name": "search_knowledge"},
            "policy": {},
            "traceability": {},
        }
    )
    assert search_result["status"] == "executed"
    assert search_result["result"]["total"] == 1

    read_result = runtime._execute_tool(
        {
            "target_type": "tool",
            "execution_request": {
                "name": "read_knowledge",
                "arguments": {"path": "knowledge/orders.md"},
            },
            "bindings": {"tool_name": "read_knowledge"},
            "policy": {},
            "traceability": {},
        }
    )
    assert read_result["result"]["content"] == "content:knowledge/orders.md"

    list_result = runtime._execute_tool(
        {
            "target_type": "tool",
            "execution_request": {
                "name": "list_cubes",
                "arguments": {},
            },
            "bindings": {"tool_name": "list_cubes"},
            "policy": {},
            "traceability": {},
        }
    )
    assert list_result["result"]["total"] == 1

    not_configured_tool = runtime._execute_tool(
        {
            "target_type": "tool",
            "execution_request": {
                "name": "unknown_tool",
                "arguments": {},
            },
            "bindings": {"tool_name": "unknown_tool"},
            "policy": {},
            "traceability": {},
        }
    )
    assert not_configured_tool["status"] == "not_configured"

    fallback_results = runtime._search_knowledge("解释 订单 趋势", max_results=3)
    assert fallback_results == [{"path": "knowledge/orders.md", "title": "订单"}]
    assert ("解释 订单 趋势", 3) in knowledge_service.calls
    assert ("订单", 3) in knowledge_service.calls

    assert ExecutionCompilerRuntimeService._fallback_retrieval_queries("   ") == []
    assert ExecutionCompilerRuntimeService._fallback_retrieval_queries("解释订单趋势") == ["订单", "解释订单趋势"]


def test_mapper_preview_covers_warning_pending_and_orphan_paths(tmp_path):
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    _save_sample_cube(cube_repo)
    object_repo = YamlBusinessObjectRepository(str(tmp_path / "objects"))
    metric_repo = YamlBusinessMetricRepository(str(tmp_path / "metrics"))
    glossary_repo = YamlGlossaryRepository(str(tmp_path / "glossary"))
    relation_repo = YamlBusinessRelationRepository(str(tmp_path / "relations"))
    action_repo = YamlBusinessActionRepository(str(tmp_path / "actions"))

    object_repo.save(BusinessObject(name="ghost", title="幽灵对象"))
    metric_repo.save(
        BusinessMetric(
            name="orphan_metric",
            title="孤立指标",
            object_name="ghost",
            semantic_formula="无定义",
            measure_refs=["ghost_cube.missing_measure"],
        )
    )
    glossary_repo.save(GlossaryEntry(term="未知术语", canonical_name="missing_metric", entry_type="metric"))
    relation_repo.save(
        BusinessRelation(
            name="ghost_relation",
            title="幽灵关系",
            source_object_name="ghost",
            target_object_name="missing_object",
            relation_type="belongs_to",
        )
    )
    action_repo.save(
        BusinessAction(
            name="ghost_action",
            title="幽灵动作",
            object_name="ghost",
            aliases=["支付事件"],
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

    object_preview = service.preview(entity_type="object", entity_name="ghost")
    assert object_preview["consistency"]["status"] == "warning"

    metric_preview = service.preview(entity_type="metric", entity_name="orphan_metric")
    assert metric_preview["consistency"]["status"] == "stale"
    assert "未解析 Measure 引用: ghost_cube.missing_measure" in metric_preview["consistency"]["issues"]

    glossary_preview = service.preview(entity_type="glossary", entity_name="missing_metric")
    assert glossary_preview["consistency"]["status"] == "warning"

    relation_preview = service.preview(entity_type="relation", entity_name="ghost_relation")
    assert relation_preview["consistency"]["status"] == "warning"
    assert any("未找到目标业务对象" in issue for issue in relation_preview["consistency"]["issues"])

    action_preview = service.preview(entity_type="action", entity_name="ghost_action")
    assert action_preview["projection"]["targets"]
    assert action_preview["consistency"]["status"] == "warning"
    assert "归属业务对象尚未找到可投影的分析实体" in action_preview["consistency"]["issues"]

    orphan_backlinks = service.measure_backlinks("orders.unknown")
    assert orphan_backlinks["status"] == "orphan"

    orphan_cube = service.cube_backlinks("ghost_cube")
    assert orphan_cube["status"] == "orphan"

    property_policy = service.policy_impact(
        {
            "target_type": "property",
            "target_name": "pay_time",
            "visibility": "private",
            "allowed_roles": [],
        }
    )
    assert property_policy["projection_status"] == "pending"
    assert property_policy["governance_hooks"][2]["status"] == "pending"
    assert property_policy["issues"]


def test_mapper_preview_covers_errors_diff_fallback_and_policy_paths(tmp_path):
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    _save_sample_cube(cube_repo)

    object_repo = YamlBusinessObjectRepository(str(tmp_path / "objects"))
    metric_repo = YamlBusinessMetricRepository(str(tmp_path / "metrics"))
    glossary_repo = YamlGlossaryRepository(str(tmp_path / "glossary"))
    relation_repo = YamlBusinessRelationRepository(str(tmp_path / "relations"))
    action_repo = YamlBusinessActionRepository(str(tmp_path / "actions"))

    object_repo.save(BusinessObject(name="order", title="订单"))
    object_repo.save(BusinessObject(name="payment", title="支付事件"))
    object_repo.save(BusinessObject(name="ghost", title="幽灵对象"))

    metric_repo.save(
        BusinessMetric(
            name="fallback_metric",
            title="GMV",
            object_name="order",
            semantic_formula="回退匹配指标",
            measure_refs=[],
        )
    )
    metric_repo.save(
        BusinessMetric(
            name="stale_metric",
            title="坏指标",
            object_name="order",
            semantic_formula="坏指标",
            measure_refs=["badref"],
        )
    )

    glossary_repo.save(GlossaryEntry(term="订单对象", canonical_name="order", entry_type="object"))
    glossary_repo.save(GlossaryEntry(term="未知指标", canonical_name="ghost_metric", entry_type="metric"))

    relation_repo.save(
        BusinessRelation(
            name="order_payment",
            title="订单关联支付事件",
            source_object_name="order",
            target_object_name="payment",
            relation_type="linked_to",
        )
    )
    relation_repo.save(
        BusinessRelation(
            name="ghost_relation",
            title="幽灵关系",
            source_object_name="ghost",
            target_object_name="payment",
            relation_type="linked_to",
        )
    )

    action_repo.save(
        BusinessAction(
            name="missing_action",
            title="缺失动作",
            object_name="missing_object",
            event_cube_refs=["missing_cube"],
        )
    )
    action_repo.save(
        BusinessAction(
            name="unmapped_action",
            title="未映射动作",
            object_name="order",
            event_cube_refs=[],
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

    with pytest.raises(ValueError, match="未找到业务对象"):
        service.preview(entity_type="object", entity_name="missing")
    with pytest.raises(ValueError, match="未找到业务指标"):
        service.preview(entity_type="metric", entity_name="missing")
    with pytest.raises(ValueError, match="未找到业务关系"):
        service.preview(entity_type="relation", entity_name="missing")
    with pytest.raises(ValueError, match="未找到业务动作"):
        service.preview(entity_type="action", entity_name="missing")
    with pytest.raises(ValueError, match="未找到术语"):
        service.preview(entity_type="glossary", entity_name="missing")
    with pytest.raises(ValueError, match="不支持的预览类型"):
        service.preview(entity_type="policy", entity_name="ghost")
    with pytest.raises(ValueError, match="未找到业务指标"):
        service.metric_links("missing")

    fallback_metric = service.preview(entity_type="metric", entity_name="fallback_metric")
    assert fallback_metric["projection"]["targets"][0]["target_name"] == "orders.gmv"

    glossary_preview = service.preview(entity_type="glossary", entity_name="order")
    assert glossary_preview["projection"]["targets"][0]["target_type"] == "object"

    missing_glossary_preview = service.preview(entity_type="glossary", entity_name="ghost_metric")
    assert missing_glossary_preview["consistency"]["status"] == "warning"

    relation_without_join = service.preview(entity_type="relation", entity_name="order_payment")
    assert "未找到可投影的 Join Path" in relation_without_join["consistency"]["issues"]

    relation_with_missing_projection = service.preview(entity_type="relation", entity_name="ghost_relation")
    assert "源业务对象尚未找到可投影的分析实体" in relation_with_missing_projection["consistency"]["issues"]

    missing_action_preview = service.preview(entity_type="action", entity_name="missing_action")
    assert "未找到业务对象: missing_object" in missing_action_preview["consistency"]["issues"]
    assert "未解析 Event Cube 引用: missing_cube" in missing_action_preview["consistency"]["issues"]

    unmapped_action_preview = service.preview(entity_type="action", entity_name="unmapped_action")
    assert "未找到可投影的 Event Cube" in unmapped_action_preview["consistency"]["issues"]

    diff = service.diff()
    assert {item["entity_type"] for item in diff["items"]} == {"object", "metric", "relation", "action"}

    consistency = service.consistency_report()
    assert consistency["summary"]["object_count"] == 3
    assert consistency["summary"]["metric_count"] == 2
    assert consistency["summary"]["glossary_count"] == 2
    assert consistency["summary"]["issue_count"] >= 3

    stale = service.stale_check()
    assert stale["summary"]["stale_count"] >= 3

    object_policy = service.policy_impact(
        {"target_type": "object", "target_name": "order", "visibility": "private", "allowed_roles": ["ops"]}
    )
    assert object_policy["analysis_links"]["cubes"]
    assert object_policy["governance_hooks"][0]["status"] == "active"

    action_policy = service.policy_impact(
        {"target_type": "action", "target_name": "missing_action", "visibility": "restricted", "allowed_roles": []}
    )
    assert action_policy["analysis_links"]["event_cubes"] == []
    assert action_policy["issues"]

    property_policy = service.policy_impact({"target_type": "property", "target_name": "pay_time"})
    assert property_policy["projection_status"] == "pending"

    assert service.measure_backlinks("badref")["status"] == "orphan"
    assert service.cube_backlinks("missing_cube")["status"] == "orphan"
    assert SemanticMapperPreviewService._match_score("", "", [], ["orders"]) == 0
