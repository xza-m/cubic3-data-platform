"""
创建数据集处理器
"""
from app.domain.entities.dataset import Dataset
from app.domain.entities.dataset_field import DatasetField
from app.domain.ports.repositories.dataset_repository import IDatasetRepository
from app.application.dataset.commands.create_dataset import CreateDatasetCommand
from app.infrastructure.events.event_bus import EventBus
from app.domain.events.dataset_events import DatasetCreated
from app.shared.exceptions import ApplicationException
from app.domain.services.field_identifier import FieldIdentifier


class CreateDatasetHandler:
    """创建数据集处理器"""
    
    def __init__(self, repository: IDatasetRepository, event_bus: EventBus):
        self.repository = repository
        self.event_bus = event_bus
    
    def handle(self, command: CreateDatasetCommand) -> Dataset:
        """处理创建数据集命令"""
        # 1. 检查数据集编码是否已存在
        existing = self.repository.find_by_code(command.dataset_code)
        if existing and not existing.is_deleted:
            raise ApplicationException(f"数据集编码 '{command.dataset_code}' 已存在")
        
        # 2. 创建数据集实体
        dataset = Dataset(
            dataset_code=command.dataset_code,
            dataset_name=command.dataset_name,
            dataset_type=command.dataset_type,
            source_id=command.source_id,
            physical_table=command.physical_table,
            sql_query=command.sql_query,
            file_metadata=command.file_metadata,
            description=command.description or '',
            owner=command.owner,
            created_by=command.created_by
        )
        
        # 3. 统一字段识别逻辑（所有数据集类型复用 FieldIdentifier）
        normalized_fields = self._normalize_fields(command.fields)

        # 4. 创建字段实体
        for field_data in normalized_fields:
            field = DatasetField(
                dataset=dataset,
                physical_name=field_data['physical_name'],
                data_type=field_data['data_type'],
                display_name=field_data.get('display_name'),
                business_type=field_data.get('business_type', 'dimension'),
                sensitivity_level=field_data.get('sensitivity_level', 'public'),
                mask_rule=field_data.get('mask_rule'),
                comment=field_data.get('comment'),
                field_order=field_data.get('field_order', 0)
            )
            dataset.fields.append(field)
        
        # 4.5. 设置初始同步状态（如果有字段则标记为已同步）
        if normalized_fields and len(normalized_fields) > 0:
            dataset.complete_sync(len(normalized_fields))
        
        # 5. 记录领域事件
        dataset.record_event(
            DatasetCreated(
                dataset_id=dataset.id,
                dataset_code=dataset.dataset_code,
                dataset_name=dataset.dataset_name,
                source_id=dataset.source_id,
                created_by=command.created_by,
                user_id=command.created_by
            )
        )
        
        # 6. 持久化
        result = self.repository.save(dataset)
        
        # 7. 提交事务
        self.repository.commit()
        
        # 8. 发布事件
        events = dataset.clear_events()
        self.event_bus.publish_batch(events)
        
        return result

    @staticmethod
    def _normalize_fields(fields):
        """
        将字段列表统一为 FieldIdentifier 识别结果，适配 physical/virtual/file 三种类型。
        """
        if not fields:
            return []

        fields_to_identify = []
        for field in fields:
            name = field.get('physical_name') or field.get('name')
            data_type = field.get('data_type') or field.get('type')
            if not name or not data_type:
                continue
            fields_to_identify.append({
                'name': name,
                'type': data_type,
                'comment': field.get('comment', ''),
                'is_partition': field.get('business_type') == 'partition' or field.get('is_partition', False)
            })

        identified_fields = FieldIdentifier.identify_fields_batch(fields_to_identify)
        identified_map = {f.get('field_name'): f for f in identified_fields}

        normalized = []
        seen_names = set()
        for idx, field in enumerate(fields):
            name = field.get('physical_name') or field.get('name')
            if not name:
                continue
            if name in seen_names:
                continue
            seen_names.add(name)
            identified = identified_map.get(name, {})
            normalized.append({
                'physical_name': name,
                'data_type': field.get('data_type') or identified.get('data_type') or '',
                'display_name': field.get('display_name') or identified.get('display_name') or name,
                # 优先使用用户配置的值，没有配置则使用自动识别结果
                'business_type': field.get('business_type') or identified.get('business_type', 'dimension'),
                'sensitivity_level': field.get('sensitivity_level') or identified.get('sensitivity_level', 'public'),
                'mask_rule': field.get('mask_rule') or identified.get('mask_rule'),
                'comment': field.get('comment') or identified.get('comment'),
                'field_order': field.get('field_order', idx)
            })

        return normalized
