"""建模 spec 自修复的确定性单测：分区 ds 端到端补全 + 评论 canonical 路径正交。"""
from app.application.semantic.modeling_spec_repair import (
    _repair_measure_refs,
    repair_modeling_spec,
)
from app.application.semantic.modeling_validation_matrix import ValidationMatrixBuilder
from app.domain.ontology.entities import measure_ref_strings


def _measure_ref_spec(measures: dict, metric_measure_refs: list, **metric_overrides):
    """构造带显式 measures 与 metric.measure_refs 的最小 spec，专测 measure_ref 自修复。"""
    metric = {
        "name": "kpi_metric",
        "title": "KPI",
        "object_name": "kpi_object",
        "measure_refs": metric_measure_refs,
    }
    metric.update(metric_overrides)
    return {
        "spec_version": "v1",
        "source": {"table": "fct_kpi"},
        "business": {"subject": "指标"},
        "cube": {
            "name": "fct_kpi",
            "table": "fct_kpi",
            "dimensions": {
                "biz_date": {"title": "日期", "type": "time", "sql": "`biz_date`"},
                "id": {"title": "ID", "type": "string", "sql": "`id`", "primary_key": True},
            },
            "measures": measures,
        },
        "ontology": {
            "object": {"name": "kpi_object"},
            "metrics": [metric],
        },
    }


_BASE_MEASURES = {
    "total_count": {
        "title": "总数",
        "type": "count",
        "sql": "COUNT(`id`)",
        "certified": True,
        "non_additive": False,
    },
    "avg_rate": {
        "title": "平均比率",
        "type": "avg",
        "sql": "AVG(`rate`)",
        "certified": True,
        "non_additive": True,
    },
}


def _first_ref(repaired):
    return measure_ref_strings(repaired["ontology"]["metrics"][0]["measure_refs"])[0]


def test_repair_keeps_real_non_default_measure_ref():
    """B1：metric 绑真实存在的 avg_rate（非默认度量）→ repair 后必须保留，不被改回 total_count。"""
    raw = _measure_ref_spec(_BASE_MEASURES, [{"ref": "fct_kpi.avg_rate", "role": "primary"}])

    repaired = repair_modeling_spec(raw, user_goal="平均比率", source_mode="human_led")

    assert _first_ref(repaired) == "fct_kpi.avg_rate"


def test_repair_preserves_unknown_measure_ref_for_validation_to_block():
    """typo 缺口：ref 指向不存在度量（foo）→ repair 不再静默改回 total_count，
    而是保留 ref（规整 cube 名）交给 ValidationMatrix 拦成 metric_measure_ref_unknown。"""
    raw = _measure_ref_spec(_BASE_MEASURES, [{"ref": "fct_kpi.foo", "role": "primary"}])

    repaired = repair_modeling_spec(raw, user_goal="未知指标", source_mode="human_led")

    # repair 保留 typo ref（不再蒙混成 total_count）
    assert _first_ref(repaired) == "fct_kpi.foo"
    # ValidationMatrix 把它拦成 blocker
    matrix = ValidationMatrixBuilder().build(repaired, {"status": "ready", "issues": []})
    assert any(b["code"] == "metric_measure_ref_unknown" for b in matrix["blockers"])


def test_validation_matrix_blocks_additivity_mismatch_for_non_additive_measure():
    """additivity 一致性：metric 声明 additive 但绑定度量 non_additive（avg_rate）→ ValidationMatrix 拦成 metric_additivity_mismatch。"""
    raw = _measure_ref_spec(
        _BASE_MEASURES,
        [{"ref": "fct_kpi.avg_rate", "role": "primary"}],
        additivity="additive",  # 危险方向：non_additive 度量被标 additive
        grain="biz_date",
        time_dimension="biz_date",
        binding_status="approved",
    )

    repaired = repair_modeling_spec(raw, user_goal="平均比率", source_mode="human_led")
    # repair 尊重显式 additivity（additive 不被覆盖），ref 保留 avg_rate
    assert _first_ref(repaired) == "fct_kpi.avg_rate"
    assert repaired["ontology"]["metrics"][0]["additivity"] == "additive"

    matrix = ValidationMatrixBuilder().build(repaired, {"status": "ready", "issues": []})
    assert any(b["code"] == "metric_additivity_mismatch" for b in matrix["blockers"])


