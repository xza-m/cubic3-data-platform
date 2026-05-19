from __future__ import annotations

from app.application.execution_compiler.preview_service import ExecutionCompilerPreviewService
from app.domain.ontology.entities import BusinessMetric
from app.domain.semantic.entities import CubeDefinition, DimensionDef, JoinDef, MeasureDef
from app.infrastructure.ontology.yaml_metric_repository import YamlBusinessMetricRepository
from app.infrastructure.semantic.yaml_cube_repository import YamlCubeRepository


def test_compile_metric_blocks_stale_measure_ref_with_standard_target_shape(tmp_path):
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    metric_repo = YamlBusinessMetricRepository(str(tmp_path / "metrics"))
    metric_repo.save(
        BusinessMetric(
            name="gmv",
            title="GMV",
            object_name="order",
            semantic_formula="已支付订单金额之和",
            measure_refs=["missing.gmv"],
        )
    )
    compiler = ExecutionCompilerPreviewService(metric_repository=metric_repo, cube_repository=cube_repo)

    preview = compiler.compile_metric_preview("gmv")

    assert preview["status"] == "blocked"
    assert preview["logical_sql"] is None
    assert preview["sql_hash"] is None
    assert preview["bindings"]["measure_ref"] == "missing.gmv"
    assert preview["resource_set"]["logical"]["metrics"] == ["gmv"]
    assert preview["ticket_material"]["target_type"] == "sql"


