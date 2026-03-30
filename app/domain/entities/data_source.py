"""
数据源实体
"""
from datetime import datetime
from app.shared.utils.time import utcnow
from typing import Dict, Any, List
from sqlalchemy import Column, BigInteger, String, Boolean, DateTime, Text
from app.shared.db_types import JsonType
from sqlalchemy.orm import relationship
from app.extensions import db
from app.shared.enums import DataSourceType, ConnectionStatus


class DataSource(db.Model):
    """
    数据源实体
    
    职责：
    1. 管理数据源连接配置
    2. 测试连接状态
    3. 提供数据源级别的业务逻辑
    4. 记录领域事件
    """
    __tablename__ = 'data_sources'
    __table_args__ = {'extend_existing': True}
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._domain_events: List = []
    
    # ========================================================================
    # ORM 字段定义
    # ========================================================================
    
    id = Column(BigInteger, primary_key=True)
    name = Column(String(100), unique=True, nullable=False)
    source_type = Column(String(20), nullable=False)
    description = Column(Text)
    
    # 连接配置
    connection_config = Column(JsonType, nullable=False)
    extra_config = Column(JsonType, default={})
    
    # 状态管理
    is_active = Column(Boolean, default=True)
    connection_status = Column(String(20), default=ConnectionStatus.UNKNOWN.value)
    last_test_at = Column(DateTime)
    last_test_error = Column(Text)
    
    # 审计字段
    created_by = Column(String(50))
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    
    # 关系
    datasets = relationship('Dataset', back_populates='source', cascade='all, delete-orphan')
    
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

    CATALOG_SYNC_PENDING = 'pending'
    CATALOG_SYNC_SYNCING = 'syncing'
    CATALOG_SYNC_SYNCED = 'synced'
    CATALOG_SYNC_FAILED = 'failed'

    def _ensure_extra_config(self) -> Dict[str, Any]:
        """确保 extra_config 为可写字典。"""
        if not isinstance(self.extra_config, dict):
            self.extra_config = {}
        return self.extra_config

    def get_catalog_sync_summary(self) -> Dict[str, Any]:
        """返回目录同步摘要，并补齐缺省字段。"""
        summary = {
            'status': self.CATALOG_SYNC_PENDING,
            'last_run_at': None,
            'last_error': None,
            'tracked_databases': [],
            'database_count': 0,
        }
        extra_config = self.extra_config if isinstance(self.extra_config, dict) else {}
        raw = extra_config.get('catalog_sync') or {}
        summary.update(raw)
        summary['tracked_databases'] = list(summary.get('tracked_databases') or [])
        summary['database_count'] = int(summary.get('database_count') or len(summary['tracked_databases']))
        return summary

    def initialize_catalog_sync(self):
        """初始化目录同步摘要。"""
        extra_config = self._ensure_extra_config()
        extra_config['catalog_sync'] = self.get_catalog_sync_summary()
        self.extra_config = extra_config
        self.updated_at = utcnow()

    def _set_catalog_sync_summary(
        self,
        *,
        status: str,
        tracked_databases: List[str] | None = None,
        last_error: str | None = None,
        update_last_run: bool = False,
    ) -> Dict[str, Any]:
        extra_config = self._ensure_extra_config()
        summary = self.get_catalog_sync_summary()
        summary['status'] = status
        if tracked_databases is not None:
            normalized = sorted({name for name in tracked_databases if name})
            summary['tracked_databases'] = normalized
            summary['database_count'] = len(normalized)
        if update_last_run:
            summary['last_run_at'] = utcnow().isoformat()
        summary['last_error'] = last_error
        extra_config['catalog_sync'] = summary
        self.extra_config = extra_config
        self.updated_at = utcnow()
        return summary

    def mark_catalog_sync_syncing(self) -> Dict[str, Any]:
        """标记目录同步进行中。"""
        return self._set_catalog_sync_summary(
            status=self.CATALOG_SYNC_SYNCING,
            last_error=None,
        )

    def mark_catalog_sync_synced(self, tracked_databases: List[str]) -> Dict[str, Any]:
        """标记目录同步成功。"""
        return self._set_catalog_sync_summary(
            status=self.CATALOG_SYNC_SYNCED,
            tracked_databases=tracked_databases,
            last_error=None,
            update_last_run=True,
        )

    def mark_catalog_sync_failed(self, error: str) -> Dict[str, Any]:
        """标记目录同步失败。"""
        return self._set_catalog_sync_summary(
            status=self.CATALOG_SYNC_FAILED,
            last_error=error,
            update_last_run=True,
        )
    
    def mark_test_success(self):
        """标记连接测试成功"""
        self.connection_status = ConnectionStatus.CONNECTED.value
        self.last_test_at = utcnow()
        self.last_test_error = None
        self.updated_at = utcnow()
    
    def mark_test_failed(self, error: str):
        """
        标记连接测试失败
        
        Args:
            error: 错误信息
        """
        self.connection_status = ConnectionStatus.ERROR.value
        self.last_test_at = utcnow()
        self.last_test_error = error
        self.updated_at = utcnow()
    
    def is_connected(self) -> bool:
        """
        判断是否已连接
        
        Returns:
            是否已连接
        """
        return self.connection_status == ConnectionStatus.CONNECTED.value
    
    def can_use(self) -> bool:
        """
        判断是否可用（活跃且已连接）
        
        Returns:
            是否可用
        """
        return self.is_active and self.is_connected()
    
    def activate(self):
        """激活数据源"""
        self.is_active = True
        self.updated_at = utcnow()
    
    def deactivate(self):
        """停用数据源"""
        self.is_active = False
        self.updated_at = utcnow()
    
    def update_connection_config(self, config: Dict[str, Any]):
        """
        更新连接配置
        
        Args:
            config: 新的连接配置
        """
        self.connection_config = config
        # 重置连接状态（需要重新测试）
        self.connection_status = ConnectionStatus.UNKNOWN.value
        self.updated_at = utcnow()
    
    def get_masked_config(self) -> Dict[str, Any]:
        """
        获取脱敏后的连接配置（用于API响应）
        
        Returns:
            脱敏后的配置字典
        """
        config = self.connection_config.copy() if self.connection_config else {}
        
        # 脱敏敏感字段
        sensitive_keys = ['password', 'access_key', 'secret_access_key', 'secret', 'token']
        for key in sensitive_keys:
            if key in config and config[key]:
                val = str(config[key])
                if len(val) > 6:
                    config[key] = f"{val[:3]}{'*' * (len(val) - 6)}{val[-3:]}"
                else:
                    config[key] = '******'
        
        return config
    
    # ========================================================================
    # 序列化
    # ========================================================================
    
    def to_dict(self, mask_sensitive: bool = True):
        """
        转换为字典
        
        Args:
            mask_sensitive: 是否脱敏敏感字段
        
        Returns:
            字典表示
        """
        extra_config = self._ensure_extra_config().copy()
        extra_config['catalog_sync'] = self.get_catalog_sync_summary()

        return {
            'id': self.id,
            'name': self.name,
            'source_type': self.source_type,
            'description': self.description,
            'connection_config': self.get_masked_config() if mask_sensitive else self.connection_config,
            'extra_config': extra_config,
            'is_active': self.is_active,
            'connection_status': self.connection_status,
            'last_test_at': self.last_test_at.isoformat() if self.last_test_at else None,
            'last_test_error': self.last_test_error,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    def __repr__(self):
        return f'<DataSource {self.name} ({self.source_type})>'


# 向后兼容旧命名
Datasource = DataSource
