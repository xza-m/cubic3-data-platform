"""
PostgreSQL 数据源适配器
"""
import time
from typing import Dict, Any, List
import psycopg2
import psycopg2.extras
from tenacity import retry, stop_after_attempt, wait_fixed
from app.shared.utils.logger import get_logger
from app.shared.utils.sql_validator import prepare_readonly_sql
from .base_adapter import DataSourceAdapter

logger = get_logger(__name__)


class PostgreSQLAdapter(DataSourceAdapter):
    """PostgreSQL 数据源适配器"""
    
    def _connect(self, **kwargs):
        """创建 PostgreSQL 连接"""
        connect_args = {
            'host': self.config.get('host'),
            'port': self.config.get('port', 5432),
            'user': self.config.get('user') or self.config.get('username'),
            'password': self.config.get('password'),
            'dbname': self.config.get('database', 'postgres'),
            'connect_timeout': 10,
        }
        connect_args.update(kwargs)
        return psycopg2.connect(**connect_args)
    
    @retry(stop=stop_after_attempt(3), wait=wait_fixed(1))
    def test_connection(self) -> Dict[str, Any]:
        """测试PostgreSQL连接"""
        try:
            conn = self._connect()
            
            try:
                with conn.cursor() as cursor:
                    cursor.execute('SELECT version()')
                    version = cursor.fetchone()[0]
            finally:
                conn.close()
            
            return {
                'success': True,
                'message': '连接成功',
                'details': {
                    'version': version,
                    'database': self.config.get('database', 'postgres')
                }
            }
        except Exception as e:
            logger.error(f"PostgreSQL connection test failed: {str(e)}")
            return {
                'success': False,
                'message': f'连接失败: {str(e)}',
                'details': {}
            }
    
    def list_databases(self) -> List[str]:
        """获取数据库列表"""
        try:
            conn = self._connect()
            
            try:
                with conn.cursor() as cursor:
                    cursor.execute("""
                        SELECT datname 
                        FROM pg_database 
                        WHERE datistemplate = false 
                        AND datname NOT IN ('postgres', 'template0', 'template1')
                        ORDER BY datname
                    """)
                    rows = cursor.fetchall()
            finally:
                conn.close()
            
            databases = [row[0] for row in rows]
            current_db = self.config.get('database', 'postgres')
            if current_db not in databases:
                databases.insert(0, current_db)
            
            return databases
            
        except Exception as e:
            logger.error(f"Failed to list PostgreSQL databases: {str(e)}")
            raise
    
    def list_schemas(self, database: str) -> List[str]:
        """获取指定数据库的Schema列表"""
        try:
            conn = self._connect(dbname=database)
            
            try:
                with conn.cursor() as cursor:
                    cursor.execute("""
                        SELECT schema_name 
                        FROM information_schema.schemata
                        WHERE schema_name NOT IN (
                            'pg_catalog', 'information_schema', 
                            'pg_toast', 'pg_temp_1', 'pg_toast_temp_1'
                        )
                        AND schema_name NOT LIKE 'pg_temp_%%'
                        AND schema_name NOT LIKE 'pg_toast_temp_%%'
                        ORDER BY schema_name
                    """)
                    rows = cursor.fetchall()
            finally:
                conn.close()
            
            return [row[0] for row in rows]
            
        except Exception as e:
            logger.error(f"Failed to list PostgreSQL schemas: {str(e)}")
            raise
    
    def list_tables(self, database: str) -> List[Dict[str, Any]]:
        """获取指定数据库的表列表"""
        try:
            conn = self._connect(dbname=database)
            
            try:
                with conn.cursor() as cursor:
                    cursor.execute("""
                        SELECT 
                            schemaname || '.' || tablename as table_name,
                            pg_size_pretty(
                                pg_total_relation_size(
                                    to_regclass(format('%I.%I', schemaname, tablename))
                                )
                            ) as size,
                            obj_description(
                                to_regclass(format('%I.%I', schemaname, tablename)),
                                'pg_class'
                            ) as comment
                        FROM pg_tables 
                        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
                        ORDER BY schemaname, tablename
                    """)
                    rows = cursor.fetchall()
            finally:
                conn.close()
            
            tables = []
            for row in rows:
                tables.append({
                    'table_name': row[0],
                    'comment': row[2] or '',
                    'size': row[1] or ''
                })
            
            return tables
            
        except Exception as e:
            logger.error(f"Failed to list PostgreSQL tables: {str(e)}")
            raise
    
    def get_table_schema(self, database: str, table: str) -> Dict[str, Any]:
        """获取表的Schema信息"""
        try:
            conn = self._connect(dbname=database)
            
            # 解析schema和table
            if '.' in table:
                schema_name, table_name = table.split('.', 1)
            else:
                schema_name, table_name = 'public', table
            
            try:
                with conn.cursor() as cursor:
                    # 获取列信息
                    cursor.execute("""
                        SELECT 
                            column_name,
                            data_type,
                            is_nullable,
                            column_default,
                            col_description((table_schema||'.'||table_name)::regclass::oid, ordinal_position) as comment
                        FROM information_schema.columns
                        WHERE table_schema = %s AND table_name = %s
                        ORDER BY ordinal_position
                    """, (schema_name, table_name))
                    columns = cursor.fetchall()
                    
                    # 获取表注释
                    cursor.execute("""
                        SELECT obj_description((%s||'.'||%s)::regclass)
                    """, (schema_name, table_name))
                    table_comment_row = cursor.fetchone()
                    table_comment = table_comment_row[0] if table_comment_row else ''
                    
                    # 获取行数估算。未采集统计信息时返回 None，避免把 unknown 误显示为 0。
                    cursor.execute("""
                        SELECT n_live_tup, last_analyze, last_autoanalyze
                        FROM pg_stat_user_tables 
                        WHERE schemaname = %s AND relname = %s
                    """, (schema_name, table_name))
                    stats_row = cursor.fetchone()
                    row_count = self._normalize_row_count_estimate(stats_row)
            finally:
                conn.close()
            
            column_list = []
            for col in columns:
                column_list.append({
                    'name': col[0],
                    'type': col[1].lower() if col[1] else 'unknown',
                    'comment': col[4] or '',
                    'is_nullable': col[2] == 'YES',
                    'is_partition': False,
                    'default_value': col[3]
                })
            
            return {
                'table_name': f"{schema_name}.{table_name}",
                'comment': table_comment or '',
                'columns': column_list,
                'partitions': [],
                'row_count': row_count
            }
            
        except Exception as e:
            logger.error(f"Failed to get PostgreSQL table schema: {str(e)}")
            raise
    
    def execute_query(self, sql: str, limit: int = 100) -> Dict[str, Any]:
        """执行查询SQL"""
        start_time = time.time()
        
        try:
            conn = self._connect(connect_timeout=30)
            
            safe_sql = prepare_readonly_sql(sql, limit=limit)
            
            try:
                with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
                    cursor.execute(safe_sql)
                    rows = cursor.fetchall()
                    description = cursor.description
                
                # 批量查询所有列的类型名（避免 N+1）
                columns = []
                if description:
                    type_map = self._batch_get_pg_type_names(conn, description)
                    for desc in description:
                        columns.append({
                            'name': desc.name,
                            'type': type_map.get(desc.type_code, 'unknown')
                        })
            finally:
                conn.close()
            
            data = [dict(row) for row in rows]
            
            execution_time = int((time.time() - start_time) * 1000)
            
            return {
                'columns': columns,
                'data': data,
                'row_count': len(data),
                'execution_time_ms': execution_time
            }
            
        except Exception as e:
            logger.error(f"Failed to execute PostgreSQL query: {str(e)}")
            raise
    
    def _batch_get_pg_type_names(self, conn, description) -> dict:
        """批量通过 OID 查询 PostgreSQL 类型名称（单次查询）"""
        try:
            oids = list({desc.type_code for desc in description})
            with conn.cursor() as cur:
                cur.execute("SELECT oid, typname FROM pg_type WHERE oid = ANY(%s)", (oids,))
                return {row[0]: row[1] for row in cur.fetchall()}
        except Exception:
            return {}

    @staticmethod
    def _normalize_row_count_estimate(stats_row):
        """标准化 PostgreSQL 行数估算；无分析统计时保持 unknown。"""
        if not stats_row:
            return None

        estimated = stats_row[0]
        if estimated is None:
            return None

        last_analyze = stats_row[1] if len(stats_row) > 1 else None
        last_autoanalyze = stats_row[2] if len(stats_row) > 2 else None
        if int(estimated) == 0 and last_analyze is None and last_autoanalyze is None:
            return None

        return max(int(estimated), 0)
    
    def execute_query_stream(self, sql: str, batch_size: int = 1000):
        """流式执行查询"""
        try:
            conn = self._connect(connect_timeout=30)
            
            safe_sql = prepare_readonly_sql(sql)
            
            try:
                # 使用 server-side cursor 进行流式查询
                with conn.cursor(name='stream_cursor') as cursor:
                    cursor.execute(safe_sql)
                    
                    while True:
                        rows = cursor.fetchmany(batch_size)
                        if not rows:
                            break
                        
                        columns = [desc[0] for desc in cursor.description]
                        batch_data = [list(row) for row in rows]
                        
                        yield {
                            'columns': columns,
                            'rows': batch_data,
                            'batch_size': len(batch_data)
                        }
            finally:
                conn.close()
            
        except Exception as e:
            logger.error(f"Failed to stream PostgreSQL query: {str(e)}")
            raise
    
    def _close_connection(self):
        """关闭连接"""
        if self.connection:
            self.connection.close()
