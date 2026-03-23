"""
数据源查询端口接口
定义与外部数据源交互的契约
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, List


class IDataSourcePort(ABC):
    """
    数据源查询端口接口
    
    职责：
    1. 执行 SQL 查询
    2. 获取表结构
    3. 测试连接
    
    实现：由基础设施层的适配器实现
    """
    
    @abstractmethod
    def execute_query(
        self, 
        source_type: str,
        connection_config: Dict[str, Any],
        sql: str,
        limit: int = 100
    ) -> Dict[str, Any]:
        """
        执行查询 SQL
        
        Args:
            source_type: 数据源类型（maxcompute, clickhouse, mysql, postgresql）
            connection_config: 连接配置
            sql: SQL 语句
            limit: 结果行数限制
        
        Returns:
            {
                'columns': [str],
                'data': [dict],
                'row_count': int,
                'execution_time_ms': int
            }
        """
        pass
    
    @abstractmethod
    def test_connection(
        self,
        source_type: str,
        connection_config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        测试数据源连接
        
        Args:
            source_type: 数据源类型
            connection_config: 连接配置
        
        Returns:
            {
                'success': bool,
                'message': str,
                'details': dict (optional)
            }
        """
        pass
    
    @abstractmethod
    def get_table_schema(
        self,
        source_type: str,
        connection_config: Dict[str, Any],
        database: str,
        table: str
    ) -> Dict[str, Any]:
        """
        获取表结构信息
        
        Args:
            source_type: 数据源类型
            connection_config: 连接配置
            database: 数据库名
            table: 表名
        
        Returns:
            {
                'table_name': str,
                'comment': str,
                'columns': [
                    {
                        'name': str,
                        'type': str,
                        'comment': str,
                        'is_nullable': bool,
                        'is_partition': bool
                    }
                ],
                'partitions': [str]
            }
        """
        pass
    
    @abstractmethod
    def list_tables(
        self,
        source_type: str,
        connection_config: Dict[str, Any],
        database: str
    ) -> List[Dict[str, Any]]:
        """
        获取数据库的表列表
        
        Args:
            source_type: 数据源类型
            connection_config: 连接配置
            database: 数据库名
        
        Returns:
            表信息列表
        """
        pass
