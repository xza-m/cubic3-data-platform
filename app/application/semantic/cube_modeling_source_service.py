"""统一建模源服务。"""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, Iterable, List, Optional

from app.application.semantic.cube_modeling_service import CubeModelingService
from app.domain.entities.dataset import Dataset
from app.domain.entities.dataset_field import DatasetField
from app.domain.ports.repositories.dataset_repository import IDatasetRepository
from app.domain.ports.repositories.datasource_repository import IDatasourceRepository
from app.shared.enums import DatasetType
from app.shared.exceptions import ApplicationException


class CubeModelingSourceService:
    """将物理表 / 数据集统一解析为 Cube 草稿生成输入。"""

    def __init__(
        self,
        cube_modeling_service: CubeModelingService,
        dataset_repository: IDatasetRepository,
        datasource_repository: IDatasourceRepository,
    ):
        self._cube_modeling_service = cube_modeling_service
        self._dataset_repository = dataset_repository
        self._datasource_repository = datasource_repository

    def resolve_default_physical_source_id(self) -> int:
        """与 ViewPublish / 语义默认绑定一致：优先 MaxCompute 数据源，否则回退 1。"""
        for ds in self._datasource_repository.find_all():
            if getattr(ds, "source_type", None) == "maxcompute":
                return int(ds.id)
        return 1

    def generate_cube_draft_from_source(
        self,
        *,
        source_kind: str,
        source_id: Optional[int] = None,
        database: Optional[str] = None,
        schema: Optional[str] = None,
        table: Optional[str] = None,
        dataset_id: Optional[int] = None,
        name: Optional[str] = None,
        title: Optional[str] = None,
        description: Optional[str] = None,
    ) -> Dict[str, Any]:
        if source_kind == "physical_table":
            if not source_id or not database or not table:
                raise ApplicationException("physical_table 建模源缺少必要字段: source_id, database, table")
            return self._cube_modeling_service.generate_cube_draft(
                source_id=source_id,
                database=database,
                schema=schema,
                table=table,
                name=name,
                title=title,
                description=description,
            )

        if source_kind != "dataset":
            raise ApplicationException(f"不支持的建模源类型: {source_kind}")

        if not dataset_id:
            raise ApplicationException("dataset 建模源缺少必要字段: dataset_id")

        dataset = self._dataset_repository.find_by_id(int(dataset_id))
        if dataset is None or getattr(dataset, "is_deleted", False):
            raise ApplicationException(f"数据集不存在: {dataset_id}")

        if dataset.dataset_type == DatasetType.PHYSICAL.value:
            return self._generate_from_physical_dataset(
                dataset=dataset,
                name=name,
                title=title,
                description=description,
            )
        if dataset.dataset_type == DatasetType.VIRTUAL.value:
            return self._generate_from_virtual_dataset(
                dataset=dataset,
                name=name,
                title=title,
                description=description,
            )
        if dataset.dataset_type == DatasetType.FILE.value:
            raise ApplicationException("当前暂不支持从 file 数据集生成 Cube")

        raise ApplicationException(f"不支持的数据集类型: {dataset.dataset_type}")

    def generate_cube_draft_from_asset_evidence(
        self,
        *,
        source_id: Any,
        database: Optional[str],
        table: Optional[str],
        evidence_bundle: Dict[str, Any],
        schema: Optional[str] = None,
        name: Optional[str] = None,
        title: Optional[str] = None,
        description: Optional[str] = None,
    ) -> Dict[str, Any]:
        """基于数据资产证据包中的 schema_snapshot 生成 Cube 草稿，避免优先打 live adapter。"""
        if not source_id or not database or not table:
            raise ApplicationException("数据资产建模源缺少必要字段: source_id, database, table")
        schema_snapshot = evidence_bundle.get("schema_snapshot") if isinstance(evidence_bundle, dict) else None
        if not isinstance(schema_snapshot, dict):
            raise ApplicationException("数据资产证据缺少 schema_snapshot，无法生成 Cube 草稿")

        columns = self._normalize_schema_columns(
            schema_snapshot.get("columns") or schema_snapshot.get("fields")
        )
        if not columns:
            raise ApplicationException("数据资产 schema_snapshot 缺少 columns 或 fields，无法生成 Cube 草稿")

        partitions = self._normalize_schema_partitions(schema_snapshot, columns)
        source_id_for_payload = self._strict_int_source_id(source_id)
        payload = self._cube_modeling_service.build_cube_draft_payload(
            source_id=source_id_for_payload,
            database=database,
            schema=schema,
            table=table,
            columns=columns,
            partitions=partitions,
            name=name or table,
            title=title or schema_snapshot.get("title"),
            description=description or schema_snapshot.get("description"),
            comment=schema_snapshot.get("comment"),
            data_source="metadata_snapshot",
        )
        payload["asset_evidence"] = deepcopy(evidence_bundle or {})
        return payload

    def _generate_from_physical_dataset(
        self,
        *,
        dataset: Dataset,
        name: Optional[str],
        title: Optional[str],
        description: Optional[str],
    ) -> Dict[str, Any]:
        database, schema, table = self._parse_physical_table(dataset.physical_table or "")
        if not dataset.source_id or not database or not table:
            raise ApplicationException("physical 数据集缺少可用于建模的 source_id 或 physical_table")
        draft = self._cube_modeling_service.generate_cube_draft(
            source_id=int(dataset.source_id),
            database=database,
            schema=schema,
            table=table,
            name=name or dataset.dataset_code,
            title=title or dataset.dataset_name,
            description=description or dataset.description,
        )
        draft["source_dataset_id"] = int(dataset.id)
        draft["source_dataset_type"] = dataset.dataset_type
        return draft

    def _generate_from_virtual_dataset(
        self,
        *,
        dataset: Dataset,
        name: Optional[str],
        title: Optional[str],
        description: Optional[str],
    ) -> Dict[str, Any]:
        if not dataset.source_id:
            raise ApplicationException("virtual 数据集缺少 source_id")
        if not dataset.sql_query:
            raise ApplicationException("virtual 数据集缺少 sql_query")

        datasource = self._datasource_repository.find_by_id(int(dataset.source_id))
        if datasource is None:
            raise ApplicationException(f"数据源不存在: {dataset.source_id}")

        config = datasource.connection_config or {}
        source_database = str(config.get("project") or config.get("database") or "")
        field_items = self._collect_dataset_fields(dataset)
        if not field_items:
            raise ApplicationException("virtual 数据集缺少字段定义，无法生成 Cube 草稿")

        columns = [
            {
                "name": field.physical_name,
                "type": field.data_type,
                "comment": field.comment or field.display_name or "",
            }
            for field in field_items
        ]
        payload = self._cube_modeling_service.build_cube_draft_payload(
            source_id=int(dataset.source_id),
            database=source_database,
            schema=None,
            table=dataset.dataset_code,
            columns=columns,
            partitions=[
                field.physical_name
                for field in field_items
                if field.business_type in {"partition", "partition_key"}
            ],
            name=name or dataset.dataset_code,
            title=title or dataset.dataset_name,
            description=description or dataset.description,
            comment=dataset.description or f"基于虚拟数据集 {dataset.dataset_name} 自动生成的 Cube 草稿",
            source_sql=dataset.sql_query,
            source_dataset_id=int(dataset.id),
            source_dataset_type=dataset.dataset_type,
        )
        return payload

    @staticmethod
    def _parse_physical_table(physical_table: str) -> tuple[str, Optional[str], str]:
        parts = [segment for segment in physical_table.split(".") if segment]
        if len(parts) >= 3:
            table = parts[-1]
            schema = parts[-2]
            database = ".".join(parts[:-2])
            return database, schema, table
        if len(parts) == 2:
            return parts[0], None, parts[1]
        return "", None, physical_table

    @staticmethod
    def _collect_dataset_fields(dataset: Dataset) -> List[DatasetField]:
        fields_relation = getattr(dataset, "fields", None)
        if fields_relation is None:
            return []
        if hasattr(fields_relation, "all"):
            return list(fields_relation.all())
        if isinstance(fields_relation, Iterable):
            return list(fields_relation)
        return []

    @staticmethod
    def _normalize_schema_columns(raw_columns: Any) -> List[Dict[str, Any]]:
        if not isinstance(raw_columns, list):
            return []
        columns: List[Dict[str, Any]] = []
        for item in raw_columns:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or item.get("field_name") or item.get("physical_name") or "").strip()
            if not name:
                continue
            columns.append({
                "name": name,
                "type": item.get("type") or item.get("data_type") or item.get("field_type") or "string",
                "comment": item.get("comment") or item.get("description") or item.get("display_name") or "",
            })
        return columns

    @staticmethod
    def _normalize_schema_partitions(schema_snapshot: Dict[str, Any], columns: List[Dict[str, Any]]) -> List[Any]:
        explicit_partitions = schema_snapshot.get("partitions") or schema_snapshot.get("partition_fields") or []
        if explicit_partitions:
            return explicit_partitions
        raw_columns = schema_snapshot.get("columns") or schema_snapshot.get("fields") or []
        partitions: List[str] = []
        if not isinstance(raw_columns, list):
            return partitions
        valid_column_names = {str(column.get("name") or "") for column in columns}
        for item in raw_columns:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or item.get("field_name") or item.get("physical_name") or "").strip()
            if name and name in valid_column_names and bool(item.get("is_partition") or item.get("partition")):
                partitions.append(name)
        return partitions

    @staticmethod
    def _strict_int_source_id(source_id: Any) -> int:
        try:
            return int(source_id)
        except (TypeError, ValueError):
            raise ApplicationException("数据资产证据中的 source_id 必须映射到有效数据源 ID") from None
