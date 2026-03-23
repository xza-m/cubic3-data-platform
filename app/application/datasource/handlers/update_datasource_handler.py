"""
更新数据源处理器
"""
from datetime import datetime
from app.shared.utils.time import utcnow
from typing import Dict, Any
from app.domain.entities.data_source import DataSource
from app.domain.ports.repositories.datasource_repository import IDatasourceRepository
from app.application.datasource.commands.update_datasource import UpdateDatasourceCommand
from app.shared.exceptions import ApplicationException


class UpdateDatasourceHandler:
    """更新数据源处理器"""
    
    def __init__(self, repository: IDatasourceRepository):
        """
        初始化
        
        Args:
            repository: 数据源仓储
        """
        self.repository = repository
    
    def _normalize_connection_config(self, source_type: str, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        规范化连接配置，兼容前端字段命名
        
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
    
    def handle(self, command: UpdateDatasourceCommand) -> DataSource:
        """
        处理更新数据源命令
        
        Args:
            command: 更新命令
        
        Returns:
            更新后的数据源实体
        
        Raises:
            ApplicationException: 数据源不存在或业务规则验证失败
        """
        # 1. 查找数据源
        datasource = self.repository.find_by_id(command.datasource_id)
        if not datasource:
            raise ApplicationException(f"数据源不存在: {command.datasource_id}")
        
        # 2. 验证：如果更新名称，检查是否冲突
        if command.name and command.name != datasource.name:
            if self.repository.exists_by_name(command.name, exclude_id=datasource.id):
                raise ApplicationException(f"数据源名称 '{command.name}' 已存在")
        
        # 3. 更新字段
        if command.name is not None:
            datasource.name = command.name
        
        if command.description is not None:
            datasource.description = command.description
        
        if command.is_active is not None:
            datasource.is_active = command.is_active
        
        # 4. 合并更新连接配置
        if command.connection_config is not None:
            old_config = datasource.connection_config or {}
            new_config = command.connection_config or {}
            # 规范化新配置的字段名
            normalized_new_config = self._normalize_connection_config(
                datasource.source_type,
                new_config
            )
            datasource.connection_config = {**old_config, **normalized_new_config}
            # 重置连接状态（需要重新测试）
            datasource.connection_status = 'unknown'
        
        # 5. 合并更新额外配置
        if command.extra_config is not None:
            old_extra = datasource.extra_config or {}
            new_extra = command.extra_config or {}
            datasource.extra_config = {**old_extra, **new_extra}
        
        datasource.updated_at = utcnow()
        
        # 6. 持久化
        return self.repository.save(datasource)
