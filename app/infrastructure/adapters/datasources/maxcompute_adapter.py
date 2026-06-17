"""
MaxCompute 数据源适配器
"""
import re
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
            message = self._format_error(e)
            return {
                'success': False,
                'message': f'连接失败: {message}',
                'details': {'error': message}
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
            raise Exception(self._format_error(e))
    
    def get_table_schema(self, database: str = None, table: str = None) -> Dict[str, Any]:
        """获取MaxCompute表的Schema信息"""
        try:
            odps = self._get_odps_client()
            table_obj = odps.get_table(table)
            
            columns = []
            partition_columns = []
            seen_names: set = set()
            
            for col in table_obj.schema.columns:
                seen_names.add(col.name)
                columns.append({
                    'name': col.name,
                    'type': str(col.type).lower(),
                    'comment': col.comment or '',
                    'is_nullable': True,
                    'is_partition': False,
                    'default_value': None
                })
            
            if table_obj.schema.partitions:
                for col in table_obj.schema.partitions:
                    partition_columns.append(col.name)
                    if col.name in seen_names:
                        for existing in columns:
                            if existing['name'] == col.name:
                                existing['is_partition'] = True
                                break
                        continue
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
            raise Exception(self._format_error(e))
    
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
            raise Exception(f"查询执行失败: {self._format_error(e)}")
    
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
            raise Exception(f"流式查询失败: {self._format_error(e)}")
    
    @staticmethod
    def _safe_value(val):
        """将 PyODPS 原生类型转为 JSON 可序列化的 Python 原生类型。"""
        if val is None:
            return None
        if isinstance(val, (int, float, str, bool)):
            return val
        from datetime import datetime, date
        if isinstance(val, (datetime, date)):
            return val.isoformat()
        if isinstance(val, bytes):
            return val.decode('utf-8', errors='replace')
        try:
            if hasattr(val, 'isoformat'):
                return val.isoformat()
        except Exception:
            pass
        try:
            if hasattr(val, 'item'):
                return val.item()
        except Exception:
            pass
        try:
            return str(val)
        except Exception:
            return None

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
            raise Exception(f"预览数据失败: {self._format_error(e)}")

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
            raise Exception(f"获取分区列表失败: {self._format_error(e)}")
    
    def _close_connection(self):
        """关闭MaxCompute连接"""
        # MaxCompute SDK 不需要显式关闭连接
        self.odps = None

    def _format_error(self, exc: Exception) -> str:
        """将 PyODPS 原始错误转换为面向用户的脱敏提示。"""
        message = str(exc)
        lowered = message.lower()

        if 'accesskeyidnotfound' in lowered or 'accesskeyid not found' in lowered:
            return 'MaxCompute 认证失败：AccessKey ID 不存在或无效，请检查数据源凭证后重新测试连接。'
        if (
            'invalidaccesskeysecret' in lowered
            or 'signaturedoesnotmatch' in lowered
            or 'accesskey secret' in lowered
        ):
            return 'MaxCompute 认证失败：AccessKey Secret 无效，请检查数据源凭证后重新测试连接。'
        if 'invalid credentials' in lowered:
            return 'MaxCompute 认证失败：凭证无效，请检查数据源 AccessKey 配置后重新测试连接。'
        if 'forbidden' in lowered or 'permission' in lowered or 'privilege' in lowered:
            return 'MaxCompute 权限不足：当前账号无法访问目标项目或表，请检查授权。'
        if 'timeout' in lowered or 'timed out' in lowered or 'read timed out' in lowered:
            return 'MaxCompute 请求超时：请检查网络、Endpoint 或稍后重试。'

        return f"MaxCompute 请求失败：{self._sanitize_error_message(message)}"

    def _sanitize_error_message(self, message: str) -> str:
        """移除云侧错误中可能出现的凭证、Secret 和 RequestId。"""
        sanitized = message
        for key in ('access_id', 'access_key', 'secret_access_key'):
            value = self.config.get(key)
            if isinstance(value, str) and value:
                sanitized = sanitized.replace(value, '***')

        patterns = [
            (r'accessKeyId\s+not\s+found\s*:\s*[A-Za-z0-9_\-]+', 'accessKeyId not found: ***'),
            (r'(accessKeyId|access_key|access-id|accessId)\s*[:=]\s*[A-Za-z0-9_\-]+', r'\1: ***'),
            (r'(accessKeySecret|secret_access_key|accessSecret)\s*[:=]\s*[^,\s;]+', r'\1: ***'),
            (r'RequestId\s*:\s*[A-Za-z0-9_\-]+', 'RequestId: ***'),
        ]
        for pattern, replacement in patterns:
            sanitized = re.sub(pattern, replacement, sanitized, flags=re.IGNORECASE)

        return sanitized
