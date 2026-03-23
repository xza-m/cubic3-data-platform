"""
指标语义标准化服务
"""
from __future__ import annotations

from typing import Any, Dict


class MetricSemanticsService:
    """将 measure 原始定义转换为统一消费对象。"""

    def build_metric_info(self, name: str, measure: Any) -> Dict[str, Any]:
        info: Dict[str, Any] = {
            "name": name,
            "title": measure.title,
            "type": measure.type,
            "description": measure.description,
            "certified": bool(getattr(measure, "certified", False)),
        }
        if getattr(measure, "format", None):
            info["format"] = measure.format
        if getattr(measure, "unit", None):
            info["unit"] = measure.unit
        if getattr(measure, "non_additive", False):
            info["non_additive"] = True
        return info

    def build_metric_map(self, measures: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
        return {
            name: self.build_metric_info(name, measure)
            for name, measure in measures.items()
        }
