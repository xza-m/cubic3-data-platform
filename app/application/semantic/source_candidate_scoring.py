"""数据来源召回的元数据打分配置。"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping, Sequence


@dataclass(frozen=True)
class SourceCandidateScoringRule:
    """领域召回打分规则。

    规则由元数据描述，不让通用召回服务直接写死某个业务域。
    """

    rule_id: str
    intent_terms: Sequence[str]
    positive_source_terms: Sequence[str]
    negative_source_terms: Sequence[str] = field(default_factory=tuple)
    canonical_source_terms: Sequence[str] = field(default_factory=tuple)
    domain_boost: float = 0.16
    mismatch_penalty: float = -0.18
    negative_penalty: float = -0.25
    canonical_boost: float = 0.08
    positive_breakdown_key: str = "domain_boost"
    mismatch_breakdown_key: str = "domain_mismatch_penalty"
    negative_breakdown_key: str = "negative_domain_penalty"
    canonical_breakdown_key: str = "canonical_table_boost"
    matched_term: str | None = None
    positive_evidence: str = "命中目标事实域"
    negative_evidence: str = "命中非目标事实域"
    canonical_candidate: Mapping[str, Any] | None = None
    canonical_spec: Mapping[str, Any] | None = None

    def matches_intent(self, query: str, terms: Sequence[str]) -> bool:
        text = (query or "").lower()
        normalized_terms = {str(term).lower() for term in terms}
        return all(
            (needle := str(term).strip().lower())
            and (needle in text or needle in normalized_terms)
            for term in self.intent_terms
        )

    def matches_positive_source(self, text: str) -> bool:
        return _contains_any(text, self.positive_source_terms)

    def matches_negative_source(self, text: str) -> bool:
        return _contains_any(text, self.negative_source_terms)

    def matches_canonical_source(self, text: str) -> bool:
        terms = self.canonical_source_terms or self.positive_source_terms
        return _contains_any(text, terms)


@dataclass(frozen=True)
class SourceCandidateScoringConfig:
    """召回打分配置集合。"""

    rules: Sequence[SourceCandidateScoringRule] = field(default_factory=tuple)

    @classmethod
    def default(cls) -> "SourceCandidateScoringConfig":
        return cls(
            rules=(
                SourceCandidateScoringRule(
                    rule_id="student_comment",
                    intent_terms=("学生", "评论"),
                    positive_source_terms=(
                        "dwd_interaction_comment_reports_df",
                        "student_comment",
                        "comment_report",
                        "comment_reports",
                        "interaction_comment",
                        "评论举报",
                        "学生评论",
                    ),
                    negative_source_terms=(
                        "view_student_answer_analysis",
                        "student_answer",
                        "answer_records",
                        "answer_action",
                        "答题",
                        "正确率",
                        "耗时",
                    ),
                    canonical_source_terms=("dwd_interaction_comment_reports_df",),
                    positive_breakdown_key="student_comment_domain_boost",
                    mismatch_breakdown_key="student_comment_domain_mismatch_penalty",
                    negative_breakdown_key="student_answer_domain_penalty",
                    canonical_breakdown_key="canonical_table_boost",
                    matched_term="student_comment_domain",
                    positive_evidence="命中学生评论/举报事实域",
                    negative_evidence="命中答题分析域，非学生评论事实域",
                    canonical_candidate={
                        "id": "canonical:student_comment:dwd_interaction_comment_reports_df",
                        "asset_type": "table",
                        "source_kind": "physical_table",
                        "source_id": 1,
                        "database": "df_cb_258187",
                        "schema": None,
                        "table": "dwd_interaction_comment_reports_df",
                        "name": "df_cb_258187.dwd_interaction_comment_reports_df",
                        "title": "学生评论举报明细事实表",
                        "confidence": "high",
                        "score": 0.99,
                        "matched_terms": ["student_comment_domain"],
                        "evidence": ["学生评论场景固定使用评论/举报事实 DWD，避免落到答题分析视图"],
                    },
                    canonical_spec={
                        "source": {
                            "source_kind": "physical_table",
                            "source_id": 1,
                            "database": "df_cb_258187",
                            "schema": None,
                            "table": "dwd_interaction_comment_reports_df",
                        },
                        "business": {
                            "subject": "学生评论",
                            "sensitivity_level": "restricted",
                        },
                        "cube": {
                            "name": "dwd_interaction_comment_reports_df",
                            "title": "学生评论",
                            "description": "互动域-学生笔记/评论举报事实表",
                            "table": "dwd_interaction_comment_reports_df",
                            "source": "df_cb_258187.dwd_interaction_comment_reports_df",
                            "source_id": 1,
                            "source_database": "df_cb_258187",
                            "data_source": "maxcompute",
                            "grain": "report_id",
                            "entity_key": "report_id",
                            "dimensions": {
                                "comment_school_id": {
                                    "title": "被举报内容发布者学校ID",
                                    "type": "number",
                                    "sql": "`comment_school_id`",
                                    "primary_key": False,
                                },
                                "comment_school_name": {
                                    "title": "被举报内容发布者学校名称",
                                    "type": "string",
                                    "sql": "`comment_school_name`",
                                    "primary_key": False,
                                },
                                "comment_published_at": {
                                    "title": "被举报内容发布时间",
                                    "type": "time",
                                    "sql": "`comment_published_at`",
                                    "primary_key": False,
                                },
                                "report_id": {
                                    "title": "举报ID",
                                    "type": "number",
                                    "sql": "`report_id`",
                                    "primary_key": True,
                                },
                            },
                            "measures": {
                                "total_count": {
                                    "title": "学生评论数",
                                    "type": "count",
                                    "sql": "COUNT(`report_id`)",
                                    "description": "按举报记录统计学生评论数。",
                                    "source_data_type": "count",
                                    "certified": True,
                                    "non_additive": False,
                                }
                            },
                            "default_time_dimension": "comment_published_at",
                        },
                    },
                ),
            )
        )

    def matching_rules(self, query: str, terms: Sequence[str]) -> list[SourceCandidateScoringRule]:
        return [rule for rule in self.rules if rule.matches_intent(query, terms)]


def _contains_any(text: str, needles: Sequence[str]) -> bool:
    lowered = (text or "").lower()
    return any(str(needle).strip().lower() in lowered for needle in needles if str(needle).strip())
