"""
异步 SQL 查询 Handlers

封装 sql_lab 路由中的 db.session 操作，遵循六边形架构
"""
from typing import Optional, Dict, Any

from app.domain.entities.sql_query import SQLQuery, SQLQueryStatus
from app.infrastructure.repositories.sql_query_repository import SQLQueryRepository
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class SubmitAsyncQueryHandler:
    """提交异步查询"""
    
    def __init__(self, sql_query_repository: SQLQueryRepository):
        self.sql_query_repository = sql_query_repository
    
    def handle(
        self,
        source_id: int,
        sql: str,
        limit: int,
        user_id: Optional[str] = None
    ) -> SQLQuery:
        """
        创建异步查询记录
        
        Args:
            source_id: 数据源 ID
            sql: SQL 语句
            limit: 行数限制
            user_id: 用户 ID
        
        Returns:
            创建的 SQLQuery 实体
        """
        query = SQLQuery(
            source_id=source_id,
            sql=sql,
            limit_rows=limit,
            status=SQLQueryStatus.PENDING,
            created_by=user_id
        )
        return self.sql_query_repository.save(query)
    
    def update_job_id(self, query: SQLQuery, job_id: str) -> None:
        """更新查询的 job_id"""
        query.job_id = job_id
        self.sql_query_repository.commit()
    
    def mark_failed(self, query: SQLQuery, error_msg: str) -> None:
        """标记查询失败"""
        query.mark_as_failed(error_msg)
        self.sql_query_repository.commit()


class GetQueryStatusHandler:
    """获取查询状态"""
    
    def __init__(self, sql_query_repository: SQLQueryRepository):
        self.sql_query_repository = sql_query_repository
    
    def handle(self, query_id: int) -> Optional[Dict[str, Any]]:
        """
        获取查询状态
        
        Args:
            query_id: 查询 ID
        
        Returns:
            状态字典，或 None（不存在）
        """
        query = self.sql_query_repository.find_by_id(query_id)
        if not query:
            return None
        return query.to_status_dict()


class GetQueryResultHandler:
    """获取查询结果"""
    
    def __init__(self, sql_query_repository: SQLQueryRepository):
        self.sql_query_repository = sql_query_repository
    
    def handle(self, query_id: int) -> Optional[SQLQuery]:
        """
        获取查询实体（包含结果）
        
        Args:
            query_id: 查询 ID
        
        Returns:
            SQLQuery 实体，或 None
        """
        return self.sql_query_repository.find_by_id(query_id)
