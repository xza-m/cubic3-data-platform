from types import SimpleNamespace

from app.application.semantic.source_candidate_scoring import (
    SourceCandidateScoringConfig,
    SourceCandidateScoringRule,
)
from app.application.semantic.source_candidate_recall_service import SourceCandidateRecallService


class _FakeDatasourceRepository:
    def find_all(self):
        return [
            SimpleNamespace(id=7, name="mc_prod", source_type="maxcompute", is_active=True),
            SimpleNamespace(id=8, name="inactive", source_type="maxcompute", is_active=False),
        ]


class _FakeTableCacheService:
    cached_table_entries = [
        SimpleNamespace(
            datasource_id=7,
            database_name="dw",
            table_list=[
                {"table_name": "dwd_class_activity_df", "comment": "班级互动活跃事实表"},
                {"table_name": "dwd_interaction_comment_reports_df", "comment": "学生评论举报明细表"},
            ],
        ),
        SimpleNamespace(
            datasource_id=8,
            database_name="dw",
            table_list=[{"table_name": "dwd_shadow_df", "comment": "不可用表"}],
        ),
    ]
    datasets = [
        SimpleNamespace(
            id=12,
            dataset_code="class_activity_dataset",
            dataset_name="班级活跃度数据集",
            source_id=7,
            physical_table="dw.dwd_class_activity_df",
            description="班级互动、发帖、评论活跃度",
            is_deleted=False,
        )
    ]


def test_recall_ranks_cached_datasource_tables_and_datasets():
    service = SourceCandidateRecallService(
        datasource_repository=_FakeDatasourceRepository(),
        table_cache_service=_FakeTableCacheService(),
    )

    result = service.recall("Data Agent 没听懂班级活跃度，帮我补语义")

    assert result["state"] in {"single_high", "multiple"}
    candidates = result["candidates"]
    assert candidates[0]["source_kind"] in {"dataset", "physical_table"}
    assert candidates[0]["source_id"] == 7
    assert "class" in " ".join(candidates[0]["matched_terms"])
    assert all(candidate.get("source_id") != 8 for candidate in candidates)
    assert any(candidate["table"] == "dwd_class_activity_df" for candidate in candidates)


def test_recall_returns_clear_no_candidate_state():
    service = SourceCandidateRecallService(
        datasource_repository=_FakeDatasourceRepository(),
        table_cache_service=_FakeTableCacheService(),
    )

    result = service.recall("完全未知的收入留存概念")

    assert result["state"] == "no_candidate"
    assert result["candidates"] == []
    assert result["suggested_action"] == "ask_for_source"


def test_student_comment_query_prefers_comment_reports_dwd_over_broad_answer_view():
    class _StudentCommentTableCache:
        cached_table_entries = [
            SimpleNamespace(
                datasource_id=7,
                database_name="df_cb_258187",
                table_list=[
                    {"table_name": "dwd_interaction_comment_reports_df", "comment": "学生评论举报明细事实表"},
                    {"table_name": "tmp_ads_fea_realtime_student_answer_action", "comment": "学生答题行为临时表"},
                ],
            )
        ]
        datasets = [
            SimpleNamespace(
                id=48,
                dataset_code="view_student_answer_analysis",
                dataset_name="学生答题分析视图",
                source_id=7,
                physical_table="",
                description="聚合答题记录、学生、学校信息，提供正确率和耗时分析。",
                is_deleted=False,
            )
        ]

    service = SourceCandidateRecallService(
        datasource_repository=_FakeDatasourceRepository(),
        table_cache_service=_StudentCommentTableCache(),
    )

    result = service.recall("查询最近 7 天学生评论数，按学校汇总")

    candidates = result["candidates"]
    assert candidates[0]["source_kind"] == "physical_table"
    assert candidates[0]["table"] == "dwd_interaction_comment_reports_df"
    assert candidates[0]["database"] == "df_cb_258187"
    assert candidates[0]["score_breakdown"]["student_comment_domain_boost"] > 0
    assert candidates[0]["score_breakdown"]["canonical_table_boost"] > 0
    answer_view = next(
        candidate
        for candidate in candidates
        if candidate["name"] == "view_student_answer_analysis"
    )
    assert answer_view["score_breakdown"]["student_answer_domain_penalty"] < 0
    assert candidates[0]["score"] > next(
        candidate["score"]
        for candidate in candidates
        if candidate["name"] == "view_student_answer_analysis"
    )


def test_recall_uses_metadata_scoring_rule_for_new_domain_without_service_code_change():
    class _OrderTableCache:
        cached_table_entries = [
            SimpleNamespace(
                datasource_id=7,
                database_name="dw",
                table_list=[
                    {"table_name": "dwd_order_df", "comment": "订单交易事实表"},
                    {"table_name": "dwd_refund_order_df", "comment": "退款订单明细事实表"},
                ],
            )
        ]
        datasets = []

    service = SourceCandidateRecallService(
        datasource_repository=_FakeDatasourceRepository(),
        table_cache_service=_OrderTableCache(),
        scoring_config=SourceCandidateScoringConfig(
            rules=[
                SourceCandidateScoringRule(
                    rule_id="refund_order",
                    intent_terms=("退款", "订单"),
                    positive_source_terms=("dwd_refund_order_df", "退款订单"),
                    negative_source_terms=("dwd_order_df",),
                    positive_breakdown_key="refund_order_domain_boost",
                    negative_breakdown_key="plain_order_domain_penalty",
                    matched_term="refund_order_domain",
                    positive_evidence="命中退款订单事实域",
                    negative_evidence="命中普通订单域，非退款订单事实域",
                )
            ]
        ),
    )

    result = service.recall("查看最近 30 天退款订单趋势")

    candidates = result["candidates"]
    assert candidates[0]["table"] == "dwd_refund_order_df"
    assert candidates[0]["score_breakdown"]["refund_order_domain_boost"] > 0
    plain_order = next(candidate for candidate in candidates if candidate["table"] == "dwd_order_df")
    assert plain_order["score_breakdown"]["plain_order_domain_penalty"] < 0
