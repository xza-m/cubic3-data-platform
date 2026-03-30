"""
数据集元数据刷新服务。
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

import pandas as pd

from app.application.query.commands.execute_sql_preview import ExecuteSQLPreviewCommand
from app.application.query.handlers.execute_sql_preview_handler import ExecuteSQLPreviewHandler
from app.domain.entities.dataset import Dataset
from app.domain.ports.repositories.datasource_repository import IDatasourceRepository
from app.domain.services.field_identifier import FieldIdentifier
from app.infrastructure.adapters.datasources.factory import AdapterFactory
from app.shared.exceptions import ApplicationException, ValidationError

PREVIEW_LIMIT = 20


def _read_tabular_file(file_path: str, preview_limit: int = PREVIEW_LIMIT):
    suffix = Path(file_path).suffix.lower()
    if suffix == '.csv':
        return pd.read_csv(file_path), pd.read_csv(file_path, nrows=preview_limit)
    if suffix in {'.xls', '.xlsx'}:
        return pd.read_excel(file_path), pd.read_excel(file_path, nrows=preview_limit)
    raise ValidationError(
        f'不支持的文件类型: {suffix or "unknown"}',
        code='FILE_PARSE_FAILED',
        details={'reason_code': 'file_parse_failed', 'file_path': file_path},
    )


def parse_tabular_file_metadata(file_path: str, preview_limit: int = PREVIEW_LIMIT) -> Dict[str, Any]:
    """解析 CSV / Excel 文件并输出统一元数据。"""
    try:
        df_full, df_preview = _read_tabular_file(file_path, preview_limit=preview_limit)
    except ValidationError:
        raise
    except Exception as exc:
        raise ValidationError(
            f'文件解析失败: {exc}',
            code='FILE_PARSE_FAILED',
            details={'reason_code': 'file_parse_failed', 'file_path': file_path},
        ) from exc

    columns = []
    fields_to_identify = []
    for column_name in df_preview.columns:
        column_series = df_preview[column_name]
        dtype_str = str(column_series.dtype)
        columns.append({
            'name': str(column_name),
            'type': dtype_str,
            'sample_values': column_series.dropna().tolist()[:3],
        })
        fields_to_identify.append({
            'name': str(column_name),
            'type': dtype_str,
            'comment': '',
            'is_partition': False,
        })

    identified_fields = FieldIdentifier.identify_fields_batch(fields_to_identify)
    statistics = FieldIdentifier.get_statistics(identified_fields)
    sample_rows = df_preview.to_dict('records')

    return {
        'columns': columns,
        'fields': _normalize_identified_fields(identified_fields),
        'statistics': statistics,
        'sample_rows': sample_rows,
        'sample_columns': [column['name'] for column in columns],
        'preview_limit': preview_limit,
        'row_count': len(df_full),
    }


def _normalize_identified_fields(identified_fields: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    normalized = []
    for field in identified_fields:
        physical_name = field.get('physical_name') or field.get('field_name') or field.get('name')
        if not physical_name:
            continue
        normalized.append({
            'physical_name': physical_name,
            'data_type': field.get('data_type') or field.get('type') or '',
            'display_name': field.get('display_name') or physical_name,
            'business_type': field.get('business_type', 'dimension'),
            'sensitivity_level': field.get('sensitivity_level', 'public'),
            'mask_rule': field.get('mask_rule'),
            'comment': field.get('comment'),
        })
    return normalized


class DatasetMetadataRefreshService:
    """按数据集类型刷新统一字段元数据。"""

    def __init__(self, datasource_repository: IDatasourceRepository):
        self.datasource_repository = datasource_repository

    def refresh(self, dataset: Dataset) -> List[Dict[str, Any]]:
        if dataset.dataset_type == 'physical':
            return self._refresh_physical(dataset)
        if dataset.dataset_type == 'virtual':
            return self._refresh_virtual(dataset)
        if dataset.dataset_type == 'file':
            return self._refresh_file(dataset)
        raise ApplicationException(
            f'不支持的数据集类型: {dataset.dataset_type}',
            code='DATASET_TYPE_UNSUPPORTED',
            details={'reason_code': 'schema_fetch_failed', 'dataset_type': dataset.dataset_type},
        )

    def _refresh_physical(self, dataset: Dataset) -> List[Dict[str, Any]]:
        datasource = self.datasource_repository.find_by_id(dataset.source_id)
        if not datasource:
            raise ApplicationException(
                f"数据源不存在: {dataset.source_id}",
                code='DATASOURCE_NOT_FOUND',
                details={'reason_code': 'object_not_found', 'source_id': dataset.source_id},
            )

        database, table = _split_physical_table(dataset.physical_table or '', datasource.connection_config)
        adapter = AdapterFactory.create_adapter(datasource.source_type, datasource.connection_config)
        schema_info = adapter.get_table_schema(database, table)
        fields_to_identify = []
        partition_names = {partition['name'] for partition in schema_info.get('partitions', [])}
        for column in schema_info.get('columns', []):
            fields_to_identify.append({
                'name': column['name'],
                'type': column['type'],
                'comment': column.get('comment', ''),
                'is_partition': column['name'] in partition_names,
            })
        identified_fields = FieldIdentifier.identify_fields_batch(fields_to_identify)
        return _normalize_identified_fields(identified_fields)

    def _refresh_virtual(self, dataset: Dataset) -> List[Dict[str, Any]]:
        preview_handler = ExecuteSQLPreviewHandler(datasource_repository=self.datasource_repository)
        preview_result = preview_handler.handle(
            ExecuteSQLPreviewCommand(
                source_id=dataset.source_id,
                sql_query=dataset.sql_query or '',
                limit=PREVIEW_LIMIT,
            )
        )
        return _normalize_identified_fields(preview_result.get('fields') or [])

    def _refresh_file(self, dataset: Dataset) -> List[Dict[str, Any]]:
        file_path = (dataset.file_metadata or {}).get('file_path')
        if not file_path:
            raise ValidationError(
                '文件数据集缺少 file_path',
                code='FILE_PARSE_FAILED',
                details={'reason_code': 'file_parse_failed'},
            )
        metadata = parse_tabular_file_metadata(file_path, preview_limit=PREVIEW_LIMIT)
        return list(metadata.get('fields') or [])


def _split_physical_table(physical_table: str, connection_config: Dict[str, Any]) -> tuple[str, str]:
    parts = (physical_table or '').split('.', 1)
    if len(parts) == 2:
        return parts[0], parts[1]
    return connection_config.get('database', ''), physical_table
