"""
查询模板 Handlers
"""
from typing import Optional, Dict, Any, List
from app.domain.entities.query_template import QueryTemplate
from app.infrastructure.repositories.query_template_repository import QueryTemplateRepository
from app.shared.exceptions import EntityNotFoundError, ValidationError
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class ListTemplatesHandler:
    """列表查询模板"""

    def __init__(self, query_template_repository: QueryTemplateRepository):
        self.repo = query_template_repository

    def handle(self, page: int = 1, per_page: int = 20,
               category: Optional[str] = None,
               search: Optional[str] = None) -> Dict[str, Any]:
        """查询模板列表"""
        result = self.repo.find_all(
            page=page, per_page=per_page,
            category=category, search=search
        )
        templates = result['items']
        total = result['total']

        return {
            'items': [
                {
                    'id': t.id,
                    'template_name': t.template_name,
                    'template_description': t.template_description,
                    'sql_template': t.sql_template,
                    'parameters': t.parameters,
                    'category': t.category,
                    'tags': t.tags,
                    'use_count': t.use_count,
                    'created_at': t.created_at.isoformat()
                }
                for t in templates
            ],
            'total': total,
            'page': page,
            'page_size': per_page,
            'total_pages': (total + per_page - 1) // per_page
        }


class CreateTemplateHandler:
    """创建查询模板"""

    def __init__(self, query_template_repository: QueryTemplateRepository):
        self.repo = query_template_repository

    def handle(self, template_name: str, sql_template: str, created_by: str,
               template_description: Optional[str] = None,
               parameters: Optional[List] = None,
               category: Optional[str] = None,
               tags: Optional[List] = None) -> Dict[str, Any]:
        """创建查询模板"""
        if not template_name:
            raise ValidationError('模板名称不能为空')
        if not sql_template:
            raise ValidationError('SQL模板不能为空')

        template = QueryTemplate(
            template_name=template_name,
            template_description=template_description,
            sql_template=sql_template,
            parameters=parameters or [],
            category=category,
            tags=tags or [],
            created_by=created_by
        )

        template = self.repo.save(template)
        logger.info(f"Template created: {template.id}", extra={'user_id': created_by})

        return {
            'id': template.id,
            'template_name': template.template_name
        }


class GetTemplateHandler:
    """获取模板详情"""

    def __init__(self, query_template_repository: QueryTemplateRepository):
        self.repo = query_template_repository

    def handle(self, template_id: int) -> Dict[str, Any]:
        """获取单个模板详情"""
        template = self.repo.find_by_id(template_id)
        if not template:
            raise EntityNotFoundError(f'模板不存在: {template_id}')

        return {
            'id': template.id,
            'template_name': template.template_name,
            'template_description': template.template_description,
            'sql_template': template.sql_template,
            'parameters': template.parameters,
            'category': template.category,
            'tags': template.tags,
            'use_count': template.use_count,
            'created_by': template.created_by,
            'created_at': template.created_at.isoformat()
        }


class UpdateTemplateHandler:
    """更新查询模板"""

    def __init__(self, query_template_repository: QueryTemplateRepository):
        self.repo = query_template_repository

    def handle(self, template_id: int, updated_by: str,
               **fields) -> Dict[str, Any]:
        """更新模板（只修改传入的字段）"""
        template = self.repo.find_by_id(template_id)
        if not template:
            raise EntityNotFoundError(f'模板不存在: {template_id}')

        updatable = ('template_name', 'template_description', 'sql_template',
                     'parameters', 'category', 'tags')
        for key in updatable:
            if key in fields:
                setattr(template, key, fields[key])

        self.repo.commit()
        logger.info(f"Template updated: {template_id}", extra={'user_id': updated_by})

        return {
            'id': template.id,
            'template_name': template.template_name
        }


class DeleteTemplateHandler:
    """删除查询模板"""

    def __init__(self, query_template_repository: QueryTemplateRepository):
        self.repo = query_template_repository

    def handle(self, template_id: int, deleted_by: str) -> None:
        """删除模板"""
        template = self.repo.find_by_id(template_id)
        if not template:
            raise EntityNotFoundError(f'模板不存在: {template_id}')

        template_name = template.template_name
        self.repo.delete(template)
        logger.info(f"Template deleted: {template_id} ({template_name})",
                     extra={'user_id': deleted_by})


class UseTemplateHandler:
    """使用模板（渲染 SQL 并增加使用次数）"""

    def __init__(self, query_template_repository: QueryTemplateRepository):
        self.repo = query_template_repository

    def handle(self, template_id: int,
               params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """渲染模板并增加使用计数"""
        template = self.repo.find_by_id(template_id)
        if not template:
            raise EntityNotFoundError(f'模板不存在: {template_id}')

        # 渲染 SQL
        sql_result = template.sql_template
        for key, value in (params or {}).items():
            sql_result = sql_result.replace(f'{{{{{key}}}}}', str(value))

        # 增加使用次数
        template.increment_use_count()
        self.repo.commit()

        return {
            'sql_query': sql_result,
            'template_name': template.template_name
        }
