"""
预览数据集处理器
"""
from typing import Dict, Any
from app.domain.ports.repositories.datasource_repository import IDatasourceRepository
from app.application.dataset.queries.preview_dataset import PreviewDatasetQuery
from app.infrastructure.adapters.datasources.factory import AdapterFactory
from app.domain.services.field_identifier import FieldIdentifier
from app.shared.exceptions import ApplicationException


class PreviewDatasetHandler:
    """预览数据集处理器"""
    
    def __init__(self, datasource_repository: IDatasourceRepository):
        self.datasource_repository = datasource_repository
    
    def handle(self, query: PreviewDatasetQuery) -> Dict[str, Any]:
        """处理预览查询（异步）"""
        # 1. 查找数据源
        datasource = self.datasource_repository.find_by_id(query.datasource_id)
        if not datasource:
            raise ApplicationException(f"数据源不存在: {query.datasource_id}")
        
        # 2. 创建适配器
        adapter = AdapterFactory.create_adapter(
            datasource.source_type,
            datasource.connection_config
        )
        
        # 3. 获取表Schema
        schema_info = adapter.get_table_schema(query.database, query.table)
        
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
        
        return {
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
            'statistics': statistics
        }