def test_compile_metric_blocks_non_active_cube(tmp_path):
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    metric_repo = YamlBusinessMetricRepository(str(tmp_path / "metrics"))
    cube_repo.save(
        CubeDefinition(
            name="orders",
            title="订单",
            table="dws.orders",
            status="draft",
            dimensions={"id": DimensionDef(title="ID", type="string", sql="{CUBE}.id")},
            measures={"gmv": MeasureDef(title="GMV", type="sum", sql="{CUBE}.amount")},
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
    compiler = ExecutionCompilerPreviewService(metric_repository=metric_repo, cube_repository=cube_repo)

    preview = compiler.compile_metric_preview("gmv")

    assert preview["status"] == "blocked"
    assert "不能进入默认查询链路" in preview["reason"]
    assert preview["bindings"]["cube_status"] == "draft"
    assert preview["resource_set"]["logical"]["cubes"] == ["orders"]
    assert preview["execution_request"] is None


def test_compile_metric_uses_query_dsl_for_grouped_recent_window(tmp_path):
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    metric_repo = YamlBusinessMetricRepository(str(tmp_path / "metrics"))
    cube_repo.save(
        CubeDefinition(
            name="student_comment_cube",
            title="学生评论",
            table="df_cb_258187.dwd_interaction_comment_reports_df",
            source_id=1,
            source_database="df_cb_258187",
            dimensions={
                "comment_id": DimensionDef(title="评论ID", type="string", sql="{CUBE}.comment_id"),
                "school_id": DimensionDef(title="学校ID", type="string", sql="{CUBE}.comment_school_id"),
                "school_name": DimensionDef(
                    title="学校名称",
                    type="string",
                    sql="{CUBE}.comment_school_name",
                    synonyms=["学校"],
                ),
                "ds": DimensionDef(title="分区日期", type="time", sql="{CUBE}.ds"),
                "comment_content": DimensionDef(
                    title="评论内容",
                    type="string",
                    sql="{CUBE}.comment_content",
                    tags=["restricted"],
                ),
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
    metric_repo.save(
        BusinessMetric(
            name="comment_count",
            title="评论数",
            object_name="StudentComment",
            semantic_formula="按评论ID去重统计评论数量",
            measure_refs=["student_comment_cube.comment_count"],
            aliases=["学生评论数"],
        )
    )
    compiler = ExecutionCompilerPreviewService(metric_repository=metric_repo, cube_repository=cube_repo)

    preview = compiler.compile_metric_preview(
        "comment_count",
        analysis_intent={
            "dimension_terms": ["学校"],
            "time_window": {"type": "last_n_days", "n": 7, "anchor_date": "2026-05-05"},
            "order_by": [{"term": "评论数", "direction": "desc"}],
            "limit": 100,
        },
    )

    assert preview["status"] == "ready"
    assert preview["query_dsl"] == {
        "dsl_version": "v1",
        "measures": ["student_comment_cube.comment_count"],
        "dimensions": ["student_comment_cube.school_name"],
        "filters": [],
        "time_dimensions": [
            {
                "dimension": "student_comment_cube.ds",
                "date_range": ["2026-04-29", "2026-05-05"],
            }
        ],
        "segments": [],
        "order": [["student_comment_cube.comment_count", "desc"]],
        "limit": 100,
    }
    assert "student_comment_cube.comment_school_name AS `student_comment_cube__school_name`" in preview["logical_sql"]
    assert "student_comment_cube.ds >= '20260429'" in preview["logical_sql"]
    assert "student_comment_cube.ds <= '20260505'" in preview["logical_sql"]
    assert "GROUP BY `student_comment_cube__school_name`" in preview["logical_sql"]
    assert "ORDER BY `student_comment_cube__comment_count` DESC" in preview["logical_sql"]
    assert "comment_content" not in preview["logical_sql"]
    assert preview["traceability"]["compiler"]["source"] == "query_compiler"


def test_official_compile_metric_reads_metric_and_cube_from_runtime_snapshot_manifest(tmp_path):
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    metric_repo = YamlBusinessMetricRepository(str(tmp_path / "metrics"))
    compiler = ExecutionCompilerPreviewService(metric_repository=metric_repo, cube_repository=cube_repo)
    runtime_manifest = {
        "ok": True,
        "snapshot_id": "snap_1",
        "release_id": "rel_1",
        "asset_manifest_json": {
            "schema_version": "semantic-runtime-manifest/v1",
            "assets": [
                {
                    "asset_type": "ontology",
                    "asset_key": "metric:comment_count",
                    "revision_id": "rev_metric",
                    "spec_checksum": "a" * 64,
                    "status": "published",
                    "spec": {
                        "metric": {
                            "name": "comment_count",
                            "title": "评论数",
                            "object_name": "StudentComment",
                            "semantic_formula": "按评论ID去重统计评论数量",
                            "measure_refs": ["student_comment_cube.comment_count"],
                            "status": "active",
                        }
                    },
                },
                {
                    "asset_type": "cube",
                    "asset_key": "student_comment_cube",
                    "revision_id": "rev_cube",
                    "spec_checksum": "b" * 64,
                    "status": "published",
                    "spec": {
                        "cube": {
                            "name": "student_comment_cube",
                            "title": "学生评论",
                            "table": "df_cb_258187.dwd_interaction_comment_reports_df",
                            "source_id": 1,
                            "source_database": "df_cb_258187",
                            "dimensions": {
                                "comment_id": {
                                    "title": "评论ID",
                                    "type": "string",
                                    "sql": "{CUBE}.comment_id",
                                },
                                "school_name": {
                                    "title": "学校名称",
                                    "type": "string",
                                    "sql": "{CUBE}.comment_school_name",
                                    "synonyms": ["学校"],
                                },
                            },
                            "measures": {
                                "comment_count": {
                                    "title": "评论数",
                                    "type": "number",
                                    "sql": "COUNT(DISTINCT {CUBE}.comment_id)",
                                    "certified": True,
                                }
                            },
                        }
                    },
                },
            ],
        },
    }

    preview = compiler.compile_metric_preview(
        "comment_count",
        runtime_mode="official",
        runtime_manifest=runtime_manifest,
        analysis_intent={"dimension_terms": ["学校"], "limit": 100},
    )

    assert preview["status"] == "ready"
    assert preview["bindings"]["runtime_snapshot_id"] == "snap_1"
    assert preview["bindings"]["runtime_release_id"] == "rel_1"
    assert preview["resource_set"]["physical"][0]["table"] == "dwd_interaction_comment_reports_df"
    assert "comment_school_name" in preview["logical_sql"]


def test_compile_metric_uses_query_dsl_for_one_hop_join_dimension(tmp_path):
    cube_repo = YamlCubeRepository(str(tmp_path / "cubes"))
    metric_repo = YamlBusinessMetricRepository(str(tmp_path / "metrics"))
    cube_repo.save(
        CubeDefinition(
            name="orders",
            title="订单",
            table="dws.orders",
            source_id=1,
            source_database="dw",
            dimensions={
                "id": DimensionDef(title="订单ID", type="string", sql="{CUBE}.id"),
                "customer_id": DimensionDef(title="客户ID", type="string", sql="{CUBE}.customer_id"),
            },
            measures={"gmv": MeasureDef(title="GMV", type="sum", sql="{CUBE}.amount")},
            joins={
                "customers": JoinDef(
                    cube="customers",
                    relationship="N:1",
                    sql="{CUBE}.customer_id = {customers}.id",
                )
            },
        )
    )
    cube_repo.save(
        CubeDefinition(
            name="customers",
            title="客户",
            table="dim.customers",
            source_id=1,
            source_database="dw",
            dimensions={
                "id": DimensionDef(title="客户ID", type="string", sql="{CUBE}.id"),
                "region": DimensionDef(title="客户地区", type="string", sql="{CUBE}.region", synonyms=["客户区域"]),
            },
            measures={"customer_count": MeasureDef(title="客户数", type="count", sql="{CUBE}.id")},
        )
    )
    metric_repo.save(
        BusinessMetric(
            name="gmv",
            title="GMV",
            object_name="order",
            semantic_formula="订单金额之和",
            measure_refs=["orders.gmv"],
        )
    )
    compiler = ExecutionCompilerPreviewService(metric_repository=metric_repo, cube_repository=cube_repo)

    preview = compiler.compile_metric_preview(
        "gmv",
        analysis_intent={
            "dimension_terms": ["客户地区"],
            "limit": 100,
        },
    )

    assert preview["status"] == "ready"
    assert preview["query_dsl"]["dimensions"] == ["customers.region"]
    assert preview["query_dsl"]["join_path"] == ["orders", "customers"]
    assert "LEFT JOIN dim.customers customers ON orders.customer_id = customers.id" in preview["logical_sql"]
    assert "GROUP BY `customers__region`" in preview["logical_sql"]
