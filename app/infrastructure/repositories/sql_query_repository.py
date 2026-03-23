"""
SQL 查询任务仓储实现
"""
from typing import Optional
from sqlalchemy.orm import Session

from app.domain.entities.sql_query import SQLQuery
from app.domain.ports.repositories.sql_query_repository_port import ISQLQueryRepository


class SQLQueryRepository(ISQLQueryRepository):
    """SQL 查询任务仓储"""
    
    def __init__(self, session: Session):
        self.session = session
    
    def save(self, query: SQLQuery) -> SQLQuery:
        """保存查询记录"""
        self.session.add(query)
        self.session.commit()
        self.session.refresh(query)
        return query
    
    def find_by_id(self, query_id: int) -> Optional[SQLQuery]:
        """根据 ID 查找查询记录"""
        return self.session.query(SQLQuery).filter_by(id=query_id).first()
    
    def commit(self) -> None:
        """提交当前事务"""
        self.session.commit()
