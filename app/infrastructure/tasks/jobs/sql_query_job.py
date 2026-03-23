"""
SQL 查询异步任务（RQ Job）
用于支持大数据引擎的长时间查询
"""

import time
import traceback
from rq import get_current_job
from app.infrastructure.database.session import get_db_session
from app.domain.entities.sql_query import SQLQuery, SQLQueryStatus
from app.domain.entities.data_source import DataSource
from app.infrastructure.adapters.datasources.factory import AdapterFactory
from app.domain.services.field_identifier import FieldIdentifier
from app.shared.utils.logger import get_logger
from app.shared.utils.sql_validator import validate_sql_query

logger = get_logger(__name__)


def execute_sql_query_job(query_id: int):
    """
    执行 SQL 查询任务（RQ 异步任务）
    
    执行流程：
    1. 加载查询记录
    2. 获取数据源适配器
    3. 执行 SQL 查询
    4. 进行字段识别
    5. 保存结果到数据库
    
    Args:
        query_id: SQL 查询记录 ID
    
    Returns:
        执行结果字典
    
    Raises:
        Exception: 任何执行失败都会抛出异常
    """
    current_job = get_current_job()
    session = get_db_session()
    
    logger.info(
        f"Starting SQL query job",
        query_id=query_id,
        job_id=current_job.id if current_job else None
    )
    
    query = None
    
    try:
        # 1. 加载查询记录
        query = session.query(SQLQuery).filter_by(id=query_id).first()
        if not query:
            raise ValueError(f"SQLQuery {query_id} not found")
        
        # 检查状态是否为 pending（避免重复执行）
        if query.status != SQLQueryStatus.PENDING:
            logger.warning(f"SQLQuery {query_id} is not pending, skipping. Current status: {query.status}")
            return {'status': 'skipped', 'reason': f'Query status is {query.status}'}
        
        # 获取数据源
        datasource = session.query(DataSource).filter_by(id=query.source_id).first()
        if not datasource:
            raise ValueError(f"DataSource {query.source_id} not found")
        
        # 标记为运行中
        query.start()
        session.commit()
        
        # 2. SQL 安全性验证
        is_valid, errors = validate_sql_query(query.sql)
        if not is_valid:
            raise ValueError(f"SQL 校验失败: {'; '.join(errors)}")
        
        # 3. 获取适配器
        adapter = AdapterFactory.create_adapter(
            datasource.source_type,
            datasource.connection_config
        )
        
        # 4. 准备 SQL（使用子查询包裹 + 外层 LIMIT 保护）
        sql_to_execute = _prepare_sql(query.sql, query.limit_rows)
        
        # 5. 执行查询
        start_time = time.time()
        
        query_result = adapter.execute_query(sql_to_execute)
        
        execution_time_ms = int((time.time() - start_time) * 1000)
        
        # 6. 统一处理 rows 和 data 格式
        columns_metadata = query_result.get('columns', [])
        data = query_result.get('data')
        if data is None:
            data = _convert_rows_to_data(query_result.get('rows', []), columns_metadata)
        
        # 7. 调用 FieldIdentifier 进行字段识别
        fields_to_identify = []
        for col in columns_metadata:
            if isinstance(col, dict):
                fields_to_identify.append({
                    'name': col.get('name', ''),
                    'type': col.get('type', 'UNKNOWN'),
                    'comment': '',
                    'is_partition': False
                })
            else:
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
        
        # 9. 构建结果
        result = {
            'columns': column_names,
            'data': data,
            'fields': identified_fields,
            'statistics': statistics,
            'row_count': len(data),
            'execution_time_ms': execution_time_ms
        }
        
        # 10. 更新查询记录（成功）
        query.mark_as_completed(result, len(data), execution_time_ms)
        session.commit()
        
        logger.info(
            f"SQL query job completed successfully",
            query_id=query_id,
            row_count=len(data),
            execution_time_ms=execution_time_ms
        )
        
        return {
            'status': 'success',
            'query_id': query_id,
            'row_count': len(data),
            'execution_time_ms': execution_time_ms
        }
    
    except Exception as e:
        logger.error(
            f"SQL query job failed",
            query_id=query_id,
            error=str(e),
            exc_info=True
        )
        
        # 更新查询记录（失败）
        if query:
            query.mark_as_failed(str(e), traceback.format_exc())
            session.commit()
        
        # 不再抛出异常（避免 RQ 重试，因为 SQL 查询失败通常不需要重试）
        return {
            'status': 'failed',
            'query_id': query_id,
            'error': str(e)
        }
    
    finally:
        session.close()


def _prepare_sql(sql: str, limit: int) -> str:
    """
    准备 SQL（添加安全保护）
    
    使用子查询包裹用户 SQL，外层添加 LIMIT
    
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


def _convert_rows_to_data(rows: list, columns: list) -> list:
    """
    将 rows 格式（list of list）转换为 data 格式（list of dict）
    兼容 ClickHouse/MaxCompute 的返回格式
    
    Args:
        rows: 行数据，格式为 [[val1, val2, ...], ...]
        columns: 列信息
        
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