def test_validation_matrix_allows_non_additive_metric_on_non_additive_measure():
    """守一致性正例：non_additive 度量被正确标 non_additive → 不产 additivity mismatch blocker。"""
    raw = _measure_ref_spec(
        _BASE_MEASURES,
        [{"ref": "fct_kpi.avg_rate", "role": "primary"}],
        additivity="non_additive",
        grain="biz_date",
        time_dimension="biz_date",
        binding_status="approved",
    )

    repaired = repair_modeling_spec(raw, user_goal="平均比率", source_mode="human_led")
    matrix = ValidationMatrixBuilder().build(repaired, {"status": "ready", "issues": []})

    codes = {b["code"] for b in matrix["blockers"]}
    assert "metric_additivity_mismatch" not in codes
    assert "metric_measure_ref_unknown" not in codes


def test_repair_skeleton_default_ref_stays_total_count_and_no_blockers():
    """B1 守 happy path：骨架默认 ref → repair 后仍 total_count，且 ValidationMatrix blockers=0。"""
    raw = _measure_ref_spec(
        {"total_count": _BASE_MEASURES["total_count"]},
        [{"ref": "fct_kpi.total_count", "role": "primary"}],
        grain="biz_date",
        time_dimension="biz_date",
        additivity="additive",
        binding_status="approved",
    )

    repaired = repair_modeling_spec(raw, user_goal="总量", source_mode="agent_led")

    assert _first_ref(repaired) == "fct_kpi.total_count"
    matrix = ValidationMatrixBuilder().build(repaired, {})
    assert matrix["blockers"] == []


def test_repair_placeholder_ref_normalized_to_default():
    """B1 守占位：字面 'candidate cube.measure' → 规整为默认 {cube}.total_count。"""
    raw = _measure_ref_spec(
        {"total_count": _BASE_MEASURES["total_count"]},
        [{"ref": "candidate cube.measure", "role": "primary"}],
    )

    repaired = repair_modeling_spec(raw, user_goal="占位", source_mode="agent_led")

    assert _first_ref(repaired) == "fct_kpi.total_count"


def test_repair_preserves_external_cube_ref_even_with_same_measure_name():
    """#2：ref 'sales_cube.avg_rate' 指向另一个真实 cube，即便当前 cube 也有同名 avg_rate，
    repair 也不得把前缀静默改成当前 cube（否则跨 cube 改错绑定 + 绕过治理门）。原样保留交校验。"""
    raw = _measure_ref_spec(_BASE_MEASURES, [{"ref": "sales_cube.avg_rate", "role": "primary"}])

    repaired = repair_modeling_spec(raw, user_goal="平均比率", source_mode="human_led")

    assert _first_ref(repaired) == "sales_cube.avg_rate"


def test_repair_preserves_explicit_non_additive_with_real_measure():
    """B1 数据一致性：显式 additivity=non_additive + 绑真实 avg_rate → 两者都保留。"""
    raw = _measure_ref_spec(
        _BASE_MEASURES,
        [{"ref": "fct_kpi.avg_rate", "role": "primary"}],
        additivity="non_additive",
    )

    repaired = repair_modeling_spec(raw, user_goal="平均比率", source_mode="human_led")

    metric = repaired["ontology"]["metrics"][0]
    assert measure_ref_strings(metric["measure_refs"])[0] == "fct_kpi.avg_rate"
    assert metric["additivity"] == "non_additive"


def test_repair_keeps_current_cube_real_measure_ref_unchanged():
    """#2 反例守护：ref 前缀就是当前 cube + 真实度量 → 行为不变（保留）。"""
    raw = _measure_ref_spec(_BASE_MEASURES, [{"ref": "fct_kpi.avg_rate", "role": "primary"}])

    repaired = repair_modeling_spec(raw, user_goal="平均比率", source_mode="human_led")

    assert _first_ref(repaired) == "fct_kpi.avg_rate"


def test_repair_keeps_human_set_pending_binding_status():
    """#4：human_led 显式 binding_status='pending' → repair 不得改成 approved，
    validate 出 binding_lifecycle_not_approved 治理门。"""
    raw = _measure_ref_spec(
        _BASE_MEASURES,
        [{"ref": "fct_kpi.total_count", "role": "primary"}],
        grain="biz_date",
        time_dimension="biz_date",
        additivity="additive",
        binding_status="pending",
    )

    repaired = repair_modeling_spec(raw, user_goal="总量", source_mode="human_led")

    metric = repaired["ontology"]["metrics"][0]
    assert metric["binding_status"] == "pending"
    matrix = ValidationMatrixBuilder().build(repaired, {"status": "ready", "issues": []})
    assert any(b["code"] == "binding_lifecycle_not_approved" for b in matrix["blockers"])


