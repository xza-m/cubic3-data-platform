"""分析型 Data Agent 层 — 可回答性 / 覆盖缺口门控（MVP，Phase 8.4）。

设计见 docs/architecture/analytical-data-agent-layer-design.md §5.1。

四态门控（在查数/编排之前判定）：
- answerable     : 目标/指标可绑已发布资产，所需维度都已建模 → 进编排
- need_clarify   : 命中但歧义（多候选 / 缺必填时间窗）→ 澄清
- out_of_coverage: 数据域内但所需维度未建（如"学校"）→ 诚实告知缺口 + 降级建议
- out_of_scope   : 根本不在治理语义层（如未发布的原始日志表）→ 拒答

纯逻辑、可单测、零 LLM；复用 L1（8.2）的 grounding 白名单 + _normalize。
把"建模覆盖不足"与"智能不足"清晰分开，避免在薄数据上编叙事——业界红线级共识。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from app.application.semantic_router.intent_understanding import (
    IntentExtraction,
    _normalize,
    ground_terms,
)

ANSWERABLE = "answerable"
NEED_CLARIFY = "need_clarify"
OUT_OF_COVERAGE = "out_of_coverage"
OUT_OF_SCOPE = "out_of_scope"


@dataclass(frozen=True)
class AnswerabilityVerdict:
    """可回答性判定结果（一等产品输出：覆盖缺口要显式告知用户）。"""

    state: str
    missing_dimensions: List[str] = field(default_factory=list)   # 问题需要但未发布的维度
    available_alternatives: List[str] = field(default_factory=list)  # 可替代的已发布维度粒度
    downgrade_suggestion: Optional[str] = None
    clarify: Optional[Dict] = None
    message: str = ""

    @property
    def can_proceed(self) -> bool:
        """是否可进入后续编排（仅 answerable）。"""
        return self.state == ANSWERABLE


def classify_answerability(
    *,
    in_domain: bool,
    ungrounded_dimensions: List[str],
    published_dimensions: List[str],
    ambiguous_candidates: Optional[List[str]] = None,
    needs_time_window: bool = False,
    has_time_window: bool = True,
) -> AnswerabilityVerdict:
    """四态门控的纯判定核心。

    in_domain: 目标/指标是否绑到了任一已发布资产（区分库外 vs 域内缺维度）。
    ungrounded_dimensions: 问题所需、但未命中任何已发布维度的维度（覆盖缺口）。
    published_dimensions: 该数据域已发布的可用维度（降级建议的备选）。
    ambiguous_candidates: 目标多候选时的候选列表（触发澄清）。
    needs_time_window/has_time_window: 趋势/分析类需要时间窗但未给出 → 澄清。
    """
    # 1) 库外：问题没有任何对象落在治理语义层 → 拒答（不裸扫物理表）
    if not in_domain:
        return AnswerabilityVerdict(
            state=OUT_OF_SCOPE,
            message="这个问题涉及的对象不在已发布的语义资产中，当前无法回答；如需，请先在语义中心建模并发布。",
        )

    # 2) 超覆盖：域内但所需维度未建模 → 诚实告知缺口 + 降级到可答粒度
    if ungrounded_dimensions:
        miss = list(dict.fromkeys(ungrounded_dimensions))
        alts = list(dict.fromkeys(published_dimensions))
        downgrade = (
            f"可改按已建模的 {'/'.join(alts)} 维度分析"
            if alts
            else None
        )
        miss_txt = "、".join(miss)
        msg = f"当前建模没有「{miss_txt}」维度，无法按它下钻。"
        if downgrade:
            msg += downgrade + "；"
        msg += f"或在语义中心补建「{miss_txt}」维度后再分析。"
        return AnswerabilityVerdict(
            state=OUT_OF_COVERAGE,
            missing_dimensions=miss,
            available_alternatives=alts,
            downgrade_suggestion=downgrade,
            message=msg,
        )

    # 3) 需澄清：目标多候选 或 趋势/分析缺时间窗
    if ambiguous_candidates and len(ambiguous_candidates) > 1:
        return AnswerabilityVerdict(
            state=NEED_CLARIFY,
            clarify={"candidates": list(ambiguous_candidates)},
            message="你指的是以下哪一个？" + " / ".join(ambiguous_candidates),
        )
    if needs_time_window and not has_time_window:
        return AnswerabilityVerdict(
            state=NEED_CLARIFY,
            clarify={"missing_slots": ["time_window"]},
            message="请补充时间范围（如最近 3 个月 / 某月）。",
        )

    # 4) 可答
    return AnswerabilityVerdict(state=ANSWERABLE)


def assess_from_intent(
    intent: IntentExtraction,
    *,
    asset_vocab: Dict[str, str],
    published_dimensions: List[str],
    dimension_vocab: Optional[Dict[str, str]] = None,
    needs_time_window: bool = False,
) -> AnswerabilityVerdict:
    """从 L1（8.2）的 IntentExtraction + 已发布候选 桥接到四态判定。

    asset_vocab: 已发布 metric/object/... 的 grounding 白名单（preview_service._candidate_vocabulary 产出）。
    published_dimensions: 目标 cube 已发布维度的人类可读标签（备选粒度，用于诚实告知文案）。
    dimension_vocab: 维度 grounding 白名单（normalize(label/name/synonym) -> label）；
        未提供时退化为只用 published_dimensions 的字面（不含同义词）。
        真实 cube 维度 title 多为英文，须靠 synonyms 才能让中文维度词命中，避免误判覆盖缺口。
    """
    # 域内判定：target_asset 或任一 metric 能绑到已发布资产
    target_hit = bool(intent.target_asset and ground_terms([intent.target_asset], asset_vocab))
    metric_hits = ground_terms(intent.metrics, asset_vocab)
    in_domain = bool(target_hit or metric_hits)

    # 所需维度里未命中已发布维度的 → 覆盖缺口（用 dimension_vocab 含同义词的白名单判定）
    if dimension_vocab is None:
        dimension_vocab = {}
        for d in published_dimensions:
            nd = _normalize(d)
            if nd:
                dimension_vocab.setdefault(nd, str(d))
    # 覆盖缺口检测优先用不受约束的 required_dimensions（问题真正需要的维度，含未发布的，如"学校"）；
    # 它为空时退回 dimensions（受约束的已发布选择，向后兼容）。
    needed = list(getattr(intent, "required_dimensions", None) or []) or list(intent.dimensions)
    # 只有"既不绑已发布维度、也不绑已发布度量/资产"才算缺口：绑到度量说明该概念已建模
    # （只是作为度量而非切片维度，如"快速答题"=度量），避免把度量概念误判为缺维度。
    ungrounded = [
        d
        for d in needed
        if not ground_terms([d], dimension_vocab) and not ground_terms([d], asset_vocab)
    ]

    has_tw = intent.time_range is not None
    return classify_answerability(
        in_domain=in_domain,
        ungrounded_dimensions=ungrounded,
        published_dimensions=published_dimensions,
        needs_time_window=needs_time_window,
        has_time_window=has_tw,
    )
