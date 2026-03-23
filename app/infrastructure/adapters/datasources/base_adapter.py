"""
数据源适配器基类
定义所有数据源适配器的统一接口
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional


class DataSourceAdapter(ABC):
    """数据源适配器基类"""
    
    def __init__(self, config: Dict[str, Any]):
        """
        初始化适配器
        
        Args:
            config: 数据源连接配置
        """
        self.config = config
        self.connection = None
    
    @abstractmethod
    def test_connection(self) -> Dict[str, Any]:
        """
        测试数据源连接
        
        Returns:
            {
                'success': bool,
                'message': str,
                'details': dict (optional)
            }
        """
        pass
    
    @abstractmethod
    def list_databases(self) -> List[str]:
        """
        获取数据库/项目列表
        
        Returns:
            数据库名称列表
        """
        pass
    
    def list_schemas(self, database: str) -> List[str]:
        """
        获取指定数据库的Schema列表
        
        默认返回空列表（MySQL, ClickHouse, MaxCompute 无独立 Schema 概念）。
        PostgreSQL 等支持 Schema 的数据库应重写此方法。
        
        Args:
            database: 数据库名称
            
        Returns:
            Schema名称列表
        """
        return []
    
    @abstractmethod
    def list_tables(self, database: str) -> List[Dict[str, Any]]:
        """
        获取指定数据库的表列表
        
        Args:
            database: 数据库名称
            
        Returns:
            表信息列表，每个元素包含:
            {
                'table_name': str,
                'comment': str,
                'row_count': int (optional),
                'size': int (optional),
                'created_at': str (optional)
            }
        """
        pass
    
    @abstractmethod
    def get_table_schema(self, database: str, table: str) -> Dict[str, Any]:
        """
        获取表的Schema信息
        
        Args:
            database: 数据库名称
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
                        'is_partition': bool,
                        'default_value': str (optional)
                    }
                ],
                'partitions': [str] (分区字段列表),
                'row_count': int (optional),
                'size': int (optional)
            }
        """
        pass
    
    @abstractmethod
    def execute_query(self, sql: str, limit: int = 100) -> Dict[str, Any]:
        """
        执行查询SQL
        
        Args:
            sql: SQL语句
            limit: 结果行数限制
            
        Returns:
            {
                'columns': [str],
                'data': [dict],  # 每行数据为字典格式
                'row_count': int,
                'execution_time_ms': int
            }
        """
        pass
    
    @abstractmethod
    def execute_query_stream(self, sql: str, batch_size: int = 1000):
        """
        流式执行查询（用于大数据量导出）
        
        Args:
            sql: SQL语句
            batch_size: 每批次行数
            
        Yields:
            批次数据字典:
            {
                'columns': [str],
                'rows': [[Any]],
                'batch_size': int
            }
        """
        pass
    
    def close(self):
        """关闭连接"""
        if self.connection:
            try:
                self._close_connection()
            except Exception as e:
                print(f"Error closing connection: {e}")
            finally:
                self.connection = None
    
    @abstractmethod
    def _close_connection(self):
        """子类实现具体的连接关闭逻辑"""
        pass
    
    def __enter__(self):
        """上下文管理器入口"""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """上下文管理器退出"""
        self.close()

