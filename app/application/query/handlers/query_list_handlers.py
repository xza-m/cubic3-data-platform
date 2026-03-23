"""
查询列表 / 详情 / 收藏 / 文件夹 / 历史 / 统计 Handlers

将 queries.py 中直接调用 repository 的逻辑抽取到 Handler 层
"""
from typing import Optional, Dict, Any
from app.domain.ports.repositories.query_repository import QueryRepository
from app.domain.entities.query_folder import QueryFolder
from app.shared.exceptions import EntityNotFoundError
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


# ============================================================================
# 查询列表 / 详情
# ============================================================================

class ListQueriesHandler:
    """查询列表"""

    def __init__(self, query_repository: QueryRepository):
        self.query_repository = query_repository

    def handle(self, page: int, page_size: int,
               folder_id: Optional[int] = None,
               is_favorite: Optional[bool] = None,
               search: Optional[str] = None,
               created_by: Optional[str] = None) -> Dict[str, Any]:
        """查询列表，返回分页字典"""
        result = self.query_repository.list_queries(
            page=page,
            page_size=page_size,
            filters={
                'folder_id': folder_id,
                'is_favorite': is_favorite,
                'search': search,
                'created_by': created_by
            }
        )

        return {
            'items': [
                {
                    'id': q.id,
                    'query_code': q.query_code,
                    'query_name': q.query_name,
                    'source_id': q.source_id,
                    'sql_query': q.sql_query[:200] + '...' if len(q.sql_query) > 200 else q.sql_query,
                    'folder_id': q.folder_id,
                    'tags': q.tags,
                    'description': q.description,
                    'is_favorite': q.is_favorite,
                    'execute_count': q.execute_count,
                    'last_executed_at': q.last_executed_at.isoformat() if q.last_executed_at else None,
                    'created_by': q.created_by,
                    'created_at': q.created_at.isoformat(),
                    'updated_at': q.updated_at.isoformat() if q.updated_at else None
                }
                for q in result['items']
            ],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
            'total_pages': result['total_pages']
        }


class GetQueryHandler:
    """获取查询详情"""

    def __init__(self, query_repository: QueryRepository):
        self.query_repository = query_repository

    def handle(self, query_id: int) -> Dict[str, Any]:
        """
        获取查询详情

        Raises:
            EntityNotFoundError: 查询不存在
        """
        query = self.query_repository.find_by_id(query_id)
        if not query:
            raise EntityNotFoundError(f'查询不存在: {query_id}')

        return {
            'id': query.id,
            'query_code': query.query_code,
            'query_name': query.query_name,
            'source_id': query.source_id,
            'sql_query': query.sql_query,
            'folder_id': query.folder_id,
            'tags': query.tags,
            'description': query.description,
            'is_favorite': query.is_favorite,
            'execute_count': query.execute_count,
            'last_executed_at': query.last_executed_at.isoformat() if query.last_executed_at else None,
            'created_by': query.created_by,
            'created_at': query.created_at.isoformat(),
            'updated_at': query.updated_at.isoformat() if query.updated_at else None
        }


# ============================================================================
# 收藏切换
# ============================================================================

class ToggleFavoriteHandler:
    """切换收藏状态"""

    def __init__(self, query_repository: QueryRepository):
        self.query_repository = query_repository

    def handle(self, query_id: int) -> Dict[str, Any]:
        """
        切换收藏状态

        Raises:
            EntityNotFoundError: 查询不存在
        """
        query = self.query_repository.find_by_id(query_id)
        if not query:
            raise EntityNotFoundError(f'查询不存在: {query_id}')

        query.toggle_favorite()
        self.query_repository.save(query)

        return {'is_favorite': query.is_favorite}


# ============================================================================
# 文件夹
# ============================================================================

class ListFoldersHandler:
    """文件夹列表"""

    def __init__(self, query_repository: QueryRepository):
        self.query_repository = query_repository

    def handle(self, created_by: Optional[str] = None):
        """返回文件夹列表（dict list）"""
        folders = self.query_repository.list_folders(created_by=created_by)

        return [
            {
                'id': f.id,
                'folder_name': f.folder_name,
                'parent_id': f.parent_id,
                'created_by': f.created_by,
                'created_at': f.created_at.isoformat()
            }
            for f in folders
        ]


class CreateFolderHandler:
    """创建文件夹"""

    def __init__(self, query_repository: QueryRepository):
        self.query_repository = query_repository

    def handle(self, folder_name: str, created_by: str,
               parent_id: Optional[int] = None) -> Dict[str, Any]:
        """创建文件夹并返回基本信息"""
        folder = QueryFolder(
            folder_name=folder_name,
            parent_id=parent_id,
            created_by=created_by
        )
        folder = self.query_repository.save_folder(folder)

        return {
            'id': folder.id,
            'folder_name': folder.folder_name
        }


# ============================================================================
# 删除查询
# ============================================================================

class DeleteQueryHandler:
    """删除查询"""

    def __init__(self, query_repository: QueryRepository):
        self.query_repository = query_repository

    def handle(self, query_id: int) -> None:
        """
        删除查询（软删除）

        Raises:
            EntityNotFoundError: 查询不存在
        """
        success = self.query_repository.delete(query_id)
        if not success:
            raise EntityNotFoundError(f'查询不存在: {query_id}')


# ============================================================================
# 历史记录
# ============================================================================

class ListHistoriesHandler:
    """查询历史列表"""

    def __init__(self, query_repository: QueryRepository):
        self.query_repository = query_repository

    def handle(self, page: int, page_size: int,
               query_id: Optional[int] = None,
               source_id: Optional[int] = None,
               status: Optional[str] = None,
               executed_by: Optional[str] = None,
               date_from: Optional[str] = None,
               date_to: Optional[str] = None) -> Dict[str, Any]:
        """查询历史列表，返回分页字典"""
        result = self.query_repository.list_histories(
            page=page,
            page_size=page_size,
            filters={
                'query_id': query_id,
                'source_id': source_id,
                'status': status,
                'executed_by': executed_by,
                'date_from': date_from,
                'date_to': date_to
            }
        )

        return {
            'items': [
                {
                    'id': h.id,
                    'query_id': h.query_id,
                    'source_id': h.source_id,
                    'sql_query': h.sql_query[:200] + '...' if len(h.sql_query) > 200 else h.sql_query,
                    'status': h.status,
                    'result_rows': h.result_rows,
                    'execution_time_ms': h.execution_time_ms,
                    'error_message': h.error_message,
                    'executed_by': h.executed_by,
                    'executed_at': h.executed_at.isoformat()
                }
                for h in result['items']
            ],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
            'total_pages': result['total_pages']
        }


# ============================================================================
# 统计数据
# ============================================================================

class GetStatisticsHandler:
    """获取统计数据"""

    def __init__(self, query_repository: QueryRepository):
        self.query_repository = query_repository

    def handle(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        """获取查询统计数据"""
        return self.query_repository.get_statistics(user_id=user_id)
