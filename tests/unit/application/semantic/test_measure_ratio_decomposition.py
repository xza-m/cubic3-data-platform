"""确定性均值/比率拆分 helper 的单测：覆盖加权/总量/歧义降级/不可重算跳过/复用。"""
from app.application.semantic.measure_ratio_decomposition import decompose_ratio_measures


def _avg_measure(sql, *, title="平均值", non_additive=True):
    return {"title": title, "type": "avg", "sql": sql, "non_additive": non_additive}


def _sum_measure(col, *, title="合计"):
    return {"title": title, "type": "sum", "sql": f"SUM(`{col}`)", "non_additive": False}


def test_plain_total_column_decomposes_to_sum_over_sum():
    """总量列：avg_answer_duration=AVG(answer_duration) → SUM(answer_duration)/SUM(answer_cnt)。"""
    measures = {
        "total_count": {"title": "总数", "type": "count", "sql": "COUNT(`id`)", "non_additive": False},
        "avg_answer_duration": _avg_measure("AVG(`answer_duration`)", title="平均答题时长"),
    }
    columns = [
        {"name": "answer_duration", "type": "double", "comment": "答题总时长"},
        {"name": "answer_cnt", "type": "bigint", "comment": "答题次数"},
    ]
    result = decompose_ratio_measures(measures, columns=columns)

    ratio = result.measures["avg_answer_duration"]
    assert ratio["type"] == "ratio"
    assert ratio["non_additive"] is False
    assert ratio["sql"] == "{sum_answer_duration} / NULLIF({sum_answer_cnt}, 0)"
    assert result.measures["sum_answer_duration"]["sql"] == "SUM(`answer_duration`)"
    assert result.measures["sum_answer_duration"]["type"] == "sum"
    assert result.measures["sum_answer_duration"]["certified"] is False
    assert result.measures["sum_answer_cnt"]["sql"] == "SUM(`answer_cnt`)"

    assert len(result.ratios) == 1
    info = result.ratios[0]
    assert info.weighted is False
    assert info.source_column == "answer_duration"
    assert info.weight_column == "answer_cnt"
    assert info.semantic_formula == "SUM(`answer_duration`) / SUM(`answer_cnt`)"


def test_pre_averaged_column_decomposes_to_weighted_sum():
    """已是 per-row 均值的列：分子加权 SUM(C*W)（= 还原总量）。"""
    measures = {
        "avg_answer_duration": _avg_measure("AVG(`avg_answer_duration`)", title="平均答题时长"),
    }
    columns = [
        {"name": "avg_answer_duration", "type": "double", "comment": "平均答题时长"},
        {"name": "answer_cnt", "type": "bigint", "comment": "答题次数"},
    ]
    result = decompose_ratio_measures(measures, columns=columns)

    ratio = result.measures["avg_answer_duration"]
    assert ratio["type"] == "ratio"
    assert ratio["sql"] == "{wsum_answer_duration} / NULLIF({sum_answer_cnt}, 0)"
    assert result.measures["wsum_answer_duration"]["sql"] == "SUM(`avg_answer_duration` * `answer_cnt`)"
    assert result.ratios[0].weighted is True


def test_rate_column_with_single_count_uses_total_count_as_weight():
    """比率列无 stem 命中，但全局恰好 1 个计数列 → 以该计数列为分母（加权）。"""
    measures = {
        "avg_accuracy_rate": _avg_measure("AVG(`accuracy_rate`)", title="正确率"),
    }
    columns = [
        {"name": "accuracy_rate", "type": "double", "comment": "正确率"},
        {"name": "answer_cnt", "type": "bigint", "comment": "答题次数"},
    ]
    result = decompose_ratio_measures(measures, columns=columns)
    ratio = result.measures["avg_accuracy_rate"]
    assert ratio["type"] == "ratio"
    assert ratio["sql"] == "{wsum_accuracy_rate} / NULLIF({sum_answer_cnt}, 0)"
    assert result.measures["wsum_accuracy_rate"]["sql"] == "SUM(`accuracy_rate` * `answer_cnt`)"


def test_rate_column_with_multiple_counts_is_ambiguous_and_kept_non_additive():
    """比率列 + 多个计数列且无 stem 命中 → 歧义，保留 non_additive（安全拒答）。"""
    measures = {
        "avg_accuracy_rate": _avg_measure("AVG(`accuracy_rate`)", title="正确率"),
    }
    columns = [
        {"name": "accuracy_rate", "type": "double", "comment": "正确率"},
        {"name": "answer_cnt", "type": "bigint", "comment": "答题次数"},
        {"name": "correct_cnt", "type": "bigint", "comment": "答对次数"},
    ]
    result = decompose_ratio_measures(measures, columns=columns)
    kept = result.measures["avg_accuracy_rate"]
    assert kept["type"] == "avg"
    assert kept["non_additive"] is True
    assert result.ratios == []


