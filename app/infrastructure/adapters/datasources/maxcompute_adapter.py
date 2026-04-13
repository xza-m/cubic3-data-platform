"""
MaxCompute 数据源适配器
"""
import time
from typing import List, Dict, Any
from .base_adapter import DataSourceAdapter
from app.shared.utils.sql_validator import prepare_readonly_sql


class MaxComputeAdapter(DataSourceAdapter):
    """MaxCompute适配器实现"""
    
    def __init__(self, config: Dict[str, Any]):
        """
        初始化MaxCompute适配器
        
        Args:
            config: {
                'access_id': str,
                'access_key': str,  # 业务层统一命名
                'endpoint': str,
                'project': str
            }
        """
        super().__init__(config)
        self.odps = None
    
    def _get_odps_client(self):
        """获取ODPS客户端实例"""
        if not self.odps:
            try:
                from odps import ODPS
                
                # 兼容新旧字段名：优先使用 access_key，不存在则使用 secret_access_key
                access_key = self.config.get('access_key')
                if not access_key:
                    access_key = self.config.get('secret_access_key')
                if not access_key:
                    raise ValueError("缺少必需配置: access_key")
                
                self.odps = ODPS(
                    access_id=self.config['access_id'],
                    secret_access_key=access_key,  # SDK 参数名为 secret_access_key
                    project=self.config['project'],
                    endpoint=self.config['endpoint']
                )
            except ImportError:
                raise ImportError("请安装 pyodps: pip install pyodps")
        return self.odps
    
    def test_connection(self) -> Dict[str, Any]:
        """测试MaxCompute连接"""
        try:
            odps = self._get_odps_client()
            
            # 尝试获取项目信息
            project = odps.get_project()
            
            return {
                'success': True,
                'message': f'成功连接到项目: {project.name}',
                'details': {
                    'project_name': project.name,
                    'owner': project.owner if hasattr(project, 'owner') else None,
                    'comment': project.comment if hasattr(project, 'comment') else None
                }
            }
        except Exception as e:
            return {
                'success': False,
                'message': f'连接失败: {str(e)}',
                'details': {'error': str(e)}
            }
    
    def list_databases(self) -> List[str]:
        """
        MaxCompute 使用项目(Project)概念
        返回当前配置的项目名
        """
        return [self.config['project']]
    
    def list_tables(self, database: str = None) -> List[Dict[str, Any]]:
        """
        获取MaxCompute项目中的表列表
        
        优化：只返回基本表信息，避免对每个表都调用详细API（会很慢）
        详细信息在获取表Schema时再获取
        """
        try:
            odps = self._get_odps_client()
            tables = []
            
            # 只获取表名列表，不获取详细信息（提升性能）
            for table in odps.list_tables():
                tables.append({
                    'table_name': table.name,
                    'comment': '',  # 不获取comment，避免额外API调用
                    'row_count': None,
                    'size': None,
                    'created_at': None,
                    'is_partitioned': False
                })
            
            return tables
        except Exception as e:
            raise Exception(f"获取表列表失败: {str(e)}")
    
    def get_table_schema(self, database: str = None, table: str = None) -> Dict[str, Any]:
        """获取MaxCompute表的Schema信息"""
        try:
            odps = self._get_odps_client()
            table_obj = odps.get_table(table)
            
            # 解析列信息
            columns = []
            partition_columns = []
            
            # 普通列
            for col in table_obj.schema.columns:
                # MaxCompute 类型转小写以保持一致性
                columns.append({
                    'name': col.name,
                    'type': str(col.type).lower(),
                    'comment': col.comment or '',
                    'is_nullable': True,  # MaxCompute默认可空
                    'is_partition': False,
                    'default_value': None
                })
            
            # 分区列
            if table_obj.schema.partitions:
                for col in table_obj.schema.partitions:
                    partition_columns.append(col.name)
                    # MaxCompute 类型转小写以保持一致性
                    columns.append({
                        'name': col.name,
                        'type': str(col.type).lower(),
                        'comment': col.comment or '',
                        'is_nullable': False,
                        'is_partition': True,
                        'default_value': None
                    })
            
            return {
                'table_name': table,
                'comment': table_obj.comment or '',
                'columns': columns,
                'partitions': partition_columns,
                'row_count': table_obj.get_stats().record_num if hasattr(table_obj, 'get_stats') else None,
                'size': table_obj.size if hasattr(table_obj, 'size') else None
            }
        except Exception as e:
            raise Exception(f"获取表Schema失败: {str(e)}")
    
    def execute_query(self, sql: str, limit: int = 100) -> Dict[str, Any]:
        """执行MaxCompute SQL查询（调用方应已完成 SQL 校验和 LIMIT 注入）"""
        try:
            odps = self._get_odps_client()
            safe_sql = sql.strip().rstrip(";").strip()
            
            start_time = time.time()
            
            hints = {'odps.sql.allow.antique.date': 'true'}
            instance = odps.execute_sql(safe_sql, hints=hints)
            
            # 等待执行完成
            instance.wait_for_success()
            
            # 获取结果
            with instance.open_reader() as reader:
                # 提取列名和类型
                columns = []
                for col in reader.schema.columns:
                    # MaxCompute 类型转小写以保持一致性
                    columns.append({
                        'name': col.name,
                        'type': str(col.type).lower()
                    })
                
                rows = []
                for record in reader:
                    rows.append([record[i] for i in range(len(columns))])
            
            execution_time_ms = int((time.time() - start_time) * 1000)
            
            return {
                'columns': columns,
                'rows': rows,
                'row_count': len(rows),
                'execution_time_ms': execution_time_ms
            }
        except Exception as e:
            raise Exception(f"查询执行失败: {str(e)}")
    
    def execute_query_stream(self, sql: str, batch_size: int = 1000):
        """流式执行MaxCompute查询"""
        try:
            odps = self._get_odps_client()
            safe_sql = prepare_readonly_sql(sql)
            
            # 执行查询
            instance = odps.execute_sql(safe_sql)
            instance.wait_for_success()
            
            # 流式读取结果
            with instance.open_reader() as reader:
                columns = [col.name for col in reader.schema.columns]
                
                batch = []
                for record in reader:
                    batch.append([record[i] for i in range(len(columns))])
                    
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
    
    @staticmethod
    def _safe_value(val):
        """将 PyODPS 原生类型转为 JSON 可序列化的 Python 原生类型。"""
        if val is None:
            return None
        from datetime import datetime, date
        if isinstance(val, (datetime, date)):
            return val.isoformat()
        try:
            if hasattr(val, 'isoformat'):
                return val.isoformat()
            if hasattr(val, 'strftime'):
                return str(val)
        except Exception:
            pass
        if isinstance(val, bytes):
            return val.decode('utf-8', errors='replace')
        if isinstance(val, (int, float, str, bool)):
            return val
        return str(val)

    def preview_table(self, table: str, limit: int = 20, partition_spec: str | None = None) -> Dict[str, Any]:
        """使用 PyODPS table.head() 读取预览数据，绕过 SQL 解析问题。"""
        try:
            odps = self._get_odps_client()
            table_obj = odps.get_table(table)
            start_time = time.time()

            if partition_spec is None and table_obj.schema.partitions:
                parts = list(table_obj.partitions)
                if parts:
                    partition_spec = parts[-1].name

            records = list(table_obj.head(limit, partition=partition_spec))

            columns = [{'name': col.name, 'type': str(col.type).lower()} for col in table_obj.schema.columns]
            col_names = [col.name for col in table_obj.schema.columns]

            rows = []
            for record in records:
                rows.append([self._safe_value(record[c]) for c in col_names])

            execution_time_ms = int((time.time() - start_time) * 1000)
            return {
                'columns': columns,
                'rows': rows,
                'row_count': len(rows),
                'execution_time_ms': execution_time_ms,
            }
        except Exception as e:
            raise Exception(f"预览数据失败: {str(e)}")

    def get_partitions(self, table: str) -> List[str]:
        """获取表的分区列表"""
        try:
            odps = self._get_odps_client()
            table_obj = odps.get_table(table)
            
            if not table_obj.schema.partitions:
                return []
            
            partitions = []
            for partition in table_obj.partitions:
                partitions.append(partition.name)
            
            return partitions
        except Exception as e:
            raise Exception(f"获取分区列表失败: {str(e)}")
    
    def _close_connection(self):
        """关闭MaxCompute连接"""
        # MaxCompute SDK 不需要显式关闭连接
        self.odps = None
