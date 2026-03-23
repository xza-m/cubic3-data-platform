"""
SQL 预览执行处理器
职责：执行 SQL 查询并返回结果（不记录历史，用于临时预览）
"""
import time
from typing import Dict, Any, List

from app.application.query.commands.execute_sql_preview import ExecuteSQLPreviewCommand
from app.domain.ports.repositories.datasource_repository import IDatasourceRepository
from app.infrastructure.adapters.datasources.factory import AdapterFactory
from app.shared.exceptions import ApplicationException, ValidationError
from app.shared.utils.sql_validator import validate_sql_query
from app.shared.utils.logger import get_logger
from app.domain.services.field_identifier import FieldIdentifier

logger = get_logger(__name__)


class ExecuteSQLPreviewHandler:
    """SQL 预览执行处理器"""
    
    def __init__(self, datasource_repository: IDatasourceRepository):
        self.datasource_repository = datasource_repository
    
    def handle(self, command: ExecuteSQLPreviewCommand) -> Dict[str, Any]:
        """
        执行 SQL 预览
        
        Args:
            command: SQL 预览命令
            
        Returns:
            查询结果字典
        """
        # 1. 获取数据源
        datasource = self.datasource_repository.find_by_id(command.source_id)
        if not datasource:
            raise ApplicationException(f"数据源不存在: {command.source_id}")
        
        # 2. SQL 安全性验证
        self._validate_sql(command.sql_query)
        
        # 3. 获取适配器
        adapter = AdapterFactory.create_adapter(
            datasource.source_type,
            datasource.connection_config
        )
        
        # 4. 准备 SQL（使用子查询包裹 + 外层 LIMIT 保护）
        sql_to_execute = self._prepare_sql(command.sql_query, command.limit)
        
        # 5. 执行查询
        start_time = time.time()
        try:
            result = adapter.execute_query(sql_to_execute)
            execution_time_ms = int((time.time() - start_time) * 1000)
            
            # 6. 统一处理 rows 和 data 格式
            # ClickHouse/MaxCompute 返回 'rows'，MySQL/PostgreSQL 返回 'data'
            columns_metadata = result.get('columns', [])
            data = result.get('data')
            if data is None:
                # 转换 rows 格式为 data 格式
                data = self._convert_rows_to_data(result.get('rows', []), columns_metadata)
            
            # 7. 调用 FieldIdentifier 进行字段识别
            fields_to_identify = []
            for col in columns_metadata:
                if isinstance(col, dict):
                    fields_to_identify.append({
                        'name': col.get('name', ''),
                        'type': col.get('type', 'UNKNOWN'),
                        'comment': '',  # SQL 查询结果无 comment
                        'is_partition': False
                    })
                else:
                    # 兼容仅字符串列名的情况
                    fields_to_identify.append({
                        'name': str(col),
                        'type': 'UNKNOWN',
                        'comment': '',
                        'is_partition': False
                    })
            
            identified_fields = FieldIdentifier.identify_fields_batch(fields_to_identify)
            statistics = FieldIdentifier.get_statistics(identified_fields)
            
            # 8. 提取列名用于兼容前端
            column_names = []
            for col in columns_metadata:
                if isinstance(col, dict):
                    column_names.append(col.get('name', ''))
                else:
                    column_names.append(str(col))
            
            logger.info(
                f"SQL preview executed successfully",
                extra={
                    'source_id': command.source_id,
                    'row_count': len(data),
                    'execution_time_ms': execution_time_ms,
                    'identified_fields_count': len(identified_fields)
                }
            )
            
            return {
                'columns': column_names,
                'data': data,
                'fields': identified_fields,  # 统一字段名为 fields（与物理表一致）
                'statistics': statistics,
                'row_count': len(data),
                'execution_time_ms': execution_time_ms
            }
            
        except Exception as e:
            execution_time_ms = int((time.time() - start_time) * 1000)
            logger.error(
                f"SQL preview failed: {str(e)}",
                extra={
                    'source_id': command.source_id,
                    'execution_time_ms': execution_time_ms
                }
            )
            raise ApplicationException(f"SQL 执行失败: {str(e)}")
    
    def _validate_sql(self, sql: str):
        """
        验证 SQL 安全性
        
        Args:
            sql: SQL 查询语句
            
        Raises:
            ValidationError: SQL 不安全时抛出
        """
        is_valid, errors = validate_sql_query(sql)
        if not is_valid:
            raise ValidationError(f"SQL 校验失败: {'; '.join(errors)}")
    
    def _prepare_sql(self, sql: str, limit: int) -> str:
        """
        准备 SQL（添加安全保护）
        
        使用子查询包裹用户 SQL，外层添加 LIMIT
        这样用户的 LIMIT（业务逻辑）和系统 LIMIT（安全保护）都生效
        
        Args:
            sql: 原始 SQL
            limit: 行数限制
            
        Returns:
            处理后的 SQL
        """
        # 清理 SQL：去除尾部分号
        cleaned_sql = sql.strip()
        if cleaned_sql.endswith(';'):
            cleaned_sql = cleaned_sql[:-1].rstrip()
        
        # 使用子查询包裹
        return f"SELECT * FROM (\n{cleaned_sql}\n) AS preview_query LIMIT {limit}"
    
    @staticmethod
    def _convert_rows_to_data(rows: List[List], columns: List) -> List[Dict]:
        """
        将 rows 格式（list of list）转换为 data 格式（list of dict）
        兼容 ClickHouse/MaxCompute 的返回格式
        
        Args:
            rows: 行数据，格式为 [[val1, val2, ...], ...]
            columns: 列信息，可能是 [{'name': 'col1', 'type': 'bigint'}, ...] 或 ['col1', 'col2', ...]
            
        Returns:
            字典列表，格式为 [{'col1': val1, 'col2': val2, ...}, ...]
        """
        if not rows or not columns:
            return []
        
        # 提取列名
        column_names = []
        for col in columns:
            if isinstance(col, dict):
                column_names.append(col.get('name', ''))
            else:
                column_names.append(str(col))
        
        # 转换为字典格式
        return [dict(zip(column_names, row)) for row in rows]