def test_repair_defaults_unset_binding_status_to_approved():
    """#4 守 happy path：未设 binding_status → 仍默认 approved（骨架/onboard 升的指标不受影响）。"""
    raw = _measure_ref_spec(
        {"total_count": _BASE_MEASURES["total_count"]},
        [{"ref": "fct_kpi.total_count", "role": "primary"}],
        grain="biz_date",
        time_dimension="biz_date",
        additivity="additive",
    )

    repaired = repair_modeling_spec(raw, user_goal="总量", source_mode="agent_led")

    assert repaired["ontology"]["metrics"][0]["binding_status"] == "approved"


def test_repair_defaults_additivity_to_non_additive_for_non_additive_measure():
    """#3：metric 绑非可加度量（avg_rate）且未设 additivity → repair 默认 non_additive，
    无 metric_additivity_mismatch，validate 不死锁。"""
    raw = _measure_ref_spec(
        _BASE_MEASURES,
        [{"ref": "fct_kpi.avg_rate", "role": "primary"}],
        grain="biz_date",
        time_dimension="biz_date",
        binding_status="approved",
        # 故意缺 additivity → 走 repair 默认逻辑
    )

    repaired = repair_modeling_spec(raw, user_goal="平均比率", source_mode="human_led")

    metric = repaired["ontology"]["metrics"][0]
    assert metric["additivity"] == "non_additive"
    matrix = ValidationMatrixBuilder().build(repaired, {"status": "ready", "issues": []})
    codes = {b["code"] for b in matrix["blockers"]}
    assert "metric_additivity_mismatch" not in codes
    assert "metric_additivity_missing" not in codes


def test_repair_defaults_additivity_to_additive_for_additive_measure():
    """#3 反例守护：metric 绑可加度量（total_count, non_additive=False）未设 additivity → 默认 additive。"""
    raw = _measure_ref_spec(
        {"total_count": _BASE_MEASURES["total_count"]},
        [{"ref": "fct_kpi.total_count", "role": "primary"}],
        grain="biz_date",
        time_dimension="biz_date",
        binding_status="approved",
    )

    repaired = repair_modeling_spec(raw, user_goal="总量", source_mode="human_led")

    assert repaired["ontology"]["metrics"][0]["additivity"] == "additive"


def test_repair_non_additive_default_is_idempotent_across_repeated_repairs():
    """#3 幂等：非可加度量 metric 反复 repair → additivity 稳定 non_additive，无 mismatch 死锁。"""
    raw = _measure_ref_spec(
        _BASE_MEASURES,
        [{"ref": "fct_kpi.avg_rate", "role": "primary"}],
        grain="biz_date",
        time_dimension="biz_date",
        binding_status="approved",
    )

    repaired = repair_modeling_spec(raw, user_goal="平均比率", source_mode="human_led")
    for _ in range(3):
        repaired = repair_modeling_spec(repaired, user_goal="平均比率", source_mode="human_led")

    metric = repaired["ontology"]["metrics"][0]
    assert metric["additivity"] == "non_additive"
    matrix = ValidationMatrixBuilder().build(repaired, {"status": "ready", "issues": []})
    assert not any(b["code"] == "metric_additivity_mismatch" for b in matrix["blockers"])


def test_repair_measure_refs_unit_scopes_to_current_cube_only():
    """单元级：_repair_measure_refs 只规整/校验当前 cube 的 ref。
    - 当前 cube 的真实度量：放行。
    - 当前 cube 的 typo（不存在度量）：保留 ref，不蒙混成默认度量（交给 ValidationMatrix 拦）。
    - 外部 cube 引用（前缀≠当前 cube）：原样保留，repair 无权改前缀（#2）。
    - 占位符：默认到 valid。"""
    known = {"total_count": {}, "avg_rate": {}}
    # 当前 cube 的真实度量：放行（前缀已是当前 cube）
    out = _repair_measure_refs([{"ref": "fct_kpi.avg_rate"}], "fct_kpi", "total_count", known)
    assert out[0]["ref"] == "fct_kpi.avg_rate"
    # 当前 cube 的 typo（不存在度量）：保留 ref，不再蒙混成 total_count
    out2 = _repair_measure_refs([{"ref": "fct_kpi.bogus"}], "fct_kpi", "total_count", known)
    assert out2[0]["ref"] == "fct_kpi.bogus"
    # 外部 cube 引用（前缀≠当前 cube，即便度量同名也不改前缀）：原样保留
    out3 = _repair_measure_refs([{"ref": "old.avg_rate"}], "fct_kpi", "total_count", known)
    assert out3[0]["ref"] == "old.avg_rate"
    # 占位符仍默认到 valid
    out4 = _repair_measure_refs([{"ref": "candidate cube.measure"}], "fct_kpi", "total_count", known)
    assert out4[0]["ref"] == "fct_kpi.total_count"
    out5 = _repair_measure_refs([{"ref": "cube.measure"}], "fct_kpi", "total_count", known)
    assert out5[0]["ref"] == "fct_kpi.total_count"


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


