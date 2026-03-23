"""
ClickHouse 数据源适配器
"""
import time
from typing import List, Dict, Any
from .base_adapter import DataSourceAdapter
from app.shared.utils.sql_validator import prepare_readonly_sql


class ClickHouseAdapter(DataSourceAdapter):
    """ClickHouse适配器实现"""
    
    def __init__(self, config: Dict[str, Any]):
        """
        初始化ClickHouse适配器
        
        Args:
            config: {
                'host': str,
                'port': int,
                'user': str,
                'password': str,
                'database': str (optional)
            }
        """
        super().__init__(config)
        self.client = None
    
    def _get_client(self):
        """获取ClickHouse客户端实例"""
        if not self.client:
            try:
                from clickhouse_driver import Client
                self.client = Client(
                    host=self.config['host'],
                    port=self.config.get('port', 9000),
                    user=self.config.get('user', 'default'),
                    password=self.config.get('password', ''),
                    database=self.config.get('database', 'default')
                )
            except ImportError:
                raise ImportError("请安装 clickhouse-driver: pip install clickhouse-driver")
        return self.client
    
    def test_connection(self) -> Dict[str, Any]:
        """测试ClickHouse连接"""
        try:
            client = self._get_client()
            
            # 执行简单查询测试连接
            result = client.execute('SELECT version()')
            version = result[0][0] if result else 'unknown'
            
            return {
                'success': True,
                'message': f'成功连接到ClickHouse',
                'details': {
                    'version': version,
                    'host': self.config['host'],
                    'port': self.config.get('port', 9000),
                    'database': self.config.get('database', 'default')
                }
            }
        except Exception as e:
            return {
                'success': False,
                'message': f'连接失败: {str(e)}',
                'details': {'error': str(e)}
            }
    
    def list_databases(self) -> List[str]:
        """获取ClickHouse数据库列表"""
        try:
            client = self._get_client()
            result = client.execute('SHOW DATABASES')
            return [row[0] for row in result]
        except Exception as e:
            raise Exception(f"获取数据库列表失败: {str(e)}")
    
    def list_tables(self, database: str) -> List[Dict[str, Any]]:
        """获取ClickHouse指定数据库的表列表"""
        try:
            client = self._get_client()
            
            # 查询表信息
            query = """
            SELECT 
                name,
                engine,
                total_rows,
                total_bytes,
                create_table_query
            FROM system.tables
            WHERE database = %(database)s
            ORDER BY name
            """
            
            result = client.execute(query, {'database': database})
            
            tables = []
            for row in result:
                # 尝试从建表语句中提取注释
                comment = ''
                create_query = row[4] if len(row) > 4 else ''
                if 'COMMENT' in create_query:
                    try:
                        comment = create_query.split('COMMENT')[1].split("'")[1]
                    except Exception:
                        pass
                
                tables.append({
                    'table_name': row[0],
                    'comment': comment,
                    'row_count': row[2] if len(row) > 2 else None,
                    'size': row[3] if len(row) > 3 else None,
                    'engine': row[1] if len(row) > 1 else None
                })
            
            return tables
        except Exception as e:
            raise Exception(f"获取表列表失败: {str(e)}")
    
    def get_table_schema(self, database: str, table: str) -> Dict[str, Any]:
        """获取ClickHouse表的Schema信息"""
        try:
            client = self._get_client()
            
            # 查询列信息
            query = """
            SELECT 
                name,
                type,
                comment,
                default_kind,
                default_expression
            FROM system.columns
            WHERE database = %(database)s AND table = %(table)s
            ORDER BY position
            """
            
            result = client.execute(query, {'database': database, 'table': table})
            
            columns = []
            for row in result:
                # ClickHouse 类型转小写以保持一致性
                type_str = row[1].lower() if row[1] else 'unknown'
                columns.append({
                    'name': row[0],
                    'type': type_str,
                    'comment': row[2] or '',
                    'is_nullable': 'nullable' in type_str,
                    'is_partition': False,  # ClickHouse分区需要单独判断
                    'default_value': row[4] if len(row) > 4 else None
                })
            
            # 查询表统计信息
            stats_query = """
            SELECT 
                total_rows,
                total_bytes
            FROM system.tables
            WHERE database = %(database)s AND name = %(table)s
            """
            stats = client.execute(stats_query, {'database': database, 'table': table})
            
            return {
                'table_name': table,
                'comment': '',  # ClickHouse表注释需要从建表语句解析
                'columns': columns,
                'partitions': [],  # ClickHouse分区信息需要进一步解析
                'row_count': stats[0][0] if stats else None,
                'size': stats[0][1] if stats else None
            }
        except Exception as e:
            raise Exception(f"获取表Schema失败: {str(e)}")
    
    def execute_query(self, sql: str, limit: int = 100) -> Dict[str, Any]:
        """执行ClickHouse SQL查询"""
        try:
            client = self._get_client()
            safe_sql = prepare_readonly_sql(sql, limit=limit)
            
            start_time = time.time()
            
            # 执行查询并获取列名和类型
            result, columns_info = client.execute(safe_sql, with_column_types=True)
            
            execution_time_ms = int((time.time() - start_time) * 1000)
            
            # 提取列名和类型 (columns_info 格式: [(name, type), ...])
            columns = []
            for col in columns_info:
                # ClickHouse 类型转小写以保持一致性
                col_type = col[1] if len(col) > 1 else 'unknown'
                columns.append({
                    'name': col[0],
                    'type': col_type.lower()
                })
            
            return {
                'columns': columns,
                'rows': result,
                'row_count': len(result),
                'execution_time_ms': execution_time_ms
            }
        except Exception as e:
            raise Exception(f"查询执行失败: {str(e)}")
    
    def execute_query_stream(self, sql: str, batch_size: int = 1000):
        """流式执行ClickHouse查询"""
        try:
            client = self._get_client()
            safe_sql = prepare_readonly_sql(sql)
            
            # 执行查询
            result, columns_info = client.execute(safe_sql, with_column_types=True)
            columns = [col[0] for col in columns_info]
            
            # 分批返回
            batch = []
            for row in result:
                batch.append(row)
                
                if len(batch) >= batch_size:
                    yield {
                        'columns': columns,
                        'rows': batch,
                        'batch_size': len(batch)
                    }
                    batch = []
            
            # 返回最后一批
            if batch:
                yield {
                    'columns': columns,
                    'rows': batch,
                    'batch_size': len(batch)
                }
        except Exception as e:
            raise Exception(f"流式查询失败: {str(e)}")
    
    def _close_connection(self):
        """关闭ClickHouse连接"""
        if self.client:
            try:
                self.client.disconnect()
            except Exception:
                pass
            finally:
                self.client = None
