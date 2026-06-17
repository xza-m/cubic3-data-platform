"""Agent-first Runtime 语义资产预检服务。"""
from __future__ import annotations

from typing import Any


class SemanticRuntimePreflightService:
    """检查 official Runtime 所需的已发布业务语义与 Cube 绑定。"""

    def __init__(self, *, object_repository, metric_repository, cube_repository):
        self._object_repository = object_repository
        self._metric_repository = metric_repository
        self._cube_repository = cube_repository

    def check(
        self,
        *,
        object_name: str,
        metric_name: str,
        cube_name: str | None = None,
        measure_name: str | None = None,
        expected_table: str | None = None,
    ) -> dict[str, Any]:
        issues: list[dict[str, str]] = []
        business_object = self._object_repository.get(object_name)
        metric = self._metric_repository.get(metric_name)

        self._check_active(
            entity=business_object,
            entity_type="object",
            name=object_name,
            issues=issues,
        )
        self._check_active(
            entity=metric,
            entity_type="metric",
            name=metric_name,
            issues=issues,
        )
        if metric is not None and metric.object_name != object_name:
            issues.append(
                self._issue(
                    "metric_object_mismatch",
                    "metric.object_name",
                    f"业务指标 '{metric_name}' 归属对象为 '{metric.object_name}'，不是 '{object_name}'",
                )
            )

        target_cube_name, target_measure_name = self._resolve_target_ref(
            metric=metric,
            cube_name=cube_name,
            measure_name=measure_name,
        )
        expected_measure_ref = (
            f"{target_cube_name}.{target_measure_name}" if target_cube_name and target_measure_name else None
        )
        if metric is not None:
            measure_refs = metric.measure_ref_strings()
            if expected_measure_ref and expected_measure_ref not in measure_refs:
                issues.append(
                    self._issue(
                        "metric_measure_ref_missing",
                        "metric.measure_refs",
                        f"业务指标 '{metric_name}' 未绑定 Measure '{expected_measure_ref}'",
                    )
                )
            elif not measure_refs:
                issues.append(
                    self._issue(
                        "metric_measure_refs_empty",
                        "metric.measure_refs",
                        f"业务指标 '{metric_name}' 没有配置 measure_refs",
                    )
                )
            self._check_metric_measure_refs(metric_name=metric_name, measure_refs=measure_refs, issues=issues)

        cube = self._cube_repository.get(target_cube_name) if target_cube_name else None
        self._check_active(
            entity=cube,
            entity_type="cube",
            name=target_cube_name or cube_name or "",
            issues=issues,
        )
        if cube is not None and expected_table and cube.table != expected_table:
            issues.append(
                self._issue(
                    "cube_table_mismatch",
                    "cube.table",
                    f"Cube '{cube.name}' 指向表 '{cube.table}'，不是期望表 '{expected_table}'",
                )
            )
        if cube is not None and target_measure_name and target_measure_name not in cube.measures:
            issues.append(
                self._issue(
                    "metric_measure_ref_stale",
                    "cube.measures",
                    f"Cube '{cube.name}' 不存在 Measure '{target_measure_name}'",
                )
            )

        resolved_bindings = []
        if (
            metric is not None
            and cube is not None
            and expected_measure_ref
            and expected_measure_ref in metric.measure_ref_strings()
            and target_measure_name in cube.measures
        ):
            resolved_bindings.append(
                {
                    "metric_name": metric.name,
                    "measure_ref": expected_measure_ref,
                    "cube_name": cube.name,
                    "measure_name": target_measure_name,
                    "binding_status": "linked",
                }
            )

        return {
            "status": "failed" if issues else "passed",
            "issues": issues,
            "assets": {
                "object": self._object_payload(business_object),
                "metric": self._metric_payload(metric),
                "cube": self._cube_payload(cube),
            },
            "resolved_bindings": resolved_bindings,
        }

    @staticmethod
    def _resolve_target_ref(*, metric, cube_name: str | None, measure_name: str | None) -> tuple[str | None, str | None]:
        if cube_name and measure_name:
            return cube_name, measure_name
        refs = metric.measure_ref_strings() if metric is not None else []
        if cube_name:
            for ref in refs:
                ref_cube, _, ref_measure = ref.partition(".")
                if ref_cube == cube_name and ref_measure:
                    return ref_cube, measure_name or ref_measure
            return cube_name, measure_name
        if refs:
            ref_cube, _, ref_measure = refs[0].partition(".")
            return ref_cube or None, measure_name or ref_measure or None
        return cube_name, measure_name

    def _check_metric_measure_refs(
        self,
        *,
        metric_name: str,
        measure_refs: list[str],
        issues: list[dict[str, str]],
    ) -> None:
        for ref in measure_refs:
            ref_cube_name, _, ref_measure_name = ref.partition(".")
            ref_cube = self._cube_repository.get(ref_cube_name) if ref_cube_name else None
            if ref_cube is None or not ref_measure_name or ref_measure_name not in ref_cube.measures:
                stale_issue = self._issue(
                    "metric_measure_ref_stale",
                    "metric.measure_refs",
                    f"业务指标 '{metric_name}' 配置了不可解析的 Measure 引用 '{ref}'",
                )
                if stale_issue not in issues:
                    issues.append(stale_issue)

    def _check_active(self, *, entity, entity_type: str, name: str, issues: list[dict[str, str]]) -> None:
        if entity is None:
            issues.append(
                self._issue(
                    f"{entity_type}_missing",
                    entity_type,
                    f"未找到 {entity_type} 资产: {name}",
                )
            )
            return
        status = str(getattr(entity, "status", "active") or "active")
        if status != "active":
            issues.append(
                self._issue(
                    f"{entity_type}_not_active",
                    f"{entity_type}.status",
                    f"{entity_type} 资产 '{name}' 当前状态为 '{status}'，不是 active",
                )
            )

    @staticmethod
    def _issue(code: str, path: str, message: str) -> dict[str, str]:
        return {
            "severity": "error",
            "code": code,
            "path": path,
            "message": message,
        }

    @staticmethod
    def _object_payload(entity) -> dict[str, Any] | None:
        if entity is None:
            return None
        return {
            "name": entity.name,
            "title": entity.title,
            "status": entity.status,
        }

    @staticmethod
    def _metric_payload(entity) -> dict[str, Any] | None:
        if entity is None:
            return None
        return {
            "name": entity.name,
            "title": entity.title,
            "object_name": entity.object_name,
            "status": entity.status,
            "measure_refs": entity.measure_ref_strings(),
        }

    @staticmethod
    def _cube_payload(entity) -> dict[str, Any] | None:
        if entity is None:
            return None
        return {
            "name": entity.name,
            "title": entity.title,
            "status": entity.status,
            "table": entity.table,
            "source_id": entity.source_id,
            "measures": sorted(entity.measures.keys()),
            "dimensions": sorted(entity.dimensions.keys()),
        }
