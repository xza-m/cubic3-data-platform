from __future__ import annotations

from datetime import date, timedelta

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
            table="dws.orders",
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


class _RuntimeSnapshotServiceStub:
    def __init__(self, payload):
        self.payload = payload

    def get_active_manifest(self, namespace="default"):
        assert namespace == "default"
        return self.payload


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

    projection = alias_route["projection_result"]
    assert projection["binding_status"] == "linked"
    assert projection["resolved_bindings"][0]["cube_name"] == "orders"
    assert projection["resolved_bindings"][0]["measure_ref"] == "orders.gmv"


def test_official_runtime_only_matches_active_ontology_and_glossary_targets(tmp_path):
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    _save_sample_cube(cube_repo)
    object_repo = YamlBusinessObjectRepository(str(tmp_path / "objects"))
    metric_repo = YamlBusinessMetricRepository(str(tmp_path / "metrics"))
    glossary_repo = YamlGlossaryRepository(str(tmp_path / "glossary"))
    relation_repo = YamlBusinessRelationRepository(str(tmp_path / "relations"))
    action_repo = YamlBusinessActionRepository(str(tmp_path / "actions"))
    policy_repo = YamlPolicyMetadataRepository(str(tmp_path / "policies"))

    object_repo.save(BusinessObject(name="order", title="订单", status="active"))
    metric_repo.save(
        BusinessMetric(
            name="active_gmv",
            title="有效GMV",
            object_name="order",
            semantic_formula="已发布 GMV",
            measure_refs=["orders.gmv"],
            aliases=["有效成交额"],
            status="active",
        )
    )
    metric_repo.save(
        BusinessMetric(
            name="draft_gmv",
            title="草稿GMV",
            object_name="order",
            semantic_formula="草稿 GMV",
            measure_refs=["orders.gmv"],
            aliases=["草稿成交额"],
            status="draft",
        )
    )
    glossary_repo.save(
        GlossaryEntry(
            term="草稿口径",
            canonical_name="draft_gmv",
            entry_type="metric",
            status="active",
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

    active_route = service.route(question="查看有效成交额趋势", runtime_mode="official")
    assert active_route["runtime_mode"] == "official"
    assert active_route["business_intent"]["primary_match"]["name"] == "active_gmv"
    assert active_route["route_type"] == "cube"

    draft_route = service.route(question="查看草稿成交额趋势", runtime_mode="official")
    assert draft_route["runtime_mode"] == "official"
    assert draft_route["route_type"] == "blocked"
    assert draft_route["reason"] == "未命中已发布业务语义"

    glossary_route = service.route(question="查看草稿口径趋势", runtime_mode="official")
    assert glossary_route["route_type"] == "blocked"
    assert glossary_route["reason"] == "未命中已发布业务语义"

    preview_route = service.route(question="查看草稿成交额趋势", runtime_mode="preview")
    assert preview_route["runtime_mode"] == "preview"
    assert preview_route["business_intent"]["primary_match"]["name"] == "draft_gmv"


def test_official_runtime_requires_active_sql_snapshot(tmp_path):
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    _save_sample_cube(cube_repo)
    object_repo = YamlBusinessObjectRepository(str(tmp_path / "objects"))
    metric_repo = YamlBusinessMetricRepository(str(tmp_path / "metrics"))
    glossary_repo = YamlGlossaryRepository(str(tmp_path / "glossary"))
    relation_repo = YamlBusinessRelationRepository(str(tmp_path / "relations"))
    action_repo = YamlBusinessActionRepository(str(tmp_path / "actions"))

    metric_repo.save(
        BusinessMetric(
            name="active_gmv",
            title="有效GMV",
            object_name="order",
            semantic_formula="已发布 GMV",
            measure_refs=["orders.gmv"],
            status="active",
        )
    )
    service = SemanticRouterPreviewService(
        object_repository=object_repo,
        metric_repository=metric_repo,
        glossary_repository=glossary_repo,
        relation_repository=relation_repo,
        action_repository=action_repo,
        mapper_preview_service=SemanticMapperPreviewService(
            object_repository=object_repo,
            metric_repository=metric_repo,
            glossary_repository=glossary_repo,
            relation_repository=relation_repo,
            action_repository=action_repo,
            cube_repository=cube_repo,
        ),
        compiler_preview_service=ExecutionCompilerPreviewService(
            metric_repository=metric_repo,
            cube_repository=cube_repo,
        ),
        runtime_snapshot_service=_RuntimeSnapshotServiceStub(
            {"ok": False, "error_code": "semantic_runtime_not_ready"}
        ),
    )

    route = service.route(question="查看有效GMV趋势", runtime_mode="official")

    assert route["route_type"] == "blocked"
    assert route["reason"] == "semantic_runtime_not_ready"
    assert route["traceability"]["runtime"]["manifest_status"] == "blocked"


def test_official_runtime_filters_matches_by_snapshot_manifest(tmp_path):
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    _save_sample_cube(cube_repo)
    object_repo = YamlBusinessObjectRepository(str(tmp_path / "objects"))
    metric_repo = YamlBusinessMetricRepository(str(tmp_path / "metrics"))
    glossary_repo = YamlGlossaryRepository(str(tmp_path / "glossary"))
    relation_repo = YamlBusinessRelationRepository(str(tmp_path / "relations"))
    action_repo = YamlBusinessActionRepository(str(tmp_path / "actions"))
    policy_repo = YamlPolicyMetadataRepository(str(tmp_path / "policies"))

    object_repo.save(BusinessObject(name="order", title="订单", status="active"))
    metric_repo.save(
        BusinessMetric(
            name="active_gmv",
            title="有效GMV",
            object_name="order",
            semantic_formula="已发布 GMV",
            measure_refs=["orders.gmv"],
            aliases=["有效成交额"],
            status="active",
        )
    )
    metric_repo.save(
        BusinessMetric(
            name="yaml_only_gmv",
            title="YAML旁路GMV",
            object_name="order",
            semantic_formula="未发布 GMV",
            measure_refs=["orders.gmv"],
            aliases=["旁路成交额"],
            status="active",
        )
    )
    compiler = ExecutionCompilerPreviewService(metric_repository=metric_repo, cube_repository=cube_repo)
    mapper = SemanticMapperPreviewService(
        object_repository=object_repo,
        metric_repository=metric_repo,
        glossary_repository=glossary_repo,
        relation_repository=relation_repo,
        action_repository=action_repo,
        cube_repository=cube_repo,
    )
    runtime_snapshot = {
        "ok": True,
        "snapshot_id": "snap_1",
        "release_id": "rel_1",
        "asset_manifest_json": {
            "schema_version": "semantic-runtime-manifest/v1",
            "assets": [
                {
                    "asset_id": "asset_metric_active_gmv",
                    "asset_type": "ontology",
                    "asset_key": "metric:active_gmv",
                    "revision_id": "rev_1",
                    "spec_checksum": "a" * 64,
                    "status": "published",
                    "spec": {
                        "metric": {
                            "name": "active_gmv",
                            "title": "有效GMV",
                            "object_name": "order",
                            "semantic_formula": "已发布 GMV",
                            "measure_refs": ["orders.gmv"],
                            "aliases": ["有效成交额"],
                            "status": "active",
                        }
                    },
                },
                {
                    "asset_id": "asset_cube_orders",
                    "asset_type": "cube",
                    "asset_key": "orders",
                    "revision_id": "rev_cube_orders",
                    "spec_checksum": "d" * 64,
                    "status": "published",
                    "spec": {
                        "cube": {
                            "name": "orders",
                            "title": "订单",
                            "table": "dws.orders",
                            "source_id": 1,
                            "source_database": "dw",
                            "dimensions": {
                                "status": {"title": "状态", "type": "string", "sql": "{CUBE}.status"}
                            },
                            "measures": {
                                "gmv": {"title": "GMV", "type": "sum", "sql": "{CUBE}.amount"}
                            },
                        }
                    },
                }
            ],
        },
        "binding_manifest_json": {"schema_version": "semantic-runtime-manifest/v1", "bindings": []},
        "policy_manifest_json": {"schema_version": "semantic-runtime-manifest/v1", "policies": []},
    }
    service = SemanticRouterPreviewService(
        object_repository=object_repo,
        metric_repository=metric_repo,
        glossary_repository=glossary_repo,
        relation_repository=relation_repo,
        action_repository=action_repo,
        mapper_preview_service=mapper,
        compiler_preview_service=compiler,
        runtime_snapshot_service=_RuntimeSnapshotServiceStub(runtime_snapshot),
        policy_guard_service=PolicyGuardService(policy_repository=policy_repo),
    )

    active_route = service.route(question="查看有效成交额趋势", runtime_mode="official")
    yaml_only_route = service.route(question="查看旁路成交额趋势", runtime_mode="official")

    assert active_route["route_type"] == "cube"
    assert active_route["traceability"]["runtime"]["snapshot_id"] == "snap_1"
    assert yaml_only_route["route_type"] == "blocked"
    assert yaml_only_route["reason"] == "未命中已发布业务语义"


def test_official_runtime_routes_and_compiles_from_snapshot_manifest_without_yaml(tmp_path):
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    object_repo = YamlBusinessObjectRepository(str(tmp_path / "objects"))
    metric_repo = YamlBusinessMetricRepository(str(tmp_path / "metrics"))
    glossary_repo = YamlGlossaryRepository(str(tmp_path / "glossary"))
    relation_repo = YamlBusinessRelationRepository(str(tmp_path / "relations"))
    action_repo = YamlBusinessActionRepository(str(tmp_path / "actions"))
    policy_repo = YamlPolicyMetadataRepository(str(tmp_path / "policies"))
    runtime_snapshot = {
        "ok": True,
        "snapshot_id": "snap_sql",
        "release_id": "rel_sql",
        "asset_manifest_json": {
            "schema_version": "semantic-runtime-manifest/v1",
            "assets": [
                {
                    "asset_id": "asset_metric_comment_count",
                    "asset_type": "ontology",
                    "asset_key": "metric:comment_count",
                    "revision_id": "rev_metric",
                    "spec_checksum": "b" * 64,
                    "status": "published",
                    "spec": {
                        "metric": {
                            "name": "comment_count",
                            "title": "学生评论数",
                            "object_name": "StudentComment",
                            "semantic_formula": "按评论ID去重统计评论数量",
                            "measure_refs": ["student_comment_cube.comment_count"],
                            "aliases": ["评论数"],
                            "status": "active",
                        }
                    },
                },
                {
                    "asset_id": "asset_cube_student_comment",
                    "asset_type": "cube",
                    "asset_key": "student_comment_cube",
                    "revision_id": "rev_cube",
                    "spec_checksum": "c" * 64,
                    "status": "published",
                    "spec": {
                        "cube": {
                            "name": "student_comment_cube",
                            "title": "学生评论",
                            "table": "df_cb_258187.dwd_interaction_comment_reports_df",
                            "source_id": 1,
                            "source_database": "df_cb_258187",
                            "dimensions": {
                                "school_name": {
                                    "title": "学校名称",
                                    "type": "string",
                                    "sql": "{CUBE}.comment_school_name",
                                    "synonyms": ["学校"],
                                },
                                "ds": {"title": "分区日期", "type": "time", "sql": "{CUBE}.ds"},
                            },
                            "measures": {
                                "comment_count": {
                                    "title": "评论数",
                                    "type": "number",
                                    "sql": "COUNT(DISTINCT {CUBE}.comment_id)",
                                    "certified": True,
                                }
                            },
                            "partition": {
                                "field": "ds",
                                "type": "date",
                                "format": "yyyyMMdd",
                                "max_range_days": 30,
                            },
                        }
                    },
                },
            ],
        },
        "binding_manifest_json": {"schema_version": "semantic-runtime-manifest/v1", "bindings": []},
        "policy_manifest_json": {"schema_version": "semantic-runtime-manifest/v1", "policies": []},
    }
    compiler = ExecutionCompilerPreviewService(metric_repository=metric_repo, cube_repository=cube_repo)
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
        runtime_snapshot_service=_RuntimeSnapshotServiceStub(runtime_snapshot),
        policy_guard_service=PolicyGuardService(policy_repository=policy_repo),
    )

    result = service.execute_plan_preview(
        question="查询最近7天评论数，按学校汇总",
        runtime_mode="official",
        viewer_roles=["ops_readonly"],
    )

    route = result["route"]
    preview = result["compiled_targets"][0]["preview"]
    assert route["route_type"] == "cube"
    assert route["matched"]["metric_name"] == "comment_count"
    assert result["projection_result"]["binding_status"] == "linked"
    assert preview["status"] == "ready"
    assert preview["bindings"]["runtime_snapshot_id"] == "snap_sql"
    assert preview["bindings"]["runtime_release_id"] == "rel_sql"
    assert "df_cb_258187.dwd_interaction_comment_reports_df" in preview["logical_sql"]
    assert "comment_school_name" in preview["logical_sql"]


def test_official_runtime_extracts_analysis_slots_and_compiles_query_dsl(tmp_path):
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    cube_repo.save(
        CubeDefinition(
            name="student_comment_cube",
            title="学生评论",
            table="df_cb_258187.dwd_interaction_comment_reports_df",
            source_id=1,
            source_database="df_cb_258187",
            dimensions={
                "comment_id": DimensionDef(title="评论ID", type="string", sql="{CUBE}.comment_id"),
                "school_name": DimensionDef(
                    title="学校名称",
                    type="string",
                    sql="{CUBE}.comment_school_name",
                    synonyms=["学校"],
                ),
                "ds": DimensionDef(title="分区日期", type="time", sql="{CUBE}.ds"),
            },
            measures={
                "comment_count": MeasureDef(
                    title="评论数",
                    type="number",
                    sql="COUNT(DISTINCT {CUBE}.comment_id)",
                    certified=True,
                )
            },
            partition={"field": "ds", "type": "date", "format": "yyyyMMdd", "max_range_days": 30},
        )
    )
    object_repo = YamlBusinessObjectRepository(str(tmp_path / "objects"))
    metric_repo = YamlBusinessMetricRepository(str(tmp_path / "metrics"))
    glossary_repo = YamlGlossaryRepository(str(tmp_path / "glossary"))
    relation_repo = YamlBusinessRelationRepository(str(tmp_path / "relations"))
    action_repo = YamlBusinessActionRepository(str(tmp_path / "actions"))
    policy_repo = YamlPolicyMetadataRepository(str(tmp_path / "policies"))
    object_repo.save(BusinessObject(name="StudentComment", title="学生评论", status="active"))
    metric_repo.save(
        BusinessMetric(
            name="comment_count",
            title="评论数",
            object_name="StudentComment",
            semantic_formula="按评论ID去重统计评论数量",
            measure_refs=["student_comment_cube.comment_count"],
            aliases=["学生评论数"],
            status="active",
        )
    )

    compiler = ExecutionCompilerPreviewService(metric_repository=metric_repo, cube_repository=cube_repo)
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

    result = service.execute_plan_preview(
        question="查询最近7天学生评论数，按学校汇总",
        runtime_mode="official",
        viewer_roles=["ops_readonly"],
    )

    target = result["execution_targets"][0]
    preview = result["compiled_targets"][0]["preview"]
    anchor = date.today()
    start = anchor - timedelta(days=6)
    assert target["analysis_intent"]["dimension_terms"] == ["学校"]
    assert target["analysis_intent"]["time_window"]["type"] == "last_n_days"
    assert target["analysis_intent"]["time_window"]["n"] == 7
    assert preview["query_dsl"]["measures"] == ["student_comment_cube.comment_count"]
    assert preview["query_dsl"]["dimensions"] == ["student_comment_cube.school_name"]
    assert preview["query_dsl"]["time_dimensions"] == [
        {
            "dimension": "student_comment_cube.ds",
            "date_range": [start.strftime("%Y-%m-%d"), anchor.strftime("%Y-%m-%d")],
        }
    ]
    assert "GROUP BY `student_comment_cube__school_name`" in preview["logical_sql"]
    assert "COUNT(DISTINCT student_comment_cube.comment_id)" in preview["logical_sql"]


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


def test_router_covers_empty_question_unmatched_and_missing_runtime_paths(tmp_path):
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    _save_sample_cube(cube_repo)
    object_repo = YamlBusinessObjectRepository(str(tmp_path / "objects"))
    metric_repo = YamlBusinessMetricRepository(str(tmp_path / "metrics"))
    glossary_repo = YamlGlossaryRepository(str(tmp_path / "glossary"))
    relation_repo = YamlBusinessRelationRepository(str(tmp_path / "relations"))
    action_repo = YamlBusinessActionRepository(str(tmp_path / "actions"))
    policy_repo = YamlPolicyMetadataRepository(str(tmp_path / "policies"))

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

    try:
        service.route(question="")
        raise AssertionError("empty question should fail")
    except ValueError as exc:
        assert "问题不能为空" in str(exc)

    unmatched = service.route(question="随便聊聊天气")
    assert unmatched["route_type"] == "blocked"
    assert unmatched["matched_entities"] == []

    try:
        service.execute_plan(question="查看GMV趋势")
        raise AssertionError("missing runtime should fail")
    except ValueError as exc:
        assert "未配置语义执行运行时" in str(exc)


def test_router_covers_glossary_resolution_projection_steps_and_internal_fallbacks(tmp_path):
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    _save_sample_cube(cube_repo)
    object_repo = YamlBusinessObjectRepository(str(tmp_path / "objects"))
    metric_repo = YamlBusinessMetricRepository(str(tmp_path / "metrics"))
    glossary_repo = YamlGlossaryRepository(str(tmp_path / "glossary"))
    relation_repo = YamlBusinessRelationRepository(str(tmp_path / "relations"))
    action_repo = YamlBusinessActionRepository(str(tmp_path / "actions"))

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
    glossary_repo.save(GlossaryEntry(term="对象术语", canonical_name="order", entry_type="object"))
    glossary_repo.save(GlossaryEntry(term="指标术语", canonical_name="gmv", entry_type="metric"))
    glossary_repo.save(GlossaryEntry(term="关系术语", canonical_name="order_customer", entry_type="relation"))
    glossary_repo.save(GlossaryEntry(term="动作术语", canonical_name="payment", entry_type="action"))

    compiler = ExecutionCompilerPreviewService(metric_repository=metric_repo, cube_repository=cube_repo)
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
    )

    assert service._match_metric("查看指标术语趋势") == (metric_repo.get("gmv"), "glossary")
    assert service._match_object("查看对象术语趋势") == (object_repo.get("order"), "glossary")
    assert service._match_relation("分析关系术语") == (relation_repo.get("order_customer"), "glossary")
    assert service._match_action("触发动作术语") == (action_repo.get("payment"), "glossary")
    assert service._evaluate_policy(target_type="object", target_name="order", viewer_roles=[]) == {
        "status": "allow",
        "visibility": "public",
        "matched_policy": None,
        "required_roles": [],
    }

    relation_plan = service.plan(question="分析关系术语")
    assert relation_plan["route"]["route_type"] == "cube"
    assert any(step["step_type"] == "projection_preview" for step in relation_plan["steps"])

    assert service._build_legacy_match_payload(
        primary_entity={"entity_type": "unknown"},
        matched_metric=None,
        matched_relation=None,
        matched_action=None,
        matched_object=None,
        metric_match_source=None,
        relation_match_source=None,
        action_match_source=None,
        object_match_source=None,
    ) == {}
    assert service._build_execution_targets(
        question="发送对象通知",
        targets=["tool"],
        matched_metric=None,
        matched_action=None,
        matched_object=object_repo.get("order"),
    )[0]["tool_name"] == "search_knowledge"
    assert service._build_execution_targets(
        question="发送通知",
        targets=["tool"],
        matched_metric=None,
        matched_action=None,
        matched_object=None,
    )[0]["tool_arguments"]["query"] == "发送通知"


