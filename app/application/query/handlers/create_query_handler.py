"""
创建查询Handler
"""
import uuid
from app.application.query.commands.create_query import CreateQueryCommand
from app.domain.ports.repositories.query_repository import QueryRepository
from app.domain.entities.query import Query
from app.shared.exceptions import ValidationError


class CreateQueryHandler:
    """创建查询Handler"""
    
    def __init__(self, query_repository: QueryRepository):
        self.query_repository = query_repository
    
    def handle(self, command: CreateQueryCommand) -> Query:
        """创建查询"""
        # 生成query_code（如果未提供）
        if not command.query_code:
            command.query_code = f"query_{uuid.uuid4().hex[:12]}"
        
        # 检查query_code是否已存在
        existing = self.query_repository.find_by_code(command.query_code)
        if existing:
            raise ValidationError(f"查询编码已存在: {command.query_code}")
        
        # 创建查询实体
        query = Query(
            query_code=command.query_code,
            query_name=command.query_name,
            source_id=command.source_id,
            sql_query=command.sql_query,
            description=command.description,
            folder_id=command.folder_id,
            tags=command.tags or [],
            is_favorite=command.is_favorite,
            created_by=command.created_by
        )
        
        # 保存
        return self.query_repository.save(query)
