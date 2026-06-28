"""L1 意图理解段单测（Phase 8.2）：grounding 白名单 + 结构化抽取 fallback-safe。"""
from __future__ import annotations

import pytest

from app.application.semantic_router.intent_understanding import (
    IntentExtraction,
    IntentUnderstandingService,
    add_candidates,
    ground_terms,
)


def _vocab(*pairs):
    v: dict[str, str] = {}
    for name in pairs:
        add_candidates(v, name)
    return v


class TestGroundTerms:
    def test_exact_hit_returns_canonical(self):
        vocab = _vocab("答题总数", "活跃用户数")
        assert ground_terms(["答题总数"], vocab) == ["答题总数"]

    def test_substring_hit(self):
        vocab = _vocab("答题总数")
        # LLM 抽 "学生答题总数情况" 含已发布候选 → 命中
        assert ground_terms(["学生答题总数情况"], vocab) == ["答题总数"]

    def test_miss_dropped(self):
        vocab = _vocab("答题总数")
        assert ground_terms(["瞎编指标"], vocab) == []

    def test_min_length_guard_blocks_short_candidate_substring(self):
        # 短候选 "数"(归一长度1) 不参与子串命中，避免污染
        vocab = _vocab("数")
        assert ground_terms(["不相关的随便一句话"], vocab) == []

    def test_min_length_guard_allows_exact_short(self):
        vocab = _vocab("数")
        assert ground_terms(["数"], vocab) == ["数"]

    def test_dedupe_preserves_order(self):
        vocab = _vocab("答题总数", "活跃用户数")
        out = ground_terms(["答题总数", "活跃用户数", "答题总数"], vocab)
        assert out == ["答题总数", "活跃用户数"]

    def test_normalization_case_and_punct(self):
        vocab = _vocab("Answer_Count")
        assert ground_terms(["answer count"], vocab) == ["Answer_Count"]


class TestIntentExtraction:
    def test_all_terms_dedupes_target_metrics_dims(self):
        ie = IntentExtraction(target_asset="答题总数", metrics=["答题总数", "正确率"], dimensions=["年级"])
        assert ie.all_terms() == ["答题总数", "正确率", "年级"]


class _StubRuntime:
    def __init__(self, structured=None, raises=False):
        self._structured = structured
        self._raises = raises
        self.calls = 0

    def invoke(self, request):
        self.calls += 1
        if self._raises:
            raise RuntimeError("provider down")

        class _R:
            structured_output = self._structured

        r = _R()
        r.structured_output = self._structured
        return r


class TestIntentUnderstandingService:
    def test_disabled_is_unavailable_and_returns_none(self):
        svc = IntentUnderstandingService(_StubRuntime({"intent_type": "analysis"}), enabled=False)
        assert svc.available is False
        assert svc.extract_intent("学生答题统计") is None

    def test_no_runtime_unavailable(self):
        svc = IntentUnderstandingService(None, enabled=True)
        assert svc.available is False
        assert svc.extract_intent("x") is None

    def test_enabled_parses_structured_output(self):
        stub = _StubRuntime(
            {
                "intent_type": "analysis",
                "target_asset": "答题总数",
                "metrics": ["答题总数"],
                "dimensions": ["年级"],
                "confidence": 0.9,
            }
        )
        svc = IntentUnderstandingService(stub, enabled=True)
        ie = svc.extract_intent("各年级学生做了多少题", candidate_assets=["答题总数"])
        assert stub.calls == 1
        assert ie is not None
        assert ie.intent_type == "analysis"
        assert ie.target_asset == "答题总数"
        assert ie.metrics == ["答题总数"]
        assert ie.confidence == 0.9

    def test_provider_failure_is_fallback_safe(self):
        svc = IntentUnderstandingService(_StubRuntime(raises=True), enabled=True)
        assert svc.extract_intent("x", candidate_assets=["答题总数"]) is None

    def test_non_dict_structured_output_returns_none(self):
        svc = IntentUnderstandingService(_StubRuntime("not a dict"), enabled=True)
        assert svc.extract_intent("x") is None

    def test_parse_defends_bad_values(self):
        stub = _StubRuntime(
            {
                "intent_type": "WEIRD",          # 未知 → analysis
                "target_asset": "null",          # 字符串 null → None
                "metrics": "not-a-list",         # 非列表 → []
                "confidence": "abc",             # 非数 → 0.0
            }
        )
        svc = IntentUnderstandingService(stub, enabled=True)
        ie = svc.extract_intent("x", candidate_assets=[])
        assert ie.intent_type == "analysis"
        assert ie.target_asset is None
        assert ie.metrics == []
        assert ie.confidence == 0.0


