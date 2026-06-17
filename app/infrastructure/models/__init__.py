"""
基础设施层 ORM 模型

B5 增量重构示范：领域实体与 ORM 映射分离。
- 领域行为放 ``app/domain/entities/``（纯 Python，不依赖 SQLAlchemy）；
- 持久化列定义放本目录；
- 新实体禁止继承 ``db.Model``（见 CONVENTIONS / AGENTS.md），存量 ORM 实体按需逐步迁移到这里。
"""
from app.infrastructure.models.datasource import DataSource, Datasource
from app.infrastructure.models.domain_publish_record import DomainPublishRecord

__all__ = [
    'DataSource',
    'Datasource',
    'DomainPublishRecord',
]
