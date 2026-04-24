"""
查询仓储实现
"""
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from app.shared.utils.time import utcnow
from sqlalchemy import or_, and_, func
from sqlalchemy.orm import Session
from app.domain.ports.repositories.query_repository import QueryRepository as QueryRepositoryInterface
from app.domain.entities.query import Query
from app.domain.entities.query_folder import QueryFolder
from app.domain.entities.query_history import QueryHistory


class QueryRepository(QueryRepositoryInterface):
    """查询仓储实现"""
    
    def __init__(self, session: Session):
        self.session = session
    
    def save(self, query: Query) -> Query:
        """保存查询"""
        self.session.add(query)
        self.session.commit()
        self.session.refresh(query)
        return query
    
    def find_by_id(self, query_id: int) -> Optional[Query]:
        """根据ID查找查询"""
        return self.session.query(Query).filter_by(id=query_id, is_deleted=False).first()
    
    def find_by_code(self, query_code: str) -> Optional[Query]:
        """根据code查找查询"""
        return self.session.query(Query).filter_by(query_code=query_code, is_deleted=False).first()
    
    def list_queries(self, page: int, page_size: int, filters: Dict[str, Any]) -> Dict[str, Any]:
        """查询列表"""
        query = self.session.query(Query).filter_by(is_deleted=False)
        
        if filters.get('folder_id'):
            query = query.filter_by(folder_id=filters['folder_id'])
        
        if filters.get('is_favorite') is not None:
            query = query.filter_by(is_favorite=filters['is_favorite'])
        
        if filters.get('created_by'):
            query = query.filter_by(created_by=filters['created_by'])
        
        if filters.get('search'):
            search_term = f"%{filters['search']}%"
            query = query.filter(
                or_(
                    Query.query_name.ilike(search_term),
                    Query.sql_query.ilike(search_term),
                    Query.description.ilike(search_term)
                )
            )
        
        total = query.count()
        offset = (page - 1) * page_size
        items = query.order_by(Query.updated_at.desc()).offset(offset).limit(page_size).all()
        
        return {
            'items': items,
            'total': total,
            'page': page,
            'page_size': page_size,
            'total_pages': (total + page_size - 1) // page_size
        }
    
    def delete(self, query_id: int) -> bool:
        """删除查询（软删除）"""
        query = self.find_by_id(query_id)
        if query:
            query.soft_delete()
            self.session.commit()
            return True
        return False
    
    def save_folder(self, folder: QueryFolder) -> QueryFolder:
        """保存文件夹"""
        self.session.add(folder)
        self.session.commit()
        self.session.refresh(folder)
        return folder
    
    def list_folders(self, created_by: Optional[str] = None) -> List[QueryFolder]:
        """文件夹列表"""
        query = self.session.query(QueryFolder)
        if created_by:
            query = query.filter_by(created_by=created_by)
        return query.order_by(QueryFolder.created_at.desc()).all()
    
    def save_history(self, history: QueryHistory) -> QueryHistory:
        """保存历史记录"""
        self.session.add(history)
        self.session.commit()
        self.session.refresh(history)
        return history

    def get_history_by_id(self, history_id: int) -> Optional[QueryHistory]:
        """按主键获取查询历史（C-1：支持前端 /queries/histories/:id）"""
        return self.session.query(QueryHistory).filter_by(id=history_id).first()
    
    def list_histories(self, page: int, page_size: int, filters: Dict[str, Any]) -> Dict[str, Any]:
        """历史列表"""
        query = self.session.query(QueryHistory)
        
        if filters.get('query_id'):
            query = query.filter_by(query_id=filters['query_id'])
        
        if filters.get('source_id'):
            query = query.filter_by(source_id=filters['source_id'])
        
        if filters.get('status'):
            query = query.filter_by(status=filters['status'])
        
        if filters.get('executed_by'):
            query = query.filter_by(executed_by=filters['executed_by'])
        
        if filters.get('date_from'):
            try:
                date_from = datetime.fromisoformat(filters['date_from'])
                query = query.filter(QueryHistory.executed_at >= date_from)
            except ValueError:
                pass
        
        if filters.get('date_to'):
            try:
                date_to = datetime.fromisoformat(filters['date_to'])
                query = query.filter(QueryHistory.executed_at <= date_to)
            except ValueError:
                pass
        
        total = query.count()
        offset = (page - 1) * page_size
        items = query.order_by(QueryHistory.executed_at.desc()).offset(offset).limit(page_size).all()
        
        return {
            'items': items,
            'total': total,
            'page': page,
            'page_size': page_size,
            'total_pages': (total + page_size - 1) // page_size
        }
    
    def get_statistics(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        """获取统计数据"""
        week_ago = utcnow() - timedelta(days=7)
        query_count_week = self.session.query(func.count(QueryHistory.id)).filter(
            QueryHistory.executed_at >= week_ago
        )
        if user_id:
            query_count_week = query_count_week.filter(QueryHistory.executed_by == user_id)
        
        saved_queries_query = self.session.query(func.count(Query.id)).filter_by(is_deleted=False)
        if user_id:
            saved_queries_query = saved_queries_query.filter_by(created_by=user_id)
        
        avg_time_query = self.session.query(func.avg(QueryHistory.execution_time_ms)).filter(
            QueryHistory.status == 'success',
            QueryHistory.executed_at >= week_ago
        )
        if user_id:
            avg_time_query = avg_time_query.filter(QueryHistory.executed_by == user_id)
        
        return {
            'query_count_week': query_count_week.scalar() or 0,
            'saved_queries_count': saved_queries_query.scalar() or 0,
            'avg_execution_time_ms': int(avg_time_query.scalar() or 0)
        }
