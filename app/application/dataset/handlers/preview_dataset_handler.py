"""
预览数据集处理器
"""
from typing import Dict, Any
from app.domain.ports.repositories.datasource_repository import IDatasourceRepository
from app.application.dataset.queries.preview_dataset import PreviewDatasetQuery
from app.application.datasource.handlers.preview_table_data_handler import PreviewTableDataHandler
from app.application.datasource.queries.preview_table_data import PreviewTableDataQuery
from app.infrastructure.adapters.datasources.factory import AdapterFactory
from app.domain.services.field_identifier import FieldIdentifier
from app.shared.exceptions import ApplicationException


PREVIEW_LIMIT = 20


class PreviewDatasetHandler:
    """预览数据集处理器"""
    
    def __init__(
        self,
        datasource_repository: IDatasourceRepository,
        preview_table_data_handler: PreviewTableDataHandler = None,
    ):
        self.datasource_repository = datasource_repository
        self.preview_table_data_handler = preview_table_data_handler
    
    def handle(self, query: PreviewDatasetQuery) -> Dict[str, Any]:
        """处理预览查询（异步）"""
        # 1. 查找数据源
        datasource = self.datasource_repository.find_by_id(query.datasource_id)
        if not datasource:
            raise ApplicationException(
                f"数据源不存在: {query.datasource_id}",
                code='DATASOURCE_NOT_FOUND',
                details={'reason_code': 'object_not_found', 'datasource_id': query.datasource_id},
            )
        
        # 2. 创建适配器
        adapter = AdapterFactory.create_adapter(
            datasource.source_type,
            datasource.connection_config
        )
        
        # 3. 获取表Schema
        try:
            schema_info = adapter.get_table_schema(query.database, query.table)
        except Exception as exc:
            raise ApplicationException(
                f"表结构获取失败: {exc}",
                code='DATASET_PREVIEW_FAILED',
                details={'reason_code': 'schema_fetch_failed', 'database': query.database, 'table': query.table},
            ) from exc
        
        # 4. 准备字段信息用于识别
        fields_to_identify = []
        for col in schema_info.get('columns', []):
            fields_to_identify.append({
                'name': col['name'],
                'type': col['type'],
                'comment': col.get('comment', ''),
                'is_partition': False
            })
        
        # 标记分区字段
        partition_names = [p['name'] for p in schema_info.get('partitions', [])]
        for field in fields_to_identify:
            if field['name'] in partition_names:
                field['is_partition'] = True
        
        # 5. 自动识别字段类型
        identified_fields = FieldIdentifier.identify_fields_batch(fields_to_identify)
        
        # 6. 获取统计信息
        statistics = FieldIdentifier.get_statistics(identified_fields)
        
        if self.preview_table_data_handler is None:
            self.preview_table_data_handler = PreviewTableDataHandler(
                datasource_repository=self.datasource_repository
            )

        preview_result = self.preview_table_data_handler.handle(
            PreviewTableDataQuery(
                datasource_id=query.datasource_id,
                database=query.database,
                table=query.table,
                limit=PREVIEW_LIMIT,
            )
        )
        sample_rows = list(preview_result.get('data') or [])
        sample_columns = [column.get('name') for column in preview_result.get('columns') or [] if column.get('name')]

        return {
            'preview_limit': PREVIEW_LIMIT,
            'table_info': {
                'database': query.database,
                'table': query.table,
                'comment': schema_info.get('comment', ''),
                'row_count': schema_info.get('row_count'),
                'size': schema_info.get('size'),
                'create_time': schema_info.get('create_time'),
                'last_modified': schema_info.get('last_modified')
            },
            'fields': identified_fields,
            'sample_rows': sample_rows,
            'sample_columns': sample_columns,
            'statistics': statistics
        }
