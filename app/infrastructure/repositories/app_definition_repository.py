"""
应用定义仓储实现（SQLAlchemy ORM）
"""
from typing import Optional, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.domain.entities import AppDefinition
from app.domain.ports.repositories.app_definition_repository_port import IAppDefinitionRepository


class AppDefinitionRepository(IAppDefinitionRepository):
    """
    应用定义仓储实现
    
    使用 SQLAlchemy ORM 进行持久化
    """
    
    def __init__(self, session: Session):
        """
        初始化
        
        Args:
            session: SQLAlchemy Session
        """
        self.session = session
    
    def find_all(
        self,
        category: Optional[str] = None,
        enabled_only: bool = True
    ) -> List[AppDefinition]:
        """
        查找所有应用定义
        
        Args:
            category: 分类筛选
            enabled_only: 仅返回启用的应用
        
        Returns:
            应用定义列表
        """
        query = self.session.query(AppDefinition)
        
        if enabled_only:
            query = query.filter_by(enabled=True)
        
        if category:
            query = query.filter_by(category=category)
        
        query = query.order_by(AppDefinition.category, AppDefinition.name)
        
        return query.all()
    
    def find_by_code(self, code: str) -> Optional[AppDefinition]:
        """
        根据应用代码查找应用定义
        
        Args:
            code: 应用代码
        
        Returns:
            应用定义实体或None
        """
        return self.session.query(AppDefinition).filter_by(code=code).first()
    
    def save(self, definition: AppDefinition) -> AppDefinition:
        self.session.add(definition)
        self.session.commit()
        self.session.refresh(definition)
        return definition

    def find_by_id(self, id: int) -> Optional[AppDefinition]:
        return self.session.query(AppDefinition).filter_by(id=id).first()

    def delete(self, definition: AppDefinition) -> None:
        self.session.delete(definition)
        self.session.commit()

    def commit(self) -> None:
        self.session.commit()

    def get_categories_with_count(self) -> List[Tuple]:
        """获取所有启用应用的分类及计数"""
        return self.session.query(
            AppDefinition.category,
            func.count(AppDefinition.id).label('app_count')
        ).filter_by(
            enabled=True
        ).group_by(
            AppDefinition.category
        ).all()
