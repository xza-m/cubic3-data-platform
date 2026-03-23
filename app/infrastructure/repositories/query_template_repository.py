"""
查询模板仓储实现
"""
from typing import Optional, List, Dict, Any
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.domain.entities.query_template import QueryTemplate
from app.domain.ports.repositories.query_template_repository_port import IQueryTemplateRepository


class QueryTemplateRepository(IQueryTemplateRepository):
    """查询模板仓储"""
    
    def __init__(self, session: Session):
        self.session = session
    
    def save(self, template: QueryTemplate) -> QueryTemplate:
        """保存模板（创建或更新）"""
        self.session.add(template)
        self.session.commit()
        self.session.refresh(template)
        return template
    
    def find_by_id(self, template_id: int) -> Optional[QueryTemplate]:
        """根据 ID 查找模板"""
        return self.session.query(QueryTemplate).filter_by(id=template_id).first()
    
    def find_all(
        self,
        page: int = 1,
        per_page: int = 20,
        category: Optional[str] = None,
        search: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        分页查询模板列表
        
        Returns:
            包含 items / total 的字典
        """
        query = self.session.query(QueryTemplate)
        
        if category:
            query = query.filter_by(category=category)
        
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    QueryTemplate.template_name.ilike(search_term),
                    QueryTemplate.template_description.ilike(search_term)
                )
            )
        
        total = query.count()
        offset = (page - 1) * per_page
        templates = query.order_by(QueryTemplate.use_count.desc()).offset(offset).limit(per_page).all()
        
        return {
            'items': templates,
            'total': total
        }
    
    def delete(self, template: QueryTemplate) -> None:
        """删除模板"""
        self.session.delete(template)
        self.session.commit()
    
    def commit(self) -> None:
        """提交当前事务"""
        self.session.commit()