def test_no_count_column_keeps_non_additive():
    """无任何计数列 → 推不出分母 → 保留 non_additive。"""
    measures = {"avg_success_rate": _avg_measure("AVG(`success_rate`)")}
    columns = [{"name": "success_rate", "type": "double", "comment": "成功率"}]
    result = decompose_ratio_measures(measures, columns=columns)
    assert result.measures["avg_success_rate"]["type"] == "avg"
    assert result.changed is False


def test_percentile_and_median_and_stddev_and_wow_are_skipped():
    """不可由 SUM/SUM 重算的族即便有计数列也跳过。"""
    measures = {
        "avg_p75_difficulty": _avg_measure("AVG(`p75_difficulty`)", title="P75难度"),
        "avg_median_score": _avg_measure("AVG(`median_score`)", title="中位分"),
        "avg_stddev_difficulty": _avg_measure("AVG(`stddev_difficulty`)", title="难度标准差"),
        "avg_question_cnt_wow": _avg_measure("AVG(`question_cnt_wow`)", title="题量周环比"),
    }
    columns = [
        {"name": "p75_difficulty", "type": "double", "comment": "p75难度"},
        {"name": "median_score", "type": "double", "comment": "中位数得分"},
        {"name": "stddev_difficulty", "type": "double", "comment": "难度标准差"},
        {"name": "question_cnt_wow", "type": "double", "comment": "题量周环比"},
        {"name": "question_cnt", "type": "bigint", "comment": "题量"},
    ]
    result = decompose_ratio_measures(measures, columns=columns)
    assert result.changed is False
    for name in measures:
        assert result.measures[name]["type"] == "avg"
        assert result.measures[name]["non_additive"] is True


def test_stem_mismatch_avg_is_not_decomposed():
    """均值列与计数列 stem 不一致（avg_difficulty vs question_cnt）→ 不猜 → 保留。"""
    measures = {"avg_difficulty": _avg_measure("AVG(`avg_difficulty`)", title="平均难度")}
    columns = [
        {"name": "avg_difficulty", "type": "double", "comment": "平均难度"},
        {"name": "question_cnt", "type": "bigint", "comment": "题量"},
    ]
    result = decompose_ratio_measures(measures, columns=columns)
    assert result.measures["avg_difficulty"]["type"] == "avg"
    assert result.ratios == []


def test_existing_denominator_measure_is_reused():
    """已存在等价 SUM(answer_cnt) 度量时复用其名，不重复造分母。"""
    measures = {
        "sum_answer_cnt": _sum_measure("answer_cnt", title="答题次数合计"),
        "avg_answer_duration": _avg_measure("AVG(`answer_duration`)", title="平均答题时长"),
    }
    columns = [
        {"name": "answer_duration", "type": "double", "comment": "答题总时长"},
        {"name": "answer_cnt", "type": "bigint", "comment": "答题次数"},
    ]
    result = decompose_ratio_measures(measures, columns=columns)
    # 不应新增第二个 SUM(answer_cnt)
    cnt_denoms = [n for n, p in result.measures.items() if p.get("sql") == "SUM(`answer_cnt`)"]
    assert cnt_denoms == ["sum_answer_cnt"]
    assert result.measures["avg_answer_duration"]["sql"] == "{sum_answer_duration} / NULLIF({sum_answer_cnt}, 0)"


def test_already_additive_avg_is_untouched():
    """non_additive=False 的 avg 度量不在处理范围内。"""
    measures = {"avg_x": {"title": "x", "type": "avg", "sql": "AVG(`x`)", "non_additive": False}}
    result = decompose_ratio_measures(measures, columns=[{"name": "x", "type": "double"}])
    assert result.measures["avg_x"]["type"] == "avg"
    assert result.changed is False


def test_weight_inferred_from_existing_sum_measure_without_columns():
    """repair 场景列元数据缺失：从现有 SUM 度量暴露的计数列推断权重。"""
    measures = {
        "sum_answer_cnt": _sum_measure("answer_cnt"),
        "avg_answer_duration": _avg_measure("AVG(`answer_duration`)", title="平均答题时长"),
    }
    result = decompose_ratio_measures(measures, columns=None)
    ratio = result.measures["avg_answer_duration"]
    assert ratio["type"] == "ratio"
    assert ratio["sql"] == "{sum_answer_duration} / NULLIF({sum_answer_cnt}, 0)"


def test_complex_avg_expression_is_not_decomposed():
    """非简单 AVG(col)（带表达式）不安全 → 跳过。"""
    measures = {
        "avg_ratio": {"title": "比", "type": "avg", "sql": "AVG(`a` / `b`)", "non_additive": True},
    }
    columns = [{"name": "a", "type": "double"}, {"name": "b_cnt", "type": "bigint", "comment": "次数"}]
    result = decompose_ratio_measures(measures, columns=columns)
    assert result.measures["avg_ratio"]["type"] == "avg"
    assert result.ratios == []
