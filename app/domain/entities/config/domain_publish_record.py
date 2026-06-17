"""
语义域发布记录实体（兼容入口）

B5 增量重构：ORM 模型已迁至 ``app/infrastructure/models/domain_publish_record.py``。
本模块仅保留旧导入路径；新代码请从 infrastructure 层导入。
"""
from app.infrastructure.models.domain_publish_record import DomainPublishRecord

__all__ = ['DomainPublishRecord']