def test_router_covers_blocked_reason_paths_for_action_and_object(tmp_path):
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    _save_sample_cube(cube_repo)
    object_repo = YamlBusinessObjectRepository(str(tmp_path / "objects"))
    metric_repo = YamlBusinessMetricRepository(str(tmp_path / "metrics"))
    glossary_repo = YamlGlossaryRepository(str(tmp_path / "glossary"))
    relation_repo = YamlBusinessRelationRepository(str(tmp_path / "relations"))
    action_repo = YamlBusinessActionRepository(str(tmp_path / "actions"))
    policy_repo = YamlPolicyMetadataRepository(str(tmp_path / "policies"))

    object_repo.save(BusinessObject(name="order", title="订单"))
    action_repo.save(
        BusinessAction(
            name="payment",
            title="支付",
            object_name="order",
            event_cube_refs=["payment_events"],
        )
    )
    glossary_repo.save(GlossaryEntry(term="对象术语", canonical_name="order", entry_type="object"))
    glossary_repo.save(GlossaryEntry(term="动作术语", canonical_name="payment", entry_type="action"))
    policy_repo.save(
        PolicyMetadata(
            name="order_private",
            target_type="object",
            target_name="order",
            visibility="private",
            allowed_roles=["admin"],
        )
    )
    policy_repo.save(
        PolicyMetadata(
            name="payment_private",
            target_type="action",
            target_name="payment",
            visibility="private",
            allowed_roles=["admin"],
        )
    )

    compiler = ExecutionCompilerPreviewService(metric_repository=metric_repo, cube_repository=cube_repo)
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

    blocked_action = service.route(question="触发动作术语")
    assert blocked_action["route_type"] == "blocked"
    assert "私有" in blocked_action["reason"]

    blocked_object = service.route(question="查看对象术语趋势")
    assert blocked_object["route_type"] == "blocked"
    assert "私有" in blocked_object["reason"]
