"""
数据集画像处理器（B-3）

对外暴露两个能力：
- ``profile``: 生成/返回数据集画像（列级别统计 + 行数）。
- ``refresh``: 强制重新生成画像。

当前实现是轻量级"best-effort"：依赖数据集关联的 Datasource 适配器从
目标表的元数据中获取 row_count；对于无物理表的数据集（virtual/file）
仅返回空列的占位结果。避免触发重量级全表扫描。
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from app.domain.ports.repositories.dataset_repository import IDatasetRepository
from app.domain.ports.repositories.datasource_repository import IDatasourceRepository
from app.infrastructure.adapters.datasources.factory import AdapterFactory
from app.shared.exceptions import ApplicationException, NotFoundError
from app.shared.utils.logger import get_logger
from app.shared.utils.time import utcnow

logger = get_logger(__name__)


class ProfileDatasetHandler:
    """数据集画像处理器"""

    def __init__(
        self,
        dataset_repository: IDatasetRepository,
        datasource_repository: IDatasourceRepository,
    ) -> None:
        self.dataset_repository = dataset_repository
        self.datasource_repository = datasource_repository

    # ------------------------------------------------------------------
    # Public
    # ------------------------------------------------------------------

    def handle(self, dataset_id: int, force_refresh: bool = False) -> Dict[str, Any]:
        """生成画像结果（force_refresh 目前只影响语义，不影响实现）"""
        dataset = self.dataset_repository.find_by_id(dataset_id)
        if not dataset:
            raise NotFoundError(f"数据集不存在: {dataset_id}")

        # fields 是 lazy='dynamic'，需要手动展开
        try:
            fields = list(dataset.fields.all())
        except AttributeError:
            fields = list(dataset.fields or [])

        row_count: Optional[int] = None
        partitions: List[Any] = []

        if dataset.source_id and dataset.physical_table:
            row_count, partitions = self._probe_table_meta(
                dataset.source_id, dataset.physical_table,
            )

        partition_names = {
            (p['name'] if isinstance(p, dict) else p) for p in (partitions or [])
        }

        columns: List[Dict[str, Any]] = []
        for field in fields:
            columns.append({
                'name': field.physical_name,
                'type': field.data_type,
                'null_count': 0 if field.physical_name in partition_names else None,
                'distinct_count': None,
                'min': None,
                'max': None,
                'sample': None,
            })

        return {
            'row_count': row_count or 0,
            'generated_at': utcnow().isoformat(),
            'columns': columns,
        }

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _probe_table_meta(
        self, datasource_id: int, physical_table: str,
    ) -> tuple[Optional[int], List[Any]]:
        """从适配器获取表的基本元数据（行数/分区）"""
        datasource = self.datasource_repository.find_by_id(datasource_id)
        if not datasource:
            logger.warning(f"数据集关联的数据源已不存在: source_id={datasource_id}")
            return None, []

        try:
            adapter = AdapterFactory.create_adapter(
                datasource.source_type,
                datasource.connection_config,
            )
        except Exception as exc:  # adapter 构建异常不阻塞
            logger.warning(
                f"构建数据源适配器失败: source_id={datasource_id}, err={exc}"
            )
            return None, []

        database, _, table = physical_table.partition('.')
        if not table:
            table = database
            database = None  # type: ignore[assignment]

        try:
            schema_info = adapter.get_table_schema(database, table)
        except Exception as exc:
            logger.warning(
                f"获取表元数据失败: source_id={datasource_id}, "
                f"table={physical_table}, err={exc}"
            )
            return None, []

        row_count = schema_info.get('row_count')
        partitions = schema_info.get('partitions', []) or []
        return (row_count if isinstance(row_count, int) else None), partitions