# --- route()._understand 集成（结构化路径 → grounding → match_text 富化） ------------

from app.application.semantic_router.preview_service import SemanticRouterPreviewService


class _StubMetric:
    def __init__(self, name, title="", aliases=()):
        self.name = name
        self.title = title
        self.aliases = list(aliases)


class _StubCatalog:
    """official 模式下 _runtime_entities 直接用 runtime_catalog.list_entities(type)。"""

    def __init__(self, metrics):
        self._metrics = metrics

    def list_entities(self, entity_type):
        return self._metrics if entity_type == "metric" else []


class _StructuredIntentStub:
    def __init__(self, intent, available=True):
        self._intent = intent
        self.available = available

    def extract_intent(self, question, **kwargs):  # noqa: ARG002
        return self._intent


class _EmptyRepo:
    def list_all(self):
        return []


def _router_with(intent_service):
    # official 模式下候选取自 runtime_catalog，repos 的 list_all() 结果被忽略但仍被调用 → 给空仓库桩
    return SemanticRouterPreviewService(
        object_repository=_EmptyRepo(),
        metric_repository=_EmptyRepo(),
        glossary_repository=_EmptyRepo(),
        relation_repository=_EmptyRepo(),
        action_repository=_EmptyRepo(),
        mapper_preview_service=None,
        compiler_preview_service=None,
        intent_extraction_service=intent_service,
    )


def _understand(router, question, intent_mode_catalog):
    return router._understand(
        question,
        runtime_mode="official",
        runtime_manifest={"ok": True},
        runtime_catalog=intent_mode_catalog,
        semantic_plan_id="plan_x",
        principal_context={"principal_id": "p1"},
    )


class TestUnderstandIntegration:
    def test_grounded_term_enriches_match_text(self):
        intent = IntentExtraction(target_asset="答题总数", metrics=["答题总数"], intent_type="analysis", confidence=0.9)
        router = _router_with(_StructuredIntentStub(intent))
        res = _understand(router, "各年级学生做题做得最多的是哪个科目", _StubCatalog([_StubMetric("答题总数")]))
        assert "答题总数" in res["match_text"]          # 口语 → 命中已发布候选 → 富化
        assert res["intent_type"] == "analysis"
        assert res["grounded"] == ["答题总数"]
        assert res["confidence"] == 0.9

    def test_hallucinated_target_does_not_pollute(self):
        # LLM 抽了一个未发布资产 → grounding 全丢 → match_text 不被污染（仍=原问题）
        intent = IntentExtraction(target_asset="瞎编指标", metrics=["瞎编指标"], intent_type="analysis")
        router = _router_with(_StructuredIntentStub(intent))
        q = "随便问点什么"
        res = _understand(router, q, _StubCatalog([_StubMetric("答题总数")]))
        assert res["match_text"] == q
        assert res["grounded"] == []

    def test_disabled_service_is_zero_regression(self):
        intent = IntentExtraction(target_asset="答题总数")
        router = _router_with(_StructuredIntentStub(intent, available=False))
        q = "各年级做题最多"
        res = _understand(router, q, _StubCatalog([_StubMetric("答题总数")]))
        assert res["match_text"] == q          # available=False → 行为=今天
        assert res["intent_type"] is None

    def test_extract_returns_none_is_safe(self):
        router = _router_with(_StructuredIntentStub(None))
        q = "x"
        res = _understand(router, q, _StubCatalog([_StubMetric("答题总数")]))
        assert res["match_text"] == q
