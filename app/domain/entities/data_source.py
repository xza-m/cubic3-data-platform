"""
数据源实体（兼容入口）

B5 增量重构示范后本模块只保留旧导入路径：
- 纯领域行为与脱敏工具 → ``app/domain/entities/datasource_behavior.py``
- ORM 列定义 → ``app/infrastructure/models/datasource.py``

新代码请直接从上述模块导入；新实体禁止继承 ``db.Model``（见 CONVENTIONS / AGENTS.md）。
"""
from app.domain.entities.datasource_behavior import (
    DataSourceBehavior,
    is_sensitive_connection_config_key,
    mask_sensitive_config_value,
    normalize_connection_config_key,
)
from app.infrastructure.models.datasource import DataSource, Datasource

__all__ = [
    'DataSource',
    'Datasource',
    'DataSourceBehavior',
    'is_sensitive_connection_config_key',
    'mask_sensitive_config_value',
    'normalize_connection_config_key',
]
