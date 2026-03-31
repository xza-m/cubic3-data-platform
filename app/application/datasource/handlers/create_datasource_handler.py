"""
创建数据源处理器
"""
from typing import Dict, Any
from app.domain.entities.data_source import DataSource
from app.domain.ports.repositories.datasource_repository import IDatasourceRepository
from app.application.datasource.commands.create_datasource import CreateDatasourceCommand
from app.infrastructure.adapters.datasources.factory import AdapterFactory
from app.infrastructure.events.event_bus import EventBus
from app.domain.events.datasource_events import DatasourceCreated
from app.shared.exceptions import ApplicationException


class CreateDatasourceHandler:
    """创建数据源处理器"""
    
    def __init__(self, repository: IDatasourceRepository, event_bus: EventBus):
        """
        初始化
        
        Args:
            repository: 数据源仓储
            event_bus: 事件总线
        """
        self.repository = repository
        self.event_bus = event_bus
    
    def _normalize_connection_config(self, source_type: str, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        规范化连接配置，兼容前端字段命名
        
        前端使用标准的阿里云字段命名（access_key_id, access_key_secret），
        需要映射为适配器期望的字段名（access_id, access_key）
        
        Args:
            source_type: 数据源类型
            config: 原始配置
        
        Returns:
            规范化后的配置
        """
        normalized = config.copy()
        
        # MaxCompute 字段映射
        if source_type == 'maxcompute':
            # access_key_id -> access_id
            if 'access_key_id' in normalized:
                normalized['access_id'] = normalized.pop('access_key_id')
            
            # access_key_secret -> access_key
            if 'access_key_secret' in normalized:
                normalized['access_key'] = normalized.pop('access_key_secret')
        
        return normalized
    
    def handle(self, command: CreateDatasourceCommand) -> DataSource:
        """
        处理创建数据源命令
        
        Args:
            command: 创建命令
        
        Returns:
            创建的数据源实体
        
        Raises:
            ApplicationException: 业务规则验证失败
        """
        # 1. 验证：检查名称是否已存在
        if self.repository.exists_by_name(command.name):
            raise ApplicationException(f"数据源名称 '{command.name}' 已存在")
        
        # 2. 验证：检查数据源类型是否支持
        supported_types = AdapterFactory.get_supported_types()
        if command.source_type not in supported_types:
            raise ApplicationException(
                f"不支持的数据源类型: {command.source_type}. "
                f"支持的类型: {', '.join(supported_types)}"
            )
        
        # 2.5. 规范化连接配置（兼容前端字段命名）
        normalized_config = self._normalize_connection_config(
            command.source_type,
            command.connection_config
        )
        
        # 3. 创建实体
        datasource = DataSource(
            name=command.name,
            source_type=command.source_type,
            description=command.description or '',
            connection_config=normalized_config,
            extra_config=command.extra_config or {},
            created_by=command.created_by
        )
        datasource.initialize_catalog_sync()
        
        # 4. 记录领域事件
        datasource.record_event(
            DatasourceCreated(
                datasource_id=datasource.id,
                name=datasource.name,
                source_type=datasource.source_type,
                created_by=command.created_by,
                user_id=command.created_by
            )
        )
        
        # 5. 持久化
        result = self.repository.save(datasource)
        
        # 6. 发布事件
        events = datasource.clear_events()
        self.event_bus.publish_batch(events)
        
        return result
