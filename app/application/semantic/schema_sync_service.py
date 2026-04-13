"""SchemaSyncService — 物理 Schema Drift 检测

对比 Cube YAML 定义与物理表 Schema，输出偏移报告。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
import re
from typing import Any, Dict, List, Optional, Set

from app.application.semantic.semantic_runtime_binding_service import (
    SemanticRuntimeBindingService,
)
from app.domain.semantic.entities import CubeDefinition
from app.domain.semantic.ports.cube_repository import ICubeRepository
from app.domain.semantic.ports.schema_inspector import ISchemaInspector
from app.domain.semantic.ports.view_repository import IViewRepository
from app.domain.ports.repositories.semantic_registry_repository import (
    ISemanticRegistryRepository,
)
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


@dataclass
class DriftItem:
    cube: str
    table: str
    kind: str        # "missing_in_physical" | "missing_in_cube" | "type_mismatch"
    column: str
    detail: str = ""
    severity: str = "warn"
    object_type: str = "cube"
    object_name: Optional[str] = None


@dataclass
class SyncReport:
    total_cubes: int = 0
    checked_cubes: int = 0
    skipped_cubes: List[str] = field(default_factory=list)
    drifts: List[DriftItem] = field(default_factory=list)
    object_summaries: Dict[str, Dict[str, Any]] = field(default_factory=dict)

    @property
    def has_drifts(self) -> bool:
        return len(self.drifts) > 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_cubes": self.total_cubes,
            "checked_cubes": self.checked_cubes,
            "skipped_cubes": self.skipped_cubes,
            "drift_count": len(self.drifts),
            "object_summaries": self.object_summaries,
            "drifts": [
                {
                    "cube": d.cube,
                    "table": d.table,
                    "kind": d.kind,
                    "column": d.column,
                    "detail": d.detail,
                    "severity": d.severity,
                    "object_type": d.object_type,
                    "object_name": d.object_name or d.cube,
                }
                for d in self.drifts
            ],
        }


_CUBE_TYPE_MAP = {
    "string": {"STRING", "VARCHAR", "CHAR"},
    "number": {"BIGINT", "INT", "DOUBLE", "FLOAT", "DECIMAL", "TINYINT", "SMALLINT"},
    "time": {"DATETIME", "TIMESTAMP", "DATE", "STRING"},
    "boolean": {"BOOLEAN", "TINYINT"},
}


class SchemaSyncService:

    def __init__(
        self,
        cube_repo: ICubeRepository,
        inspector: ISchemaInspector,
        view_repo: Optional[IViewRepository] = None,
        registry_repo: Optional[ISemanticRegistryRepository] = None,
        runtime_binding_service: Optional[SemanticRuntimeBindingService] = None,
    ):
        self._cube_repo = cube_repo
        self._inspector = inspector
        self._view_repo = view_repo
        self._registry_repo = registry_repo
        self._runtime_binding_service = runtime_binding_service

    def check_all(self) -> SyncReport:
        cubes = self._cube_repo.list_all()
        report = SyncReport(total_cubes=len(cubes))

        for cube in cubes:
            try:
                checked = self._check_cube(cube, report)
                if checked:
                    report.checked_cubes += 1
            except Exception as e:
                logger.warning("schema_sync_skip", cube=cube.name, error=str(e))
                report.skipped_cubes.append(cube.name)

        self._check_views(report)
        self._finalize_report(report)
        return report

    def check_cube(self, cube_name: str) -> SyncReport:
        cube = self._cube_repo.get(cube_name)
        if cube is None:
            report = SyncReport()
            report.skipped_cubes.append(cube_name)
            return report

        report = SyncReport(total_cubes=1)
        self._check_cube(cube, report)
        report.checked_cubes = 1
        self._check_views(report, cube_name=cube_name)
        self._finalize_report(report)
        return report

    def _check_cube(self, cube: CubeDefinition, report: SyncReport) -> bool:
        """返回 True 表示成功检查，False 表示跳过"""
        if cube.source_sql:
            report.skipped_cubes.append(cube.name)
            return False
        inspector = self._resolve_inspector(cube)
        try:
            physical_cols = inspector.get_table_columns(cube.table)
            if not physical_cols:
                report.skipped_cubes.append(cube.name)
                return False

            physical_map: Dict[str, str] = {
                c["name"].lower(): c["type"].upper() for c in physical_cols
            }
            physical_names: Set[str] = set(physical_map.keys())

            cube_col_names: Set[str] = set()
            for dim_name, dim in cube.dimensions.items():
                col = self._extract_column_name(dim.sql, cube.name)
                if col:
                    cube_col_names.add(col.lower())
                    lower_col = col.lower()
                    if lower_col not in physical_names:
                        report.drifts.append(DriftItem(
                            cube=cube.name,
                            table=cube.table,
                            kind="missing_in_physical",
                            column=col,
                            detail=f"Dimension '{dim_name}' references column '{col}' not found in physical table",
                        ))
                    else:
                        physical_type = physical_map[lower_col]
                        expected = _CUBE_TYPE_MAP.get(dim.type, set())
                        if expected and physical_type not in expected:
                            report.drifts.append(DriftItem(
                                cube=cube.name,
                                table=cube.table,
                                kind="type_mismatch",
                                column=col,
                                detail=f"Dimension '{dim_name}' type='{dim.type}' but physical is '{physical_type}'",
                            ))
                if dim.enum_source:
                    enums = inspector.fetch_dict_enums(dim.enum_source.dict_type)
                    if not enums:
                        report.drifts.append(DriftItem(
                            cube=cube.name,
                            table=cube.table,
                            kind="enum_source_unavailable",
                            column=dim_name,
                            detail=(
                                f"Dimension '{dim_name}' depends on enum_source "
                                f"'{dim.enum_source.dict_type}' but no enum entries were loaded"
                            ),
                            severity="warn",
                        ))

            self._check_joins(cube, physical_map, report)

            for phys_col in physical_names - cube_col_names:
                if phys_col in ("ds", "pt", "__lifecycle__"):
                    continue
                report.drifts.append(DriftItem(
                    cube=cube.name,
                    table=cube.table,
                    kind="missing_in_cube",
                    column=phys_col,
                    detail=f"Physical column '{phys_col}' not referenced in Cube '{cube.name}'",
                ))

            return True
        finally:
            self._close_inspector(inspector)

    def _check_joins(
        self,
        cube: CubeDefinition,
        physical_map: Dict[str, str],
        report: SyncReport,
    ) -> None:
        for alias, join_def in cube.joins.items():
            target_cube = self._cube_repo.get(join_def.cube)
            if target_cube is None:
                report.drifts.append(DriftItem(
                    cube=cube.name,
                    table=cube.table,
                    kind="missing_join_target_cube",
                    column=alias,
                    detail=f"JOIN '{alias}' targets missing Cube '{join_def.cube}'",
                    severity="error",
                ))
                continue

            if cube.source_id and target_cube.source_id and cube.source_id != target_cube.source_id:
                report.drifts.append(DriftItem(
                    cube=cube.name,
                    table=cube.table,
                    kind="cross_source_join",
                    column=alias,
                    detail=(
                        f"JOIN '{alias}' 跨数据源: {cube.source_id} -> {target_cube.source_id}，"
                        "当前语义运行时默认不支持跨数据源 JOIN"
                    ),
                    severity="error",
                ))
                continue

            target_inspector = self._resolve_inspector(target_cube)
            try:
                target_cols = target_inspector.get_table_columns(target_cube.table)
            finally:
                self._close_inspector(target_inspector)
            target_map = {c["name"].lower(): c["type"].upper() for c in target_cols}

            for source_col, target_col in self._extract_join_columns(join_def.sql, cube.name, target_cube.name):
                if source_col and source_col.lower() not in physical_map:
                    report.drifts.append(DriftItem(
                        cube=cube.name,
                        table=cube.table,
                        kind="missing_join_column",
                        column=source_col,
                        detail=f"JOIN '{alias}' references source column '{source_col}' not found",
                        severity="error",
                    ))
                if target_col and target_col.lower() not in target_map:
                    report.drifts.append(DriftItem(
                        cube=cube.name,
                        table=target_cube.table,
                        kind="missing_join_target_column",
                        column=target_col,
                        detail=(
                            f"JOIN '{alias}' references target column "
                            f"'{target_cube.name}.{target_col}' not found"
                        ),
                        severity="error",
                    ))

    def _finalize_report(self, report: SyncReport) -> None:
        summaries = self._build_object_summaries(report)
        report.object_summaries = summaries
        if self._registry_repo is None:
            return
        now = datetime.utcnow()
        for key, summary in summaries.items():
            object_type, object_name = key.split(":", 1)
            self._registry_repo.upsert(
                object_type,
                object_name,
                last_drift_status=summary["status"],
                last_drift_checked_at=now,
            )
        self._registry_repo.commit()

    def _resolve_inspector(self, cube: CubeDefinition) -> ISchemaInspector:
        if self._runtime_binding_service is None or cube.source_id is None:
            return self._inspector
        inspector = self._runtime_binding_service.create_inspector_for_cube(cube)
        setattr(inspector, "_managed_by_schema_sync", True)
        return inspector

    @staticmethod
    def _close_inspector(inspector: ISchemaInspector) -> None:
        if not getattr(inspector, "_managed_by_schema_sync", False):
            return
        adapter = getattr(inspector, "_adapter", None)
        if adapter is not None and hasattr(adapter, "close"):
            try:
                adapter.close()
            except Exception:
                pass

    @staticmethod
    def _build_object_summaries(report: SyncReport) -> Dict[str, Dict[str, Any]]:
        summaries: Dict[str, Dict[str, Any]] = {}

        def ensure_summary(object_type: str, object_name: str) -> Dict[str, Any]:
            key = f"{object_type}:{object_name}"
            if key not in summaries:
                summaries[key] = {
                    "object_type": object_type,
                    "object_name": object_name,
                    "status": "ok",
                    "drift_count": 0,
                    "error_count": 0,
                    "warn_count": 0,
                }
            return summaries[key]

        for drift in report.drifts:
            object_type = drift.object_type or "cube"
            object_name = drift.object_name or drift.cube
            summary = ensure_summary(object_type, object_name)
            summary["drift_count"] += 1
            if drift.severity == "error":
                summary["error_count"] += 1
                summary["status"] = "error"
            else:
                summary["warn_count"] += 1
                if summary["status"] != "error":
                    summary["status"] = "warn"

        for cube_name in report.skipped_cubes:
            summary = ensure_summary("cube", cube_name)
            if summary["status"] == "ok":
                summary["status"] = "warn"

        return summaries

    def _check_views(self, report: SyncReport, cube_name: Optional[str] = None) -> None:
        if self._view_repo is None:
            return

        for view in self._view_repo.list_all():
            for ref in view.cubes:
                path = [part.strip() for part in ref.join_path.split(".") if part.strip()]
                if not path:
                    report.drifts.append(DriftItem(
                        cube=path[0] if path else "",
                        table="",
                        kind="invalid_view_reference",
                        column=ref.join_path,
                        detail=f"View '{view.name}' 的 join_path 不能为空",
                        severity="error",
                        object_type="view",
                        object_name=view.name,
                    ))
                    continue
                if cube_name and cube_name not in path:
                    continue

                current_cube = self._cube_repo.get(path[0])
                if current_cube is None:
                    report.drifts.append(DriftItem(
                        cube=path[0],
                        table="",
                        kind="invalid_view_reference",
                        column=ref.join_path,
                        detail=f"View '{view.name}' 引用了不存在的 Cube '{path[0]}'",
                        severity="error",
                        object_type="view",
                        object_name=view.name,
                    ))
                    continue

                valid_path = True
                for next_cube_name in path[1:]:
                    next_cube = self._cube_repo.get(next_cube_name)
                    if next_cube is None:
                        report.drifts.append(DriftItem(
                            cube=current_cube.name,
                            table=current_cube.table,
                            kind="invalid_view_reference",
                            column=ref.join_path,
                            detail=f"View '{view.name}' 的终点 Cube 不存在: '{next_cube_name}'",
                            severity="error",
                            object_type="view",
                            object_name=view.name,
                        ))
                        valid_path = False
                        break
                    if not any(join.cube == next_cube_name for join in current_cube.joins.values()):
                        report.drifts.append(DriftItem(
                            cube=current_cube.name,
                            table=current_cube.table,
                            kind="invalid_view_reference",
                            column=ref.join_path,
                            detail=(
                                f"View '{view.name}' 的 JOIN 路径无效: "
                                f"{current_cube.name} -> {next_cube_name}"
                            ),
                            severity="error",
                            object_type="view",
                            object_name=view.name,
                        ))
                        valid_path = False
                        break
                    current_cube = next_cube

                if not valid_path:
                    continue

                if ref.includes == "*":
                    continue

                known_fields = set(current_cube.dimensions.keys()) | set(current_cube.measures.keys())
                for field_name in ref.includes:
                    if field_name not in known_fields:
                        report.drifts.append(DriftItem(
                            cube=current_cube.name,
                            table=current_cube.table,
                            kind="invalid_view_field",
                            column=field_name,
                            detail=(
                                f"View '{view.name}' 引用了不存在的字段: "
                                f"{current_cube.name}.{field_name}"
                            ),
                            severity="error",
                            object_type="view",
                            object_name=view.name,
                        ))

    @staticmethod
    def _extract_column_name(sql_expr: str, cube_name: str) -> Optional[str]:
        """从 {CUBE}.column_name 形式提取列名"""
        resolved = sql_expr.replace("{CUBE}", cube_name)
        if f"{cube_name}." in resolved:
            parts = resolved.split(f"{cube_name}.")
            if len(parts) >= 2:
                col = parts[1].strip().split()[0].rstrip(",)")
                return col
        return None

    @staticmethod
    def _extract_join_columns(
        sql_expr: str,
        source_cube_name: str,
        target_cube_name: str,
    ) -> List[tuple[Optional[str], Optional[str]]]:
        resolved = sql_expr.replace("{CUBE}", source_cube_name).replace(
            f"{{{target_cube_name}}}",
            target_cube_name,
        )
        pairs = []
        for source_col, target_col in re.findall(
            rf"{source_cube_name}\.(\w+)\s*=\s*{target_cube_name}\.(\w+)",
            resolved,
        ):
            pairs.append((source_col, target_col))
        return pairs
