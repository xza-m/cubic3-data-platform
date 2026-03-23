"""
MySQL 数据源适配器
"""
import time
from typing import Dict, Any, List
import pymysql
import pymysql.cursors
from tenacity import retry, stop_after_attempt, wait_fixed
from app.shared.utils.logger import get_logger
from app.shared.utils.sql_validator import prepare_readonly_sql
from .base_adapter import DataSourceAdapter

logger = get_logger(__name__)


class MySQLAdapter(DataSourceAdapter):
    """MySQL 数据源适配器"""
    
    def _connect(self, **kwargs):
        """创建 MySQL 连接"""
        connect_args = {
            'host': self.config.get('host'),
            'port': self.config.get('port', 3306),
            'user': self.config.get('user'),
            'password': self.config.get('password'),
            'database': self.config.get('database', 'information_schema'),
            'connect_timeout': 10,
            'charset': 'utf8mb4',
        }
        connect_args.update(kwargs)
        return pymysql.connect(**connect_args)
    
    @retry(stop=stop_after_attempt(3), wait=wait_fixed(1))
    def test_connection(self) -> Dict[str, Any]:
        """测试MySQL连接"""
        try:
            conn = self._connect()
            
            try:
                with conn.cursor() as cursor:
                    cursor.execute('SELECT VERSION()')
                    result = cursor.fetchone()
                    version = result[0] if result else 'Unknown'
            finally:
                conn.close()
            
            return {
                'success': True,
                'message': '连接成功',
                'details': {
                    'version': version,
                    'database': self.config.get('database', 'information_schema')
                }
            }
        except Exception as e:
            logger.error(f"MySQL connection test failed: {str(e)}")
            return {
                'success': False,
                'message': f'连接失败: {str(e)}',
                'details': {}
            }
    
    def list_databases(self) -> List[str]:
        """获取数据库列表"""
        try:
            conn = self._connect(database='information_schema')
            
            try:
                with conn.cursor() as cursor:
                    cursor.execute("""
                        SELECT SCHEMA_NAME 
                        FROM INFORMATION_SCHEMA.SCHEMATA 
                        WHERE SCHEMA_NAME NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
                        ORDER BY SCHEMA_NAME
                    """)
                    result = cursor.fetchall()
            finally:
                conn.close()
            
            databases = [row[0] for row in result]
            current_db = self.config.get('database')
            if current_db and current_db not in databases:
                databases.insert(0, current_db)
            
            return databases
            
        except Exception as e:
            logger.error(f"Failed to list MySQL databases: {str(e)}")
            raise
    
    def list_tables(self, database: str) -> List[Dict[str, Any]]:
        """获取指定数据库的表列表"""
        try:
            conn = self._connect(database=database)
            
            try:
                with conn.cursor() as cursor:
                    cursor.execute("""
                        SELECT 
                            TABLE_NAME,
                            TABLE_COMMENT,
                            TABLE_ROWS,
                            ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) as size_mb
                        FROM INFORMATION_SCHEMA.TABLES
                        WHERE TABLE_SCHEMA = %s
                        ORDER BY TABLE_NAME
                    """, (database,))
                    result = cursor.fetchall()
            finally:
                conn.close()
            
            tables = []
            for row in result:
                tables.append({
                    'table_name': row[0],
                    'comment': row[1] or '',
                    'row_count': row[2] or 0,
                    'size': f"{row[3] or 0} MB"
                })
            
            return tables
            
        except Exception as e:
            logger.error(f"Failed to list MySQL tables: {str(e)}")
            raise
    
    def get_table_schema(self, database: str, table: str) -> Dict[str, Any]:
        """获取表的Schema信息"""
        try:
            conn = self._connect(database=database)
            
            try:
                with conn.cursor() as cursor:
                    # 获取列信息
                    cursor.execute("""
                        SELECT 
                            COLUMN_NAME,
                            DATA_TYPE,
                            IS_NULLABLE,
                            COLUMN_DEFAULT,
                            COLUMN_COMMENT,
                            COLUMN_KEY
                        FROM INFORMATION_SCHEMA.COLUMNS
                        WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
                        ORDER BY ORDINAL_POSITION
                    """, (database, table))
                    columns = cursor.fetchall()
                    
                    # 获取表注释和统计信息
                    cursor.execute("""
                        SELECT TABLE_COMMENT, TABLE_ROWS
                        FROM INFORMATION_SCHEMA.TABLES
                        WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
                    """, (database, table))
                    table_info = cursor.fetchone()
            finally:
                conn.close()
            
            column_list = []
            partition_columns = []
            
            for col in columns:
                is_partition = col[5] == 'PRI'  # COLUMN_KEY
                column_list.append({
                    'name': col[0],
                    'type': col[1].lower() if col[1] else 'unknown',
                    'comment': col[4] or '',
                    'is_nullable': col[2] == 'YES',
                    'is_partition': is_partition,
                    'default_value': col[3]
                })
                if is_partition:
                    partition_columns.append(col[0])
            
            return {
                'table_name': table,
                'comment': table_info[0] if table_info else '',
                'columns': column_list,
                'partitions': partition_columns,
                'row_count': table_info[1] if table_info else 0
            }
            
        except Exception as e:
            logger.error(f"Failed to get MySQL table schema: {str(e)}")
            raise
    
    def execute_query(self, sql: str, limit: int = 100) -> Dict[str, Any]:
        """执行查询SQL"""
        start_time = time.time()
        
        try:
            conn = self._connect(connect_timeout=30)
            
            safe_sql = prepare_readonly_sql(sql, limit=limit)
            
            try:
                with conn.cursor(pymysql.cursors.DictCursor) as cursor:
                    cursor.execute(safe_sql)
                    rows = cursor.fetchall()
                    
                    # 从 cursor.description 获取列信息
                    columns = []
                    if cursor.description:
                        # MySQL field types mapping
                        type_map = {
                            0: 'decimal',
                            1: 'tinyint',
                            2: 'smallint',
                            3: 'int',
                            4: 'float',
                            5: 'double',
                            7: 'timestamp',
                            8: 'bigint',
                            9: 'mediumint',
                            10: 'date',
                            11: 'time',
                            12: 'datetime',
                            13: 'year',
                            15: 'varchar',
                            16: 'bit',
                            245: 'json',
                            246: 'decimal',
                            247: 'enum',
                            248: 'set',
                            249: 'tinyblob',
                            250: 'mediumblob',
                            251: 'longblob',
                            252: 'blob',
                            253: 'varchar',
                            254: 'char'
                        }
                        for desc in cursor.description:
                            col_name = desc[0]
                            col_type_code = desc[1]
                            col_type = type_map.get(col_type_code, f'unknown_{col_type_code}')
                            columns.append({
                                'name': col_name,
                                'type': col_type
                            })
            finally:
                conn.close()
            
            execution_time = int((time.time() - start_time) * 1000)
            
            # pymysql DictCursor 返回的 rows 已经是 list of dict
            data = [dict(row) for row in rows]
            
            return {
                'columns': columns,
                'data': data,
                'row_count': len(data),
                'execution_time_ms': execution_time
            }
            
        except Exception as e:
            logger.error(f"Failed to execute MySQL query: {str(e)}")
            raise
    
    def execute_query_stream(self, sql: str, batch_size: int = 1000):
        """流式执行查询"""
        try:
            conn = self._connect(connect_timeout=30)
            
            safe_sql = prepare_readonly_sql(sql)
            
            try:
                # 使用 SSCursor (Server-Side Cursor) 进行流式读取
                with conn.cursor(pymysql.cursors.SSCursor) as cursor:
                    cursor.execute(safe_sql)
                    
                    while True:
                        rows = cursor.fetchmany(batch_size)
                        if not rows:
                            break
                        
                        columns = [desc[0] for desc in cursor.description]
                        
                        yield {
                            'columns': columns,
                            'rows': rows,
                            'batch_size': len(rows)
                        }
            finally:
                conn.close()
            
        except Exception as e:
            logger.error(f"Failed to stream MySQL query: {str(e)}")
            raise
    
    def _close_connection(self):
        """关闭连接"""
        if self.connection:
            self.connection.close()
