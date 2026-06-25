"""建模 spec 自修复的确定性单测：分区 ds 端到端补全 + 评论 canonical 路径正交。"""
from app.application.semantic.modeling_spec_repair import repair_modeling_spec
from app.application.semantic.modeling_validation_matrix import ValidationMatrixBuilder


def test_repair_promotes_partition_ds_into_time_dimension_and_clears_metric_blocker():
    """含 ds 分区证据的冷启动 spec，repair 后应自动把 ds 补成默认时间维度并打通发布门禁。"""
    raw_spec = {
        "source": {
            "table": "dws_study_student_answer_kb_stat_di",
            "evidence_bundle": {
                "schema_snapshot": {
                    "columns": [
                        {"name": "school_id", "type": "BIGINT", "is_partition": False},
                        {"name": "answer_count", "type": "BIGINT", "is_partition": False},
                        {"name": "ds", "type": "STRING", "is_partition": True},
                    ],
                    "partitions": ["ds"],
                },
            },
        },
        "cube": {
            "name": "dws_study_student_answer_kb_stat_di",
            "table": "dws_study_student_answer_kb_stat_di",
            "dimensions": {
                "school_id": {
                    "title": "学校",
                    "type": "number",
                    "sql": "`school_id`",
                    "primary_key": True,
                },
            },
        },
    }

    repaired = repair_modeling_spec(
        raw_spec,
        user_goal="答题统计",
        source_mode="agent_led",
    )

    cube = repaired["cube"]
    assert cube["partition"]["field"] == "ds"
    assert "ds" in cube["dimensions"]
    assert cube["dimensions"]["ds"]["type"] in {"time", "date"}

    metric = repaired["ontology"]["metrics"][0]
    assert metric["time_dimension"] == "ds"
    assert metric["grain"]
    assert metric["additivity"]

    matrix = ValidationMatrixBuilder().build(repaired, {})
    blocker_codes = {blocker.get("code") for blocker in matrix["blockers"]}
    assert "metric_time_dimension_missing" not in blocker_codes


def test_repair_keeps_comment_canonical_path_orthogonal_to_partition():
    """学生评论目标命中 canonical 负向源整块替换；即便带 ds 证据也不污染评论时间口径。"""
    raw_spec = {
        "source": {
            "table": "view_student_answer_analysis",
            "evidence_bundle": {
                "schema_snapshot": {
                    "columns": [
                        {"name": "school_id", "type": "BIGINT", "is_partition": False},
                        {"name": "ds", "type": "STRING", "is_partition": True},
                    ],
                    "partitions": ["ds"],
                },
            },
        },
        "cube": {
            "name": "view_student_answer_analysis",
            "table": "view_student_answer_analysis",
            "source": "df_cb_258187.view_student_answer_analysis",
            "dimensions": {
                "school_id": {
                    "title": "学校",
                    "type": "number",
                    "sql": "`school_id`",
                    "primary_key": True,
                },
            },
        },
    }

    repaired = repair_modeling_spec(
        raw_spec,
        user_goal="统计学生评论数",
        source_mode="agent_led",
    )

    cube = repaired["cube"]
    # canonical 规则整块替换为评论 cube
    assert cube["table"] == "dwd_interaction_comment_reports_df"
    assert "comment_published_at" in cube["dimensions"]
    # 评论时间口径生效，未被 ds 分区透传污染
    assert "ds" not in cube["dimensions"]
    assert "partition" not in cube

    metric = repaired["ontology"]["metrics"][0]
    assert metric["time_dimension"] == "comment_published_at"
    assert metric["time_dimension"] != "ds"
    assert metric["time_dimension"] in cube["dimensions"]
