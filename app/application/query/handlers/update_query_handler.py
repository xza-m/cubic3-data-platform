"""
更新查询Handler
"""
from app.application.query.commands.update_query import UpdateQueryCommand
from app.domain.ports.repositories.query_repository import QueryRepository
from app.domain.entities.query import Query
from app.shared.exceptions import EntityNotFoundError


class UpdateQueryHandler:
    """更新查询Handler"""
    
    def __init__(self, query_repository: QueryRepository):
        self.query_repository = query_repository
    
    def handle(self, command: UpdateQueryCommand) -> Query:
        """更新查询"""
        query = self.query_repository.find_by_id(command.query_id)
        if not query:
            raise EntityNotFoundError(f"查询不存在: {command.query_id}")
        
        # 更新字段
        if command.query_name is not None:
            query.query_name = command.query_name
        
        if command.sql_query is not None:
            query.sql_query = command.sql_query
        
        if command.description is not None:
            query.description = command.description
        
        if command.folder_id is not None:
            query.folder_id = command.folder_id
        
        if command.tags is not None:
            query.tags = command.tags
        
        if command.source_id is not None:
            query.source_id = command.source_id
        
        # 保存
        return self.query_repository.save(query)
