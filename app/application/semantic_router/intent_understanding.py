"""L1 意图理解段：结构化意图抽取 + grounding 白名单（Phase 8.2）。

设计见 docs/architecture/intent-understanding-layer-design.md。

- 结构化抽取：经 AI 单前门 AgentInferenceRuntimeService.invoke()（output_schema JSON-mode），
  把口语问题抽成 IntentExtraction 槽位（intent_type / target_asset / metrics / dimensions / ...）。
- grounding（validation sandwich）：抽出的术语只采纳能命中"已发布候选词表"的，
  并加最小长度护栏，剔除越界/幻觉/过短，避免污染既有子串匹配。
- 全程 fallback-safe：未启用 / 无前门 / 调用失败 / 解析失败 → 返回 None / 空，
  调用方回退确定性匹配，env 关时行为=今天（零回归）。
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Mapping, Optional


def _normalize(value: str) -> str:
    """与 preview_service._normalize 同口径：小写 + 去非字母数字。"""
    return re.sub(r"[\W_]+", "", str(value or "").lower())


# grounding 最小长度护栏：归一化后短于该长度的候选不参与模糊（子串）命中，
# 仅允许精确相等，避免"量""数"等短名把白名单变成污染放大器。
MIN_GROUND_LEN = 2

# 抽取槽位的安全上限。
_MAX_SLOT_ITEMS = 12
_MAX_TERM_LEN = 48


@dataclass(frozen=True)
class IntentExtraction:
    """LLM 结构化意图抽取产物（②的输出契约）。"""

    intent_type: str = "analysis"          # analysis | knowledge | tool
    target_asset: Optional[str] = None     # 已发布候选名；找不到 None
    metrics: List[str] = field(default_factory=list)
    dimensions: List[str] = field(default_factory=list)
    time_range: Optional[Dict[str, Any]] = None
    filters: List[Dict[str, Any]] = field(default_factory=list)
    order_by: Optional[str] = None
    missing_slots: List[str] = field(default_factory=list)
    confidence: float = 0.0

    def all_terms(self) -> List[str]:
        """需要 grounding 的术语集合：target_asset + metrics + dimensions。"""
        terms: List[str] = []
        if self.target_asset:
            terms.append(self.target_asset)
        terms.extend(self.metrics)
        terms.extend(self.dimensions)
        # 去重保序
        seen = set()
        out: List[str] = []
        for t in terms:
            t = str(t or "").strip()
            if t and t not in seen:
                seen.add(t)
                out.append(t)
        return out


def add_candidates(vocab: Dict[str, str], *names: Optional[str]) -> None:
    """把一个实体的若干候选名（name/title/alias）归一化后塞进词表。

    vocab: normalized_candidate -> 原始规范名（用于拼回 match_text）。
    """
    for name in names:
        if not name:
            continue
        nm = _normalize(name)
        if not nm:
            continue
        # 同一归一化键已存在则保留首个（通常 name 优先于 alias）
        vocab.setdefault(nm, str(name))


def ground_terms(terms: Iterable[str], vocab: Mapping[str, str], *, min_len: int = MIN_GROUND_LEN) -> List[str]:
    """validation sandwich：把 LLM 抽出的术语 grounding 到已发布候选词表。

    返回命中的"已发布候选规范名"（去重保序），供拼回 match_text。
    规则：
      - 归一化后精确命中词表 → 采纳该候选规范名；
      - 否则在 min_len 护栏下做双向子串命中（候选 >= min_len 才参与），命中即采纳；
      - 过短 / 越界 / 命不中 → 丢弃（不污染匹配）。
    """
    hits: List[str] = []
    seen = set()
    for term in terms:
        nt = _normalize(term)
        if not nt:
            continue
        canonical: Optional[str] = None
        if nt in vocab:                       # 精确命中已发布候选
            canonical = vocab[nt]
        else:
            for cand_norm, cand_name in vocab.items():
                if len(cand_norm) < min_len:  # 短候选只允许精确相等，不参与子串
                    continue
                if cand_norm in nt or nt in cand_norm:
                    canonical = cand_name
                    break
        if canonical and canonical not in seen:
            seen.add(canonical)
            hits.append(canonical)
    return hits


# 注入 LLM 的 output_schema 字段说明（adapter 只透传 output_schema 名，字段定义须由我们给）。
_INTENT_SCHEMA_DESC = {
    "intent_type": "analysis|knowledge|tool，三选一：查数=analysis，问口径/解释=knowledge，执行动作=tool",
    "target_asset": "从 candidate_assets 里选最匹配的一个已发布资产名；找不到填 null，禁止编造",
    "metrics": "从 candidate_assets 里选用户想要的指标名列表；找不到填 []",
    "dimensions": "用户想按哪些维度分组/筛选（如 年级、科目、日期）；找不到填 []",
    "time_range": '时间范围，如 {"kind":"last_n_days","n":7} 或 null',
    "filters": "筛选条件列表，如 [] ",
    "order_by": "排序意图，如 'desc' / 'top' / null",
    "missing_slots": "你判断缺失的关键槽位名列表（如 ['metric']）；不缺填 []",
    "confidence": "你对本次抽取的置信度 0~1（仅作辅助参考）",
}


class IntentUnderstandingService:
    """经 AI 单前门做结构化意图抽取；fallback-safe。

    runtime_service: AgentInferenceRuntimeService（ADR-016 前门），需有 invoke()。
    enabled: env SEMANTIC_ROUTER_LLM_INTENT_ENABLED；关时 available=False，行为=今天。
    """

    _ACTION = "global_ask.intent_extract"
    _OUTPUT_SCHEMA = "global_ask.intent_extract.output.v1"
    _APP_ID = "semantic_router"

    def __init__(self, runtime_service: Any = None, *, enabled: bool = False) -> None:
        self._runtime = runtime_service
        self._enabled = bool(enabled)

    @property
    def available(self) -> bool:
        return self._enabled and self._runtime is not None

    def extract_intent(
        self,
        question: str,
        *,
        candidate_assets: Optional[List[str]] = None,
        principal_id: Optional[str] = None,
        plan_id: Optional[str] = None,
    ) -> Optional[IntentExtraction]:
        """抽取结构化意图；任何异常 → None（调用方回退确定性匹配）。"""
        question = (question or "").strip()
        if not self.available or not question:
            return None
        try:
            request = self._build_request(question, candidate_assets or [], principal_id, plan_id)
            result = self._runtime.invoke(request)
            return self._parse(getattr(result, "structured_output", None))
        except Exception:
            # fallback-safe：抽取失败绝不影响主链路
            return None

    # -- internals --------------------------------------------------------

    def _build_request(self, question, candidate_assets, principal_id, plan_id):
        from app.domain.agent_inference_runtime.types import (
            AgentInferenceRuntimeRequest,
            RuntimeContextRef,
            RuntimePolicy,
        )

        ctx_id = plan_id or "intent_extract"
        return AgentInferenceRuntimeRequest(
            app_id=self._APP_ID,
            action=self._ACTION,
            runtime_context_ref=RuntimeContextRef(
                project_id="cubic3-data-platform",
                session_id=ctx_id,
                thread_id=ctx_id,
                turn_id="intent_extract",
            ),
            principal_id=principal_id,
            input={"question": question},
            context_pack={
                "output_schema_fields": _INTENT_SCHEMA_DESC,
                "candidate_assets": candidate_assets[:200],
                "instructions": (
                    "只能从 candidate_assets 里选 target_asset/metrics/dimensions；"
                    "找不到就留空/填 null，绝不编造 candidate_assets 之外的资产名。"
                ),
            },
            output_schema=self._OUTPUT_SCHEMA,
            runtime_policy=RuntimePolicy(max_runtime_seconds=20),
            preferred_runtime="openai_compatible",
            execution_mode="sync",
            semantic_runtime_pin=None,
            asset_revision_refs=[],
        )

    @staticmethod
    def _parse(raw: Any) -> Optional[IntentExtraction]:
        if not isinstance(raw, dict):
            return None

        def _str_list(value) -> List[str]:
            if not isinstance(value, (list, tuple)):
                return []
            out: List[str] = []
            for item in value:
                s = str(item or "").strip()
                if s and len(s) <= _MAX_TERM_LEN:
                    out.append(s)
                if len(out) >= _MAX_SLOT_ITEMS:
                    break
            return out

        intent_type = str(raw.get("intent_type") or "analysis").strip().lower()
        if intent_type not in ("analysis", "knowledge", "tool"):
            intent_type = "analysis"

        target = raw.get("target_asset")
        target = str(target).strip() if target not in (None, "", "null") else None
        if target and len(target) > _MAX_TERM_LEN:
            target = None

        try:
            confidence = float(raw.get("confidence") or 0.0)
        except (TypeError, ValueError):
            confidence = 0.0
        confidence = max(0.0, min(1.0, confidence))

        time_range = raw.get("time_range") if isinstance(raw.get("time_range"), dict) else None
        filters = raw.get("filters") if isinstance(raw.get("filters"), list) else []
        order_by = raw.get("order_by")
        order_by = str(order_by).strip() if order_by not in (None, "", "null") else None

        return IntentExtraction(
            intent_type=intent_type,
            target_asset=target,
            metrics=_str_list(raw.get("metrics")),
            dimensions=_str_list(raw.get("dimensions")),
            time_range=time_range,
            filters=filters[:_MAX_SLOT_ITEMS],
            order_by=order_by,
            missing_slots=_str_list(raw.get("missing_slots")),
            confidence=confidence,
        )
