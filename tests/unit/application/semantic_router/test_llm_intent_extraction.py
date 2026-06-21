"""LLM 意图抽取（全局问数命门）+ router 附加式集成测试。"""
from app.application.semantic_router.llm_intent_extraction import LlmIntentExtractionService
from app.application.semantic_router.preview_service import SemanticRouterPreviewService


class _StubExtraction:
    def __init__(self, terms):
        self._terms = terms

    def extract_terms(self, question):  # noqa: ARG002
        return list(self._terms)


def _router(intent_service=None):
    return SemanticRouterPreviewService(
        object_repository=None,
        metric_repository=None,
        glossary_repository=None,
        relation_repository=None,
        action_repository=None,
        mapper_preview_service=None,
        compiler_preview_service=None,
        intent_extraction_service=intent_service,
    )


class TestLlmIntentExtractionService:
    def test_no_llm_returns_empty(self):
        assert LlmIntentExtractionService().extract_terms("各区域本月销售额") == []

    def test_parses_terms_across_separators(self):
        svc = LlmIntentExtractionService(lambda p: "销售额\n地区、本月")
        assert svc.extract_terms("各区域本月卖得怎样") == ["销售额", "地区", "本月"]

    def test_exception_falls_back_to_empty(self):
        def boom(_):
            raise RuntimeError("llm down")

        assert LlmIntentExtractionService(boom).extract_terms("q") == []

    def test_empty_question_returns_empty(self):
        svc = LlmIntentExtractionService(lambda p: "不该被使用")
        assert svc.extract_terms("   ") == []


class TestRouterExpandQuestion:
    def test_no_service_keeps_raw_question(self):
        # fallback-safe：无抽取服务时匹配文本 == 原问题（零回归）
        assert _router()._expand_question("各区域本月卖得最好") == "各区域本月卖得最好"

    def test_service_appends_normalized_terms(self):
        router = _router(_StubExtraction(["销售额", "地区"]))
        assert router._expand_question("各区域卖得最好") == "各区域卖得最好 销售额 地区"

    def test_empty_terms_keeps_raw_question(self):
        router = _router(_StubExtraction([]))
        assert router._expand_question("xyz") == "xyz"
