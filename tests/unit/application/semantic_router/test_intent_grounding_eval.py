"""L1 意图 grounding 离线 eval 护栏（Phase 8.2，设计 §6）。

这是开 SEMANTIC_ROUTER_LLM_INTENT_ENABLED 的**硬前置门**：
- 离线部分（本文件，CI 跑）：用 golden 集 + mocked 抽取，确定性锁定 grounding/OOS 契约——
  口语经规范抽取应命中期望的已发布候选；越界/幻觉抽取应被 grounding 丢弃（不污染）。
- 在线精度评测（需真实 LLM + 真实 active manifest）：单独手动跑，量化 Intent-Acc/Slot-F1/F1-OOS，
  用 coverage-accuracy 曲线标定门控阈值后方可置 env=true。

判等口径：判"是否 grounding 到正确的已发布候选"，而非判 SQL 等价（更稳、更易自动化）。
"""
from __future__ import annotations

from app.application.semantic_router.intent_understanding import add_candidates, ground_terms

# 已发布候选词表（真实环境来自 active manifest；此处用答题域代表性候选构造）
_PUBLISHED = ["答题总数", "正确率", "活跃用户数", "年级", "科目", "答题日期"]


def _vocab():
    v: dict[str, str] = {}
    for name in _PUBLISHED:
        add_candidates(v, name)
    return v


# golden 集：question 仅作记录；llm_terms 是"期望 LLM 规范化后的抽取"；
# expect 是 grounding 应命中的已发布候选（空=应越界识别/兜底）。
_GOLDEN = [
    {
        "question": "各年级学生做题做得最多的是哪个科目",
        "llm_terms": ["答题总数", "年级", "科目"],     # 口语 → 规范术语
        "expect": ["答题总数", "年级", "科目"],
        "is_oos": False,
    },
    {
        "question": "学生答对的比例怎么样",
        "llm_terms": ["正确率"],
        "expect": ["正确率"],
        "is_oos": False,
    },
    {
        "question": "上个月每天有多少人在用",
        "llm_terms": ["活跃用户数", "答题日期"],
        "expect": ["活跃用户数", "答题日期"],
        "is_oos": False,
    },
    {
        "question": "帮我查下毛利率和退货金额",          # 未发布资产 → 应越界识别
        "llm_terms": ["毛利率", "退货金额"],
        "expect": [],
        "is_oos": True,
    },
    {
        "question": "随便聊聊",                          # 无可绑 → 兜底
        "llm_terms": ["心情"],
        "expect": [],
        "is_oos": True,
    },
]


class TestGroundingGoldenContract:
    def test_in_scope_questions_ground_to_expected_published(self):
        vocab = _vocab()
        for case in _GOLDEN:
            if case["is_oos"]:
                continue
            got = ground_terms(case["llm_terms"], vocab)
            assert got == case["expect"], f"{case['question']}: {got} != {case['expect']}"

    def test_out_of_scope_is_rejected_not_hallucinated(self):
        vocab = _vocab()
        for case in _GOLDEN:
            if not case["is_oos"]:
                continue
            got = ground_terms(case["llm_terms"], vocab)
            assert got == [], f"OOS 应被 grounding 丢弃: {case['question']} → {got}"

    def test_coverage_metric_is_measurable(self):
        """grounding 命中率（F1-OOS 的基础信号）可量化——eval 验收门的最小度量。"""
        vocab = _vocab()
        correct = 0
        for case in _GOLDEN:
            got = ground_terms(case["llm_terms"], vocab)
            hit_is_oos = len(got) == 0
            if hit_is_oos == case["is_oos"]:
                correct += 1
        # 离线契约：grounding 的 OOS 判别在 golden 集上应 100% 正确
        assert correct == len(_GOLDEN)
