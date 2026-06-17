"""
数据集实体
"""
from datetime import datetime
from app.shared.utils.time import utcnow
from typing import List, Optional
from sqlalchemy import Column, BigInteger, String, Boolean, DateTime, Text, ForeignKey
from app.shared.db_types import JsonType
from sqlalchemy.orm import relationship
from app.extensions import db
from app.shared.enums import DatasetSyncStatus, DatasetType


class Dataset(db.Model):
    """
    数据集实体
    
    职责：
    1. 管理数据集元数据
    2. 关联数据源和字段
    3. 同步状态管理
    4. 记录领域事件
    """
    __tablename__ = 'datasets'
    __table_args__ = {'extend_existing': True}
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._domain_events: List = []
    
    # ========================================================================
    # ORM 字段定义
    # ========================================================================
    
    id = Column(BigInteger, primary_key=True)
    dataset_code = Column(String(100), unique=True, nullable=False)
    dataset_name = Column(String(200), nullable=False)
    
    # 数据集类型
    dataset_type = Column(String(20), default=DatasetType.PHYSICAL.value, nullable=False)
    
    # 数据源关联
    source_id = Column(BigInteger, ForeignKey('data_sources.id', ondelete='CASCADE'))
    physical_table = Column(String(200), nullable=True)  # 虚拟和文件数据集可为空
    
    # SQL 查询（仅虚拟数据集使用）
    sql_query = Column(Text, nullable=True)
    
    # 文件信息（仅文件数据集使用）
    file_metadata = Column(JsonType, nullable=True)
    
    # 元数据
    description = Column(Text)
    owner = Column(String(50))
    
    # 字段元数据（冗余存储）
    schema_snapshot = Column(JsonType)
    partition_fields = Column(JsonType, default=[])
    dimension_fields = Column(JsonType, default=[])
    metric_fields = Column(JsonType, default=[])
    
    # 同步状态
    sync_status = Column(String(20), default=DatasetSyncStatus.SYNCED.value)
    last_sync_at = Column(DateTime)
    sync_error = Column(Text)
    
    # 审计字段
    created_by = Column(String(191))
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    is_deleted = Column(Boolean, default=False)
    
    # 关系
    source = relationship('DataSource', back_populates='datasets')
    fields = relationship('DatasetField', back_populates='dataset', cascade='all, delete-orphan', lazy='dynamic')
    tasks = relationship('ExtractionTask', back_populates='dataset', cascade='all, delete-orphan', lazy='dynamic')
    templates = relationship('ExtractionTemplate', back_populates='dataset', cascade='all, delete-orphan')
    
    # ========================================================================
    # 领域事件方法
    # ========================================================================
    
    def record_event(self, event):
        """记录领域事件"""
        if not hasattr(self, '_domain_events'):
            self._domain_events = []
        self._domain_events.append(event)
    
    def clear_events(self) -> List:
        """清空并返回事件"""
        if not hasattr(self, '_domain_events'):
            self._domain_events = []
        events = self._domain_events.copy()
        self._domain_events.clear()
        return events
    
    # ========================================================================
    # 业务方法
    # ========================================================================
    
    def start_sync(self):
        """开始同步元数据"""
        self.sync_status = DatasetSyncStatus.SYNCING.value
        self.updated_at = utcnow()
    
    def complete_sync(self, field_count: int):
        """
        完成同步
        
        Args:
            field_count: 同步的字段数
        """
        self.sync_status = DatasetSyncStatus.SYNCED.value
        self.last_sync_at = utcnow()
        self.sync_error = None
        self.updated_at = utcnow()
    
    def fail_sync(self, error: str):
        """
        同步失败
        
        Args:
            error: 错误信息
        """
        self.sync_status = DatasetSyncStatus.FAILED.value
        self.sync_error = error
        self.updated_at = utcnow()
    
    def is_ready(self) -> bool:
        """
        判断数据集是否就绪（可用于创建提取任务和对话）
        
        Returns:
            是否就绪
        """
        return (
            self.sync_status == DatasetSyncStatus.SYNCED.value and
            not self.is_deleted
        )
    
    def get_field_by_name(self, physical_name: str) -> Optional['DatasetField']:
        """
        根据物理字段名获取字段
        
        Args:
            physical_name: 物理字段名
        
        Returns:
            字段实体或 None
        """
        return self.fields.filter_by(physical_name=physical_name).first()
    
    def get_sensitive_fields(self) -> List['DatasetField']:
        """
        获取所有敏感字段
        
        Returns:
            敏感字段列表
        """
        return self.fields.filter(db.column('sensitivity_level').in_(['pii', 'confidential', 'secret'])).all()
    
    def get_partition_fields(self) -> List['DatasetField']:
        """
        获取分区字段
        
        Returns:
            分区字段列表
        """
        return self.fields.filter_by(business_type='partition').all()
    
    def soft_delete(self):
        """软删除数据集"""
        self.is_deleted = True
        self.updated_at = utcnow()
    
    # ========================================================================
    # 序列化
    # ========================================================================
    
    def to_dict(self, include_fields: bool = False):
        """
        转换为字典
        
        Args:
            include_fields: 是否包含字段列表
        
        Returns:
            字典表示
        """
        data = {
            'id': self.id,
            'dataset_code': self.dataset_code,
            'dataset_name': self.dataset_name,
            'dataset_type': self.dataset_type,
            'source_id': self.source_id,
            'source_type': getattr(self, 'source_type', None) or (self.source.source_type if self.source else None),
            'physical_table': self.physical_table,
            'sql_query': self.sql_query,
            'file_metadata': self.file_metadata,
            'description': self.description,
            'owner': self.owner,
            'schema_snapshot': self.schema_snapshot,
            'partition_fields': self.partition_fields,
            'dimension_fields': self.dimension_fields,
            'metric_fields': self.metric_fields,
            'sync_status': self.sync_status,
            'last_sync_at': self.last_sync_at.isoformat() if self.last_sync_at else None,
            'sync_error': self.sync_error,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
        
        if include_fields:
            data['fields'] = [f.to_dict() for f in self.fields.all()]
            data['field_count'] = self.fields.count()
        elif hasattr(self, 'field_count'):
            data['field_count'] = getattr(self, 'field_count')
        
        return data
    
    def __repr__(self):
        return f'<Dataset {self.dataset_code}>'
