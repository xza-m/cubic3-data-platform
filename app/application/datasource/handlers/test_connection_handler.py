"""
测试数据源连接处理器
"""
from datetime import datetime
from typing import Dict, Any
from app.domain.ports.repositories.datasource_repository import IDatasourceRepository
from app.application.datasource.queries.test_connection import TestConnectionQuery
from app.infrastructure.adapters.datasources.factory import AdapterFactory
from app.shared.exceptions import ApplicationException


class TestConnectionHandler:
    """测试数据源连接处理器"""
    
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
    
    def handle(self, query: TestConnectionQuery) -> Dict[str, Any]:
        """
        处理测试连接查询（异步）
        
        Args:
            query: 查询对象
        
        Returns:
            测试结果字典: {success: bool, message: str, details: dict}
        
        Raises:
            ApplicationException: 数据源不存在
        """
        # 1. 查找数据源
        datasource = self.repository.find_by_id(query.datasource_id)
        if not datasource:
            raise ApplicationException(f"数据源不存在: {query.datasource_id}")
        
        try:
            # 2. 规范化连接配置
            normalized_config = self._normalize_connection_config(
                datasource.source_type,
                datasource.connection_config
            )
            
            # 3. 创建适配器
            adapter = AdapterFactory.create_adapter(
                datasource.source_type,
                normalized_config
            )
            
            # 4. 测试连接
            result = adapter.test_connection()
            
            # 5. 更新连接状态
            if result['success']:
                datasource.mark_test_success()
            else:
                datasource.mark_test_failed(result['message'])
            
            # 6. 持久化状态
            self.repository.save(datasource)
            
            return result
            
        except Exception as e:
            # 记录错误
            error_msg = str(e)
            datasource.mark_test_failed(error_msg)
            self.repository.save(datasource)
            
            return {
                'success': False,
                'message': f'连接测试失败: {error_msg}',
                'details': None
            }
