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
    assert candidates[0]["rank"] == 1
    assert candidates[0]["why_selected"].startswith("综合得分最高")
    assert answer_view["why_not_selected"]
    assert result["explainability"]["selected_candidate_id"] == candidates[0]["id"]
    assert result["explainability"]["candidate_explanations"][0]["decision"] == "selected"
    assert "student_comment" in result["explainability"]["scoring_profile_ids"]


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


def test_recall_no_candidate_response_is_explainable():
    service = SourceCandidateRecallService(
        datasource_repository=_FakeDatasourceRepository(),
        table_cache_service=_FakeTableCacheService(),
    )

    result = service.recall("完全未知的收入留存概念")

    assert result["state"] == "no_candidate"
    assert result["explainability"]["decision"] == "ask_for_source"
    assert result["explainability"]["candidate_explanations"] == []


def test_recall_prefers_data_asset_table_with_asset_ref_and_evidence_bundle():
    class _DataAssetService:
        def list_tables(self, *, keyword="", page=1, page_size=20):
            if keyword not in {"comment", "comments", "评论"}:
                return {"items": [], "total": 0}
            return {
                "items": [
                    {
                        "id": "tbl_comment",
                        "source_id": "7",
                        "database": "df_cb_258187",
                        "schema": "dw",
                        "name": "dwd_interaction_comment_reports_df",
                        "title": "学生评论举报明细事实表",
                        "description": "学生评论和举报事实",
                        "field_count": 12,
                        "row_count": 1000,
                    }
                ],
                "total": 1,
            }

        def build_table_evidence(self, table_id):
            assert table_id == "tbl_comment"
            return {
                "runtime_truth": False,
                "asset_refs": [
                    {
                        "asset_type": "table",
                        "source_id": "maxcompute-prod",
                        "database": "df_cb_258187",
                        "schema": "dw",
                        "name": "dwd_interaction_comment_reports_df",
                        "qualified_name": "df_cb_258187.dw.dwd_interaction_comment_reports_df",
                    }
                ],
                "schema_snapshot": {"columns": [{"name": "school_id", "type": "BIGINT"}]},
                "sample_profile": {"row_count": 1000},
            }

    service = SourceCandidateRecallService(
        datasource_repository=_FakeDatasourceRepository(),
        table_cache_service=SimpleNamespace(cached_table_entries=[], datasets=[]),
        data_asset_service=_DataAssetService(),
    )

    result = service.recall("查询最近 7 天学生评论数")

    candidate = result["candidates"][0]
    assert candidate["asset_type"] == "data_asset_table"
    assert candidate["source_kind"] == "physical_table"
    assert candidate["asset_ref"]["qualified_name"] == "df_cb_258187.dw.dwd_interaction_comment_reports_df"
    assert candidate["evidence_bundle"]["runtime_truth"] is False
    assert candidate["evidence_bundle"]["schema_snapshot"]["columns"][0]["name"] == "school_id"
    assert candidate["source_id"] == 7  # 归一化为 int 且指向活跃数据源


def _data_asset_service_with_source_id(source_id):
    class _DataAssetService:
        def list_tables(self, *, keyword="", page=1, page_size=20):
            if keyword not in {"comment", "comments", "评论"}:
                return {"items": [], "total": 0}
            return {
                "items": [
                    {
                        "id": "tbl_comment",
                        "source_id": source_id,
                        "database": "df_cb_258187",
                        "schema": "dw",
                        "name": "dwd_interaction_comment_reports_df",
                        "title": "学生评论举报明细事实表",
                        "description": "学生评论和举报事实",
                        "field_count": 12,
                        "row_count": 1000,
                    }
                ],
                "total": 1,
            }

        def build_table_evidence(self, table_id):
            return {"runtime_truth": False, "asset_refs": [], "schema_snapshot": {}, "sample_profile": {}}

    return _DataAssetService()


def test_data_asset_candidate_with_inactive_source_id_is_filtered():
    # source_id=8 指向 is_active=False 的数据源 → 应被剔除,不漂移进候选/proposal/binding
    service = SourceCandidateRecallService(
        datasource_repository=_FakeDatasourceRepository(),
        table_cache_service=SimpleNamespace(cached_table_entries=[], datasets=[]),
        data_asset_service=_data_asset_service_with_source_id("8"),
    )

    result = service.recall("查询最近 7 天学生评论数")

    assert result["state"] == "no_candidate"
    assert all(c.get("source_id") != 8 for c in result["candidates"])


def test_data_asset_candidate_with_nonint_source_id_is_dropped():
    # 历史脏证据 source_id 非整型(已删数据源遗留的 slug)→ 不产出指向无效源的候选
    service = SourceCandidateRecallService(
        datasource_repository=_FakeDatasourceRepository(),
        table_cache_service=SimpleNamespace(cached_table_entries=[], datasets=[]),
        data_asset_service=_data_asset_service_with_source_id("maxcompute-prod"),
    )

    result = service.recall("查询最近 7 天学生评论数")

    assert result["state"] == "no_candidate"
    assert result["candidates"] == []
