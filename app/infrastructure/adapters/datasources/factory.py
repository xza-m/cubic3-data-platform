"""
数据源适配器工厂
根据数据源类型创建相应的适配器实例
"""
from typing import Dict, Any
from .base_adapter import DataSourceAdapter
from .maxcompute_adapter import MaxComputeAdapter
from .clickhouse_adapter import ClickHouseAdapter
from .postgresql_adapter import PostgreSQLAdapter
from .mysql_adapter import MySQLAdapter


class AdapterFactory:
    """适配器工厂类"""
    
    _adapters = {
        'maxcompute': MaxComputeAdapter,
        'clickhouse': ClickHouseAdapter,
        'postgresql': PostgreSQLAdapter,
        'mysql': MySQLAdapter,
        # 'hive': HiveAdapter,  # TODO: 待实现
    }
    
    @classmethod
    def _normalize_connection_config(cls, source_type: str, config: Dict[str, Any]) -> Dict[str, Any]:
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
        if not config:
            return config
        
        normalized = config.copy()
        
        # MaxCompute 字段映射
        if source_type.lower() == 'maxcompute':
            # access_key_id -> access_id
            if 'access_key_id' in normalized:
                normalized['access_id'] = normalized.pop('access_key_id')
            
            # access_key_secret -> access_key
            if 'access_key_secret' in normalized:
                normalized['access_key'] = normalized.pop('access_key_secret')
        
        return normalized
    
    @classmethod
    def create_adapter(cls, source_type: str, config: Dict[str, Any]) -> DataSourceAdapter:
        """
        创建数据源适配器实例
        
        Args:
            source_type: 数据源类型 (maxcompute, clickhouse, postgresql, mysql, hive)
            config: 连接配置
            
        Returns:
            DataSourceAdapter实例
            
        Raises:
            ValueError: 不支持的数据源类型
        """
        adapter_class = cls._adapters.get(source_type.lower())
        
        if not adapter_class:
            raise ValueError(
                f"不支持的数据源类型: {source_type}. "
                f"支持的类型: {', '.join(cls._adapters.keys())}"
            )
        
        # 规范化连接配置（字段映射）
        normalized_config = cls._normalize_connection_config(source_type, config)
        
        return adapter_class(normalized_config)
    
    @classmethod
    def get_supported_types(cls) -> list:
        """获取支持的数据源类型列表"""
        return list(cls._adapters.keys())
    
    @classmethod
    def register_adapter(cls, source_type: str, adapter_class):
        """
        注册新的适配器类型
        
        Args:
            source_type: 数据源类型
            adapter_class: 适配器类
        """
        if not issubclass(adapter_class, DataSourceAdapter):
            raise TypeError(f"{adapter_class} 必须继承自 DataSourceAdapter")
        
        cls._adapters[source_type.lower()] = adapter_class