def _answer_stats_spec():
    """带 avg 度量 + 同 stem 计数 SUM 度量的最小 spec，专测 repair 端到端拆 ratio。"""
    return {
        "spec_version": "v1",
        "source": {"table": "dws_answer_stats"},
        "business": {"subject": "答题"},
        "cube": {
            "name": "dws_answer_stats",
            "title": "答题统计",
            "table": "dws_answer_stats",
            "dimensions": {
                "school_name": {"title": "学校", "type": "string", "sql": "`school_name`"},
                "ds": {"title": "日期", "type": "time", "sql": "`ds`"},
                "stat_id": {"title": "ID", "type": "string", "sql": "`stat_id`", "primary_key": True},
            },
            "measures": {
                "total_count": {"title": "总数", "type": "count", "sql": "COUNT(`stat_id`)", "certified": True, "non_additive": False},
                "avg_answer_duration": {"title": "平均答题时长", "type": "avg", "sql": "AVG(`answer_duration`)", "non_additive": True},
                "sum_answer_cnt": {"title": "答题次数合计", "type": "sum", "sql": "SUM(`answer_cnt`)", "non_additive": False},
            },
        },
        "ontology": {
            "object": {"name": "answer_stat"},
            "metrics": [
                {
                    "name": "answer_avg_duration",
                    "title": "平均答题时长",
                    "object_name": "answer_stat",
                    "measure_refs": [{"ref": "dws_answer_stats.avg_answer_duration", "role": "primary"}],
                }
            ],
        },
    }


def test_repair_decomposes_avg_measure_and_sets_ratio_metric_metadata():
    repaired = repair_modeling_spec(_answer_stats_spec(), user_goal="各学校平均答题时长")
    measures = repaired["cube"]["measures"]

    assert measures["avg_answer_duration"]["type"] == "ratio"
    assert measures["avg_answer_duration"]["non_additive"] is False
    assert measures["avg_answer_duration"]["sql"] == "{sum_answer_duration} / NULLIF({sum_answer_cnt}, 0)"
    assert measures["sum_answer_duration"]["sql"] == "SUM(`answer_duration`)"

    metric = repaired["ontology"]["metrics"][0]
    assert metric["additivity"] == "non_additive"
    assert metric["semantic_formula"] == "SUM(`answer_duration`) / SUM(`answer_cnt`)"


def test_repair_ratio_spec_passes_validation_matrix_without_blockers():
    repaired = repair_modeling_spec(_answer_stats_spec(), user_goal="各学校平均答题时长")
    matrix = ValidationMatrixBuilder().build(repaired, {"issues": []})
    codes = {b["code"] for b in matrix["blockers"]}
    assert "metric_additivity_mismatch" not in codes
    assert "metric_measure_ref_unknown" not in codes
    assert "metric_additivity_missing" not in codes


def test_repaired_ratio_cube_compiles_to_sum_over_sum_with_grouping():
    """端到端：repair 产出的 ratio cube 经 QueryCompiler 编出 SUM/SUM + GROUP BY。"""
    from app.domain.semantic.compiler import QueryCompiler
    from app.domain.semantic.entities import CubeDefinition, QueryDSL
    from app.domain.semantic.join_graph import JoinGraph

    repaired = repair_modeling_spec(_answer_stats_spec(), user_goal="各学校平均答题时长")
    cube = CubeDefinition(**repaired["cube"])
    result = QueryCompiler(JoinGraph([cube])).compile(
        QueryDSL(
            measures=["dws_answer_stats.avg_answer_duration"],
            dimensions=["dws_answer_stats.school_name"],
        )
    )
    flat = result.sql.replace(" ", "")
    assert "SUM(`answer_duration`)/NULLIF(SUM(`answer_cnt`),0)" in flat
    assert "GROUP BY" in result.sql
    assert "{" not in result.sql
