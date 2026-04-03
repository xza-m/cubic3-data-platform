"""Cube 建模服务。"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from app.application.semantic.semantic_runtime_binding_service import SemanticRuntimeBindingService
from app.domain.semantic.entities import CubeDefinition, MeasureDef
from app.domain.semantic.ports.cube_repository import ICubeRepository
from app.domain.ports.repositories.semantic_registry_repository import (
    ISemanticRegistryRepository,
)
from app.shared.exceptions import ApplicationException


class CubeModelingService:
    def __init__(
        self,
        cube_repo: ICubeRepository,
        runtime_binding_service: SemanticRuntimeBindingService,
        definition_service: Any = None,
        registry_repo: Optional[ISemanticRegistryRepository] = None,
    ):
        self._cube_repo = cube_repo
        self._runtime = runtime_binding_service
        self._definition_service = definition_service
        self._registry_repo = registry_repo

    def generate_cube_draft(
        self,
        *,
        source_id: int,
        database: str,
        table: str,
        schema: Optional[str] = None,
        name: Optional[str] = None,
        title: Optional[str] = None,
        description: Optional[str] = None,
    ) -> Dict[str, Any]:
        datasource = self._runtime.resolve_datasource(source_id)
        config = dict(datasource.connection_config or {})
        if datasource.source_type == "maxcompute":
            config["project"] = database
        else:
            config["database"] = database

        from app.infrastructure.adapters.datasources.factory import AdapterFactory

        adapter = AdapterFactory.create_adapter(datasource.source_type, config)
        try:
            table_ref = f"{schema}.{table}" if schema else table
            schema_info = adapter.get_table_schema(database, table_ref)
        except Exception as exc:
            raise ApplicationException(f"读取表结构失败: {str(exc)}") from exc
        finally:
            adapter.close()

        cube_name = self._normalize_name(name or table)
        cube_title = title or self._humanize_name(table)
        columns = schema_info.get("columns", [])
        partitions = schema_info.get("partitions", []) or []

        dimensions = self._build_dimensions(columns)
        measures = self._build_measures(columns, dimensions)
        if not measures:
            first_dim = next(iter(dimensions.keys()))
            measures["total_count"] = MeasureDef(
                title="总数",
                type="count",
                sql=f"{{CUBE}}.{first_dim}",
                description="自动生成的记录总数指标",
                certified=True,
            )

        payload: Dict[str, Any] = {
            "name": cube_name,
            "title": cube_title,
            "description": description or schema_info.get("comment") or f"基于 {table_ref} 自动生成的 Cube 草稿",
            "table": table_ref,
            "source_id": int(source_id),
            "source_database": database,
            "source_schema": schema,
            "data_source": datasource.source_type,
            "status": "draft",
            "dimensions": dimensions,
            "measures": {key: measure.model_dump(exclude_none=True) for key, measure in measures.items()},
            "segments": {},
            "joins": {},
        }
        if partitions:
            part_field = str(partitions[0])
            payload["partition"] = {
                "field": part_field,
                "type": "date" if self._infer_dimension_type(part_field, "string") == "time" else "string",
                "format": "yyyyMMdd" if "ds" in part_field.lower() else "yyyy-MM-dd",
                "max_range_days": 90,
            }
        primary_key = next((name for name, dim in dimensions.items() if dim.get("primary_key")), None)
        if primary_key:
            payload["entity_key"] = primary_key
            payload["grain"] = primary_key
        return payload

    def create_cube(self, payload: Dict[str, Any]) -> CubeDefinition:
        cube = CubeDefinition(**payload)
        if cube.status not in {"draft", "active", "deprecated"}:
            raise ApplicationException(f"不支持的 Cube 状态: {cube.status}")
        if cube.source_id is None:
            raise ApplicationException("Cube 必须绑定 source_id")
        if self._cube_repo.get(cube.name):
            raise ApplicationException(f"Cube 已存在: {cube.name}")
        self._runtime.resolve_cube_datasource(cube)
        self._cube_repo.save(cube)
        self._after_save(cube)
        return cube

    def update_cube(self, name: str, payload: Dict[str, Any]) -> CubeDefinition:
        existing = self._cube_repo.get(name)
        if existing is None:
            raise ApplicationException(f"未找到 Cube: {name}")
        if payload.get("name") and payload["name"] != name:
            raise ApplicationException("当前不支持修改 Cube 名称")
        merged = existing.model_dump(mode="json")
        merged.update(payload)
        merged["name"] = name
        cube = CubeDefinition(**merged)
        self._runtime.resolve_cube_datasource(cube)
        self._cube_repo.save(cube)
        self._after_save(cube)
        return cube

    def activate_cube(self, name: str) -> CubeDefinition:
        cube = self._must_get_cube(name)
        cube = CubeDefinition(**{**cube.model_dump(mode="json"), "status": "active"})
        self._cube_repo.save(cube)
        self._after_save(cube)
        return cube

    def deprecate_cube(self, name: str) -> CubeDefinition:
        cube = self._must_get_cube(name)
        cube = CubeDefinition(**{**cube.model_dump(mode="json"), "status": "deprecated"})
        self._cube_repo.save(cube)
        self._after_save(cube)
        return cube

    def create_revision_draft(self, name: str) -> CubeDefinition:
        cube = self._must_get_cube(name)
        if cube.status != "active":
            raise ApplicationException("只有已发布 Cube 才能发起修订")
        revision = CubeDefinition(**{**cube.model_dump(mode="json"), "status": "draft"})
        self._cube_repo.save(revision)
        self._after_save(revision)
        return revision

    def _must_get_cube(self, name: str) -> CubeDefinition:
        cube = self._cube_repo.get(name)
        if cube is None:
            raise ApplicationException(f"未找到 Cube: {name}")
        return cube

    def _after_save(self, cube: CubeDefinition) -> None:
        if self._definition_service is not None:
            self._definition_service.invalidate_cache()
        if self._registry_repo is not None:
            binding = self._runtime.resolve_source_binding_summary(cube)
            self._registry_repo.upsert(
                "cube",
                cube.name,
                source_id=cube.source_id,
                status=cube.status,
                source_binding_summary=binding,
                measure_summary_snapshot={
                    "count": len(cube.measures),
                    "names": list(cube.measures.keys()),
                },
                certified_measure_list=[name for name, measure in cube.measures.items() if measure.certified],
            )
            self._registry_repo.commit()

    @staticmethod
    def _normalize_name(name: str) -> str:
        cleaned = re.sub(r"[^a-zA-Z0-9_]+", "_", name.strip()).strip("_").lower()
        return cleaned or "cube_draft"

    @staticmethod
    def _humanize_name(name: str) -> str:
        return re.sub(r"[_\-]+", " ", name).strip().title() or "新建 Cube"

    def _build_dimensions(self, columns: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
        dimensions: Dict[str, Dict[str, Any]] = {}
        for column in columns:
            field_name = str(column.get("name") or "").strip()
            if not field_name:
                continue
            col_type = str(column.get("type") or "string")
            dimensions[field_name] = {
                "title": str(column.get("comment") or self._humanize_name(field_name)),
                "type": self._infer_dimension_type(field_name, col_type),
                "sql": f"{{CUBE}}.{field_name}",
                "primary_key": bool(column.get("is_primary_key")) or field_name.lower() in {"id", "pk"} or field_name.lower().endswith("_id"),
            }
        return dimensions

    def _build_measures(
        self,
        columns: List[Dict[str, Any]],
        dimensions: Dict[str, Dict[str, Any]],
    ) -> Dict[str, MeasureDef]:
        measures: Dict[str, MeasureDef] = {}
        count_basis = next(
            (name for name, dim in dimensions.items() if dim.get("primary_key")),
            next(iter(dimensions.keys()), "id"),
        )
        measures["total_count"] = MeasureDef(
            title="总数",
            type="count",
            sql=f"{{CUBE}}.{count_basis}",
            description="自动生成的记录总数指标",
            certified=True,
        )
        for column in columns:
            field_name = str(column.get("name") or "").strip()
            if not field_name or not self._is_numeric_type(str(column.get("type") or "")):
                continue
            measure_name = f"sum_{field_name}"
            measures[measure_name] = MeasureDef(
                title=f"{self._humanize_name(field_name)} 合计",
                type="sum",
                sql=f"{{CUBE}}.{field_name}",
                description=f"自动生成的 {field_name} 合计指标",
            )
        return measures

    @staticmethod
    def _infer_dimension_type(field_name: str, db_type: str) -> str:
        lower_type = db_type.lower()
        lower_name = field_name.lower()
        if any(token in lower_type for token in ("date", "time", "timestamp")) or lower_name.endswith("_at") or lower_name in {"ds", "dt", "date"}:
            return "time"
        if any(token in lower_type for token in ("int", "double", "float", "decimal", "numeric", "bigint")):
            return "number"
        if "bool" in lower_type:
            return "boolean"
        return "string"

    @staticmethod
    def _is_numeric_type(db_type: str) -> bool:
        lower_type = db_type.lower()
        return any(token in lower_type for token in ("int", "double", "float", "decimal", "numeric", "bigint"))
