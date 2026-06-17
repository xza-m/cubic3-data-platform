"""
数据源 ORM 模型（infrastructure 层）

列定义与持久化映射在此；业务行为见
``app/domain/entities/datasource_behavior.DataSourceBehavior``。
"""
from typing import List

from sqlalchemy import Column, BigInteger, Integer, String, Boolean, DateTime, Text
from sqlalchemy.orm import relationship

from app.domain.entities.datasource_behavior import DataSourceBehavior
from app.extensions import db
from app.shared.db_types import JsonType
from app.shared.enums import ConnectionStatus
from app.shared.utils.time import utcnow


class DataSource(DataSourceBehavior, db.Model):
    """数据源 ORM 模型 + 领域行为"""

    __tablename__ = 'data_sources'
    __table_args__ = {'extend_existing': True}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._domain_events: List = []

    id = Column(BigInteger().with_variant(Integer, 'sqlite'), primary_key=True)
    name = Column(String(100), unique=True, nullable=False)
    source_type = Column(String(20), nullable=False)
    description = Column(Text)

    # 连接配置
    connection_config = Column(JsonType, nullable=False)
    extra_config = Column(JsonType, default=dict)

    # 状态管理
    is_active = Column(Boolean, default=True)
    connection_status = Column(String(20), default=ConnectionStatus.UNKNOWN.value)
    last_test_at = Column(DateTime)
    last_test_error = Column(Text)

    # 审计字段
    created_by = Column(String(191))
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    # 关系
    datasets = relationship('Dataset', back_populates='source', cascade='all, delete-orphan')


# 向后兼容旧命名
Datasource = DataSource
