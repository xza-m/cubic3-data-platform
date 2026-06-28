"""可回答性四态门控单测（Phase 8.4 MVP）。含 3 个真实问法场景。"""
from __future__ import annotations

from app.application.data_agent.answerability import (
    ANSWERABLE,
    NEED_CLARIFY,
    OUT_OF_COVERAGE,
    OUT_OF_SCOPE,
    AnswerabilityVerdict,
    assess_from_intent,
    classify_answerability,
)
from app.application.semantic_router.intent_understanding import IntentExtraction, add_candidates


# 答题 cube 真实粒度：学生×知识点×日期，无学校/年级维度
PUBLISHED_DIMS = ["学生", "知识点", "学科", "难度", "日期"]


def _asset_vocab(*names):
    v: dict[str, str] = {}
    for n in names:
        add_candidates(v, n)
    return v


class TestClassifyPure:
    def test_out_of_scope_when_not_in_domain(self):
        v = classify_answerability(in_domain=False, ungrounded_dimensions=[], published_dimensions=PUBLISHED_DIMS)
        assert v.state == OUT_OF_SCOPE
        assert not v.can_proceed

    def test_out_of_coverage_surfaces_missing_dim_and_alternatives(self):
        v = classify_answerability(
            in_domain=True, ungrounded_dimensions=["学校"], published_dimensions=PUBLISHED_DIMS
        )
        assert v.state == OUT_OF_COVERAGE
        assert v.missing_dimensions == ["学校"]
        assert v.available_alternatives == PUBLISHED_DIMS
        assert "学校" in v.message and v.downgrade_suggestion  # 显式告知缺口 + 降级建议

    def test_need_clarify_on_multi_candidate(self):
        v = classify_answerability(
            in_domain=True, ungrounded_dimensions=[], published_dimensions=PUBLISHED_DIMS,
            ambiguous_candidates=["答题数", "答题正确数"],
        )
        assert v.state == NEED_CLARIFY
        assert v.clarify["candidates"] == ["答题数", "答题正确数"]

    def test_need_clarify_on_missing_time_window(self):
        v = classify_answerability(
            in_domain=True, ungrounded_dimensions=[], published_dimensions=PUBLISHED_DIMS,
            needs_time_window=True, has_time_window=False,
        )
        assert v.state == NEED_CLARIFY
        assert v.clarify["missing_slots"] == ["time_window"]

    def test_answerable(self):
        v = classify_answerability(in_domain=True, ungrounded_dimensions=[], published_dimensions=PUBLISHED_DIMS)
        assert v.state == ANSWERABLE
        assert v.can_proceed

    def test_coverage_gap_without_alternatives_has_no_downgrade(self):
        v = classify_answerability(in_domain=True, ungrounded_dimensions=["学校"], published_dimensions=[])
        assert v.state == OUT_OF_COVERAGE
        assert v.downgrade_suggestion is None


class TestAssessFromIntent:
    def test_in_domain_metric_grounds(self):
        intent = IntentExtraction(target_asset="答题总数", metrics=["答题总数"], dimensions=["知识点"])
        v = assess_from_intent(
            intent, asset_vocab=_asset_vocab("答题总数"), published_dimensions=PUBLISHED_DIMS
        )
        assert v.state == ANSWERABLE

    def test_requested_unpublished_dimension_is_coverage_gap(self):
        intent = IntentExtraction(target_asset="答题总数", metrics=["答题总数"], dimensions=["学校"])
        v = assess_from_intent(
            intent, asset_vocab=_asset_vocab("答题总数"), published_dimensions=PUBLISHED_DIMS
        )
        assert v.state == OUT_OF_COVERAGE
        assert v.missing_dimensions == ["学校"]

    def test_nothing_grounds_is_out_of_scope(self):
        intent = IntentExtraction(target_asset="dwd日志表", metrics=["rb_cnt"], dimensions=["请求"])
        v = assess_from_intent(
            intent, asset_vocab=_asset_vocab("答题总数"), published_dimensions=PUBLISHED_DIMS
        )
        assert v.state == OUT_OF_SCOPE


class TestRealQuestionScenarios:
    """3 个真实问法（对照答题 cube 真实粒度）。"""

    def test_q1_zhengzhou_school_learning_status(self):
        # "郑州基石中学的学情最近怎么样" → 学情绑答题指标(域内)，但需"学校"维度(未建)
        intent = IntentExtraction(
            target_asset="答题总数", metrics=["答题总数"], dimensions=["学校"],
            filters=[{"dimension": "学校", "value": "郑州基石中学"}], intent_type="analysis",
        )
        v = assess_from_intent(intent, asset_vocab=_asset_vocab("答题总数"), published_dimensions=PUBLISHED_DIMS)
        assert v.state == OUT_OF_COVERAGE
        assert "学校" in v.missing_dimensions
        assert "学校" in v.message  # 诚实告知缺学校维度

    def test_q2_gaoqujing_deep_analysis(self):
        # "高曲靖中学...深度分析" → 同样缺学校维度 → 超覆盖
        intent = IntentExtraction(
            target_asset="答题正确率", metrics=["答题正确率"], dimensions=["学校"],
            time_range={"kind": "last_n_months", "n": 3}, intent_type="analysis",
        )
        v = assess_from_intent(intent, asset_vocab=_asset_vocab("答题正确率"), published_dimensions=PUBLISHED_DIMS)
        assert v.state == OUT_OF_COVERAGE
        assert v.available_alternatives == PUBLISHED_DIMS

    def test_q3_dwd_log_table_out_of_scope(self):
        # "kt 的 dwd 日志表 rb_cnt/re_cnt" → 未发布原始表，无任何资产命中 → 库外拒答
        intent = IntentExtraction(
            target_asset="dwd日志表", metrics=["rb_cnt", "re_cnt"], dimensions=["请求"], intent_type="analysis",
        )
        v = assess_from_intent(intent, asset_vocab=_asset_vocab("答题总数", "答题正确率"), published_dimensions=PUBLISHED_DIMS)
        assert v.state == OUT_OF_SCOPE
        assert not v.can_proceed
