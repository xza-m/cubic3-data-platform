"""LLM 意图/实体抽取服务（全局问数命门）。

把口语化自然语言问题抽取成可被确定性 mapper 匹配的规范术语，增强口语鲁棒性。
设计为**附加式、fallback-safe**：无 LLM / 调用失败 / 解析失败时返回空列表，
调用方回退到原始问题，不改变现有确定性匹配行为（零回归风险）。

complete_fn: Callable[[str], str] —— 接收 prompt、返回模型文本；与具体 LLM adapter 解耦，
便于 DI 注入真实 adapter、测试注入桩函数。
"""
from __future__ import annotations

import re
from typing import Callable, List, Optional


_PROMPT_TEMPLATE = (
    "你是数据问数的意图抽取器。从下面的中文问题里，抽取可用于匹配语义指标/维度/口径的"
    "**规范业务术语**（指标名、维度名、时间、筛选值等），每行一个，不要解释、不要编造问题里没有的概念。\n"
    "问题：{question}\n"
    "术语（每行一个）："
)

# 抽取结果的安全上限，避免异常长输出污染匹配文本。
_MAX_TERMS = 12
_MAX_TERM_LEN = 32


class LlmIntentExtractionService:
    """用 LLM 抽取规范术语；任何异常都降级为空列表。"""

    def __init__(self, complete_fn: Optional[Callable[[str], str]] = None) -> None:
        self._complete = complete_fn

    @property
    def available(self) -> bool:
        return self._complete is not None

    def extract_terms(self, question: str) -> List[str]:
        question = (question or "").strip()
        if self._complete is None or not question:
            return []
        try:
            raw = self._complete(_PROMPT_TEMPLATE.format(question=question))
            return self._parse_terms(raw)
        except Exception:
            # fallback-safe：抽取失败绝不影响主链路
            return []

    @staticmethod
    def _parse_terms(raw: object) -> List[str]:
        if not isinstance(raw, str):
            return []
        terms: List[str] = []
        seen = set()
        for line in re.split(r"[\n,，、;；]+", raw):
            term = line.strip().strip("-•*0123456789.、) 　")
            if not term or len(term) > _MAX_TERM_LEN:
                continue
            if term in seen:
                continue
            seen.add(term)
            terms.append(term)
            if len(terms) >= _MAX_TERMS:
                break
        return terms
