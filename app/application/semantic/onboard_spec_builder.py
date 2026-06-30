"""Onboard（建表入模）spec 构造服务。

把 `dws_p2_batch.py` `publish_one` 里验证过的 spec 构造编排固化进应用层服务：
喂列定义 → 建 cube（含已有 ratio 自动拆分）→ 升全部度量为 BusinessMetric → 组装可发布 v1 spec dict。

纯编排、零新建领域逻辑：cube 建模与 ratio 拆分仍由 `CubeModelingService` 负责，ontology 升级与
敏感字段检出仍复用 `SemanticModelDraftBuilder` 既有方法，本层只做装配，不触达 MaxCompute /
runtime / repo（`build_cube_draft_payload` 走 raw_columns_facade，不连真实数据源）。
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional


class OnboardSpecBuilder:
    """从列定义编排出可发布的 v1 onboard spec（cube + ontology + governance）。"""

    def __init__(self, *, cube_modeling_service: Any, draft_builder: Any) -> None:
        self._cube_modeling_service = cube_modeling_service
        self._draft_builder = draft_builder

    def build_onboard_spec(
        self,
        *,
        source_id: int,
        database: Optional[str],
        table: str,
        columns: List[Dict[str, Any]],
        schema: Optional[str] = None,
        partitions: Optional[List[Any]] = None,
        lift: str = "all",
        sensitivity: str = "internal",
    ) -> dict:
        """喂 columns → cube（含 ratio 拆分）→ 升度量为 BusinessMetric → 组装 v1 spec dict。

        lift=="all" 升全部度量；否则逗号分隔子集，只升与 cube.measures 的交集。
        骨架已含的 total_count 始终跳过（_build_ontology_from_cube 已建默认 metric）。
        """
        # 1. 建 cube 草稿（复用既有服务，含已有 ratio 自动拆分，不改其行为；keyword-only 调用）
        cube = self._cube_modeling_service.build_cube_draft_payload(
            source_id=source_id,
            database=database,
            schema=schema,
            table=table,
            columns=columns,
            partitions=partitions,
        )

        # 2. 业务段（_build_ontology_from_cube 所需 keys：subject / sensitivity_level / default_roles）
        business = {
            "subject": cube.get("title") or table,
            "sensitivity_level": sensitivity,
            "default_roles": ["analyst"],
        }

        # 3. 由 cube 生成 ontology 骨架（复用既有方法，含默认 metric）
        ontology = self._draft_builder._build_ontology_from_cube(cube, business)
        obj = ontology["object"]["name"]

        # 4. 升度量为 BusinessMetric（编排等价于参考脚本 publish_one 行 48-58）
        cube_name = cube["name"]
        measures: Dict[str, Any] = cube.get("measures", {}) or {}
        dimensions: Dict[str, Any] = cube.get("dimensions", {}) or {}
        primary_dim = next(
            (field for field, dim in dimensions.items() if (dim or {}).get("type") != "time"),
            None,
        )
        lift_keys = self._resolve_lift_keys(lift, measures)
        for mk in lift_keys:
            if mk == "total_count":
                continue  # 骨架默认 metric 已覆盖 total_count
            mv = measures.get(mk) or {}
            ontology["metrics"].append(
                {
                    "name": f"{obj}_{mk}",
                    "title": mv.get("title") or mk,
                    "object_name": obj,
                    "semantic_formula": f"按 {cube_name}.{mk}",
                    "measure_refs": [{"ref": f"{cube_name}.{mk}", "role": "primary"}],
                    "additivity": "non_additive" if mv.get("non_additive") else "additive",
                    "grain": primary_dim,
                    "status": "draft",
                }
            )

        # 5. 敏感字段检出（复用既有方法）
        sensitive = self._draft_builder._detect_sensitive_fields(cube)

        # 6. 组装 v1 spec dict（结构同参考脚本 spec，行 60-68）
        return {
            "spec_version": "v1",
            "source": {
                "source_kind": "physical_table",
                "source_id": source_id,
                "database": database,
                "schema": schema,
                "table": table,
                "name": table,
                "title": business["subject"],
            },
            "business": {
                "subject": business["subject"],
                "use_cases": [],
                "default_roles": ["analyst"],
                "sensitivity_level": sensitivity,
            },
            "cube": {**cube, "status": "draft"},
            "ontology": ontology,
            "governance": {
                "sensitivity_level": sensitivity,
                "sensitive_fields": sensitive,
                "official_agent_consumes_spec": False,
                "approval_granted": False,
            },
        }

    @staticmethod
    def _resolve_lift_keys(lift: str, measures: Dict[str, Any]) -> List[str]:
        """lift=='all' → 全部度量；否则逗号分隔子集（strip 空白）与 measures 取交集（保序）。"""
        if lift == "all":
            return list(measures.keys())
        requested = {part.strip() for part in str(lift or "").split(",") if part.strip()}
        return [mk for mk in measures.keys() if mk in requested]
