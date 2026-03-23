"""语义层运行时绑定服务。"""
from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

from app.domain.entities.data_source import DataSource
from app.domain.ports.repositories.datasource_repository import IDatasourceRepository
from app.domain.semantic.dialects import (
    ClickHouseDialect,
    MaxComputeDialect,
    MySQLDialect,
    PostgreSQLDialect,
    SQLDialect,
)
from app.domain.semantic.entities import CubeDefinition
from app.infrastructure.adapters.datasources.factory import AdapterFactory
from app.infrastructure.semantic.adapter_schema_inspector import AdapterSchemaInspector
from app.shared.exceptions import ApplicationException


class SemanticRuntimeBindingService:
    """统一处理 Cube 与真实数据源、方言、Inspector 的绑定。"""

    _DIALECTS: Dict[str, type[SQLDialect]] = {
        "maxcompute": MaxComputeDialect,
        "postgresql": PostgreSQLDialect,
        "mysql": MySQLDialect,
        "clickhouse": ClickHouseDialect,
    }

    def __init__(self, datasource_repository: IDatasourceRepository):
        self._datasource_repository = datasource_repository

    def resolve_datasource(self, source_id: Optional[int]) -> DataSource:
        if not source_id:
            raise ApplicationException("Cube 未绑定 source_id，无法解析真实数据源")
        datasource = self._datasource_repository.find_by_id(int(source_id))
        if datasource is None:
            raise ApplicationException(f"数据源不存在: {source_id}")
        return datasource

    def resolve_cube_datasource(self, cube: CubeDefinition) -> DataSource:
        return self.resolve_datasource(cube.source_id)

    def resolve_database(self, cube: CubeDefinition, datasource: Optional[DataSource] = None) -> str:
        datasource = datasource or self.resolve_cube_datasource(cube)
        if cube.source_database:
            return cube.source_database
        config = datasource.connection_config or {}
        return str(config.get("project") or config.get("database") or "")

    def resolve_source_binding_summary(self, cube: CubeDefinition) -> Dict[str, Any]:
        try:
            datasource = self.resolve_cube_datasource(cube)
        except Exception:
            return {
                "source_id": cube.source_id,
                "source_type": cube.data_source,
                "database": cube.source_database,
                "schema": cube.source_schema,
                "display": cube.table,
            }

        return {
            "source_id": datasource.id,
            "source_name": datasource.name,
            "source_type": datasource.source_type,
            "database": self.resolve_database(cube, datasource),
            "schema": cube.source_schema,
            "display": cube.table,
        }

    def create_adapter_for_cube(self, cube: CubeDefinition) -> Tuple[Any, DataSource, str]:
        datasource = self.resolve_cube_datasource(cube)
        database = self.resolve_database(cube, datasource)
        config = dict(datasource.connection_config or {})
        if database:
            if datasource.source_type == "maxcompute":
                config["project"] = database
            else:
                config["database"] = database
        adapter = AdapterFactory.create_adapter(datasource.source_type, config)
        return adapter, datasource, database

    def create_inspector_for_cube(self, cube: CubeDefinition) -> AdapterSchemaInspector:
        adapter, datasource, database = self.create_adapter_for_cube(cube)
        return AdapterSchemaInspector(adapter=adapter, database=database, source_type=datasource.source_type)

    def fetch_dict_enums(self, cube: CubeDefinition, dict_type: str) -> Optional[Dict[str, str]]:
        inspector = self.create_inspector_for_cube(cube)
        try:
            return inspector.fetch_dict_enums(dict_type)
        finally:
            inspector._adapter.close()  # type: ignore[attr-defined]

    def resolve_dialect_for_cube(self, cube: CubeDefinition) -> SQLDialect:
        datasource = self.resolve_cube_datasource(cube)
        dialect_cls = self._DIALECTS.get(datasource.source_type, MaxComputeDialect)
        return dialect_cls()

    def resolve_adapter_for_cube_name(self, cube_name: str, cube_repo: Any) -> Tuple[Any, DataSource, str, CubeDefinition]:
        cube = cube_repo.get(cube_name)
        if cube is None:
            raise ApplicationException(f"未找到 Cube: {cube_name}")
        adapter, datasource, database = self.create_adapter_for_cube(cube)
        return adapter, datasource, database, cube
