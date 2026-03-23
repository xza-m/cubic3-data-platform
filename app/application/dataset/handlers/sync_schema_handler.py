"""
同步数据集Schema处理器
"""
from typing import Dict, Any
from datetime import datetime
from app.shared.utils.time import utcnow
from app.domain.entities.dataset import Dataset
from app.domain.entities.dataset_field import DatasetField
from app.domain.ports.repositories.dataset_repository import IDatasetRepository
from app.domain.ports.repositories.datasource_repository import IDatasourceRepository
from app.application.dataset.commands.sync_schema import SyncSchemaCommand
from app.infrastructure.adapters.datasources.factory import AdapterFactory
from app.domain.services.field_identifier import FieldIdentifier
from app.shared.exceptions import ApplicationException
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class SyncSchemaHandler:
    """同步Schema处理器"""
    
    def __init__(
        self, 
        dataset_repository: IDatasetRepository,
        datasource_repository: IDatasourceRepository
    ):
        self.dataset_repository = dataset_repository
        self.datasource_repository = datasource_repository
    
    def handle(self, command: SyncSchemaCommand) -> Dict[str, Any]:
        """
        处理同步Schema命令（异步）
        
        Args:
            command: 同步命令
            
        Returns:
            同步结果
        """
        # 1. 查找数据集
        dataset = self.dataset_repository.find_by_id(command.dataset_id)
        if not dataset:
            raise ApplicationException(f"数据集不存在: {command.dataset_id}")
        
        # 2. 检查数据集类型（仅物理表支持同步）
        if dataset.dataset_type != 'physical':
            raise ApplicationException(f"仅物理表数据集支持元数据同步，当前类型: {dataset.dataset_type}")
        
        # 3. 查找数据源
        datasource = self.datasource_repository.find_by_id(dataset.source_id)
        if not datasource:
            raise ApplicationException(f"数据源不存在: {dataset.source_id}")
        
        try:
            # 4. 标记为同步中
            dataset.start_sync()
            self.dataset_repository.save(dataset)
            self.dataset_repository.commit()
            
            # 5. 创建适配器
            adapter = AdapterFactory.create_adapter(
                datasource.source_type,
                datasource.connection_config
            )
            
            # 6. 获取表Schema（需要解析 physical_table）
            # physical_table 格式: "database.table" 或 "table"
            parts = dataset.physical_table.split('.')
            if len(parts) == 2:
                database, table = parts
            else:
                # 如果没有指定数据库，尝试从数据源配置获取默认数据库
                database = datasource.connection_config.get('database', '')
                table = dataset.physical_table
            
            schema_info = adapter.get_table_schema(database, table)
            
            # 7. 准备字段信息用于识别
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
            
            # 8. 自动识别字段类型
            identified_fields = FieldIdentifier.identify_fields_batch(fields_to_identify)
            
            # 9. 更新字段信息
            # 获取现有字段
            existing_fields = {f.physical_name: f for f in dataset.fields.all()}
            
            updated_count = 0
            added_count = 0
            
            for idx, field_info in enumerate(identified_fields):
                physical_name = field_info['physical_name']
                
                if physical_name in existing_fields:
                    # 更新现有字段
                    field = existing_fields[physical_name]
                    field.data_type = field_info['data_type']
                    field.comment = field_info.get('comment')
                    field.business_type = field_info['business_type']
                    field.sensitivity_level = field_info['sensitivity_level']
                    field.mask_rule = field_info.get('mask_rule')
                    field.field_order = idx
                    field.updated_at = utcnow()
                    updated_count += 1
                else:
                    # 新增字段
                    new_field = DatasetField(
                        dataset=dataset,
                        physical_name=physical_name,
                        data_type=field_info['data_type'],
                        display_name=field_info.get('display_name', physical_name),
                        business_type=field_info['business_type'],
                        sensitivity_level=field_info['sensitivity_level'],
                        mask_rule=field_info.get('mask_rule'),
                        comment=field_info.get('comment'),
                        field_order=idx,
                        is_nullable=True
                    )
                    dataset.fields.append(new_field)
                    added_count += 1
            
            # 10. 标记同步完成
            dataset.complete_sync(len(identified_fields))
            self.dataset_repository.save(dataset)
            self.dataset_repository.commit()
            
            logger.info(
                f"Dataset schema synced successfully",
                extra={
                    'dataset_id': dataset.id,
                    'dataset_code': dataset.dataset_code,
                    'total_fields': len(identified_fields),
                    'updated': updated_count,
                    'added': added_count
                }
            )
            
            return {
                'dataset_id': dataset.id,
                'dataset_code': dataset.dataset_code,
                'sync_status': dataset.sync_status,
                'total_fields': len(identified_fields),
                'updated_fields': updated_count,
                'added_fields': added_count,
                'last_sync_at': dataset.last_sync_at.isoformat() if dataset.last_sync_at else None
            }
            
        except Exception as e:
            # 同步失败
            error_msg = str(e)
            dataset.fail_sync(error_msg)
            self.dataset_repository.save(dataset)
            self.dataset_repository.commit()
            
            logger.error(
                f"Dataset schema sync failed: {error_msg}",
                extra={
                    'dataset_id': dataset.id,
                    'dataset_code': dataset.dataset_code
                }
            )
            
            raise ApplicationException(f"元数据同步失败: {error_msg}")
