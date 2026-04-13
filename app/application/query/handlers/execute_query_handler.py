"""
执行查询Handler
"""
import time
from typing import Dict, Any, List
from app.application.query.commands.execute_query import ExecuteQueryCommand
from app.domain.ports.repositories.query_repository import QueryRepository
from app.infrastructure.repositories.datasource_repository import DatasourceRepository
from app.infrastructure.adapters.datasources.factory import AdapterFactory
from app.domain.entities.query_history import QueryHistory
from app.shared.exceptions import ValidationError, ApplicationException
from app.shared.utils.sql_validator import validate_sql_query as validate_sql_safety


class ExecuteQueryHandler:
    """执行查询Handler"""
    
    def __init__(
        self,
        query_repository: QueryRepository,
        datasource_repository: DatasourceRepository
    ):
        self.query_repository = query_repository
        self.datasource_repository = datasource_repository
    
    def handle(self, command: ExecuteQueryCommand) -> Dict[str, Any]:
        """执行查询"""
        # 1. 获取数据源
        datasource = self.datasource_repository.find_by_id(command.source_id)
        if not datasource:
            raise ApplicationException(f"数据源不存在: {command.source_id}")
        
        # 2. SQL 验证
        self._validate_sql(command.sql_query)
        
        # 3. 获取适配器
        adapter = AdapterFactory.create_adapter(
            datasource.source_type,
            datasource.connection_config
        )
        
        # 4. 添加 LIMIT 子句（如果SQL中没有）
        sql_with_limit = self._add_limit_if_needed(command.sql_query, command.limit)
        
        # 5. 执行查询
        start_time = time.time()
        status = 'success'
        error_message = None
        result = None
        
        try:
            result = adapter.execute_query(sql_with_limit, limit=command.limit)
            execution_time_ms = int((time.time() - start_time) * 1000)
            normalized_result = self._normalize_result_payload(result)
            
            # 6. 记录历史
            self._save_history(
                command=command,
                result=normalized_result,
                execution_time_ms=execution_time_ms,
                status='success'
            )
            
            # 7. 更新查询统计（如果是保存的查询）
            if command.query_id:
                self._update_query_stats(command.query_id)
            
            return {
                'columns': normalized_result.get('columns', []),
                'data': normalized_result.get('data', []),
                'row_count': normalized_result.get('row_count', 0),
                'execution_time_ms': execution_time_ms,
                'status': 'success'
            }
            
        except Exception as e:
            execution_time_ms = int((time.time() - start_time) * 1000)
            error_message = str(e)
            status = 'failed'
            
            # 记录失败历史
            self._save_history(
                command=command,
                result=None,
                execution_time_ms=execution_time_ms,
                status='failed',
                error_message=error_message
            )
            
            raise ApplicationException(f"SQL 执行失败: {error_message}")
    
    def _validate_sql(self, sql: str):
        """验证SQL安全性（使用 sqlparse）"""
        is_valid, errors = validate_sql_safety(sql)
        if not is_valid:
            raise ValidationError(f"SQL 校验失败: {'; '.join(errors)}")
    
    def _add_limit_if_needed(self, sql: str, limit: int) -> str:
        """添加LIMIT子句（如果需要）"""
        sql_upper = sql.upper()
        if 'LIMIT' not in sql_upper:
            return f"{sql.rstrip(';')} LIMIT {limit}"
        return sql
    
    def _save_history(
        self,
        command: ExecuteQueryCommand,
        result: Any,
        execution_time_ms: int,
        status: str,
        error_message: str = None
    ):
        """保存历史记录"""
        history = QueryHistory(
            query_id=command.query_id,
            source_id=command.source_id,
            sql_query=command.sql_query,
            status=status,
            result_rows=result.get('row_count', 0) if result else 0,
            execution_time_ms=execution_time_ms,
            error_message=error_message,
            executed_by=command.executed_by
        )
        self.query_repository.save_history(history)
    
    def _update_query_stats(self, query_id: int):
        """更新查询统计"""
        query = self.query_repository.find_by_id(query_id)
        if query:
            query.mark_executed()
            self.query_repository.save(query)

    def _normalize_result_payload(self, result: Dict[str, Any]) -> Dict[str, Any]:
        """统一适配器返回结构，兼容 data/rows 两种结果格式。"""
        columns = result.get('columns', [])
        data = result.get('data')

        if data is None:
            rows = result.get('rows', [])
            data = self._rows_to_records(columns, rows)

        row_count = result.get('row_count')
        if row_count is None:
            row_count = len(data or [])

        return {
            'columns': columns,
            'data': data or [],
            'row_count': row_count,
        }

    def _rows_to_records(self, columns: List[Any], rows: Any) -> List[Dict[str, Any]]:
        """将二维 rows 转换为对象数组，保留原始列定义。"""
        if not isinstance(rows, list):
            return []

        column_names = [self._extract_column_name(column, index) for index, column in enumerate(columns)]
        records: List[Dict[str, Any]] = []

        for row in rows:
            if isinstance(row, dict):
                records.append(row)
                continue

            if not isinstance(row, (list, tuple)):
                continue

            records.append({
                column_name: row[index] if index < len(row) else None
                for index, column_name in enumerate(column_names)
            })

        return records

    def _extract_column_name(self, column: Any, index: int) -> str:
        """从列定义中提取列名。"""
        if isinstance(column, str):
            return column
        if isinstance(column, dict):
            name = column.get('name')
            if name:
                return str(name)
        return f'column_{index + 1}'
