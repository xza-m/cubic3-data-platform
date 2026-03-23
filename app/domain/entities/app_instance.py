"""
应用实例实体
"""
from datetime import datetime
from app.shared.utils.time import utcnow
from typing import List, Dict, Any, Optional
from sqlalchemy import Column, BigInteger, String, Boolean, DateTime, Text, ForeignKey
from app.shared.db_types import JsonType
from sqlalchemy.orm import relationship, reconstructor
from app.extensions import db


class AppInstance(db.Model):
    """
    应用实例实体
    
    职责：
    1. 管理应用实例的配置和生命周期
    2. 跟踪调度状态和执行历史
    3. 提供实例级别的业务逻辑
    4. 记录领域事件
    """
    __tablename__ = 'app_instances'
    __table_args__ = {'extend_existing': True}
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._domain_events: List = []

    @reconstructor
    def init_on_load(self):
        self._domain_events: List = []
    
    # ========================================================================
    # ORM 字段定义
    # ========================================================================
    
    id = Column(BigInteger, primary_key=True)
    app_code = Column(String(50), ForeignKey('app_definitions.code', ondelete='CASCADE'), nullable=False)
    name = Column(String(200), nullable=False)  # 实例名称
    description = Column(Text)  # 实例描述
    config = Column(JsonType, nullable=False)  # 配置参数（JSON）
    schedule_type = Column(String(20), nullable=False)  # 调度类型（cron/event/manual）
    schedule_config = Column(JsonType)  # 调度配置（如 cron 表达式）
    enabled = Column(Boolean, default=False)  # 是否启用
    owner = Column(String(100), nullable=False)  # 所有者
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    last_execution_at = Column(DateTime)  # 最后执行时间
    last_execution_status = Column(String(20))  # 最后执行状态（success/failed）
    
    # 关系
    app_definition = relationship('AppDefinition', back_populates='instances')
    executions = relationship('AppExecution', back_populates='instance', lazy='dynamic', cascade='all, delete-orphan')
    
    # ========================================================================
    # 领域事件方法
    # ========================================================================
    
    def collect_domain_events(self) -> List:
        """收集领域事件"""
        events = self._domain_events
        self._domain_events = []
        return events
    
    # ========================================================================
    # 业务逻辑方法
    # ========================================================================
    
    def enable(self):
        """启用实例"""
        if not self.enabled:
            self.enabled = True
            self.updated_at = utcnow()
            # TODO: 触发启用事件
    
    def disable(self):
        """禁用实例"""
        if self.enabled:
            self.enabled = False
            self.updated_at = utcnow()
            # TODO: 触发禁用事件
    
    def update_config(self, new_config: Dict[str, Any]):
        """
        更新配置
        
        Args:
            new_config: 新的配置参数
        """
        self.config = new_config
        self.updated_at = utcnow()
        # TODO: 触发配置更新事件
    
    def update_schedule(self, schedule_type: str, schedule_config: Optional[Dict[str, Any]] = None):
        """
        更新调度配置
        
        Args:
            schedule_type: 调度类型
            schedule_config: 调度配置
        """
        self.schedule_type = schedule_type
        self.schedule_config = schedule_config
        self.updated_at = utcnow()
        # TODO: 触发调度更新事件
    
    def record_execution(self, status: str, executed_at: Optional[datetime] = None):
        """
        记录执行状态
        
        Args:
            status: 执行状态
            executed_at: 执行时间（默认当前时间）
        """
        self.last_execution_status = status
        self.last_execution_at = executed_at or utcnow()
    
    def get_execution_count(self, status: Optional[str] = None) -> int:
        """
        获取执行次数
        
        Args:
            status: 执行状态筛选（可选）
        """
        query = self.executions
        if status:
            query = query.filter_by(status=status)
        return query.count()
    
    def get_success_rate(self) -> float:
        """
        获取成功率
        
        Returns:
            成功率（0-1）
        """
        total = self.get_execution_count()
        if total == 0:
            return 0.0
        
        success = self.get_execution_count(status='success')
        return success / total
    
    def get_average_duration(self) -> Optional[float]:
        """
        获取平均执行耗时（毫秒）
        
        Returns:
            平均耗时，如果没有执行记录则返回 None
        """
        from sqlalchemy import func
        from app.domain.entities.app_execution import AppExecution
        
        result = db.session.query(
            func.avg(AppExecution.duration_ms)
        ).filter(
            AppExecution.instance_id == self.id,
            AppExecution.status == 'success',
            AppExecution.duration_ms.isnot(None)
        ).scalar()
        
        return result
    
    def can_execute(self) -> tuple[bool, Optional[str]]:
        """
        检查是否可以执行
        
        Returns:
            (can_execute, reason): 是否可执行和原因
        """
        if not self.enabled:
            return False, "实例已禁用"
        
        if not self.app_definition or not self.app_definition.enabled:
            return False, "应用已禁用"
        
        return True, None
    
    def is_owned_by(self, user: str, roles: list = None) -> bool:
        """
        检查是否属于指定用户
        
        - admin 角色可管理所有实例
        - system 创建的内置实例允许任何已认证用户编辑
        - 其他实例仅限所有者
        """
        if roles and 'admin' in roles:
            return True
        if self.owner == 'system':
            return True
        return self.owner == user
    
    # ========================================================================
    # 辅助方法
    # ========================================================================
    
    def to_dict(self, include_app_info: bool = False, include_stats: bool = False) -> Dict[str, Any]:
        """
        转换为字典
        
        Args:
            include_app_info: 是否包含应用定义信息
            include_stats: 是否包含统计信息
        """
        result = {
            'id': self.id,
            'app_code': self.app_code,
            'name': self.name,
            'description': self.description,
            'config': self.config,
            'schedule_type': self.schedule_type,
            'schedule_config': self.schedule_config,
            'enabled': self.enabled,
            'owner': self.owner,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'last_execution_at': self.last_execution_at.isoformat() if self.last_execution_at else None,
            'last_execution_status': self.last_execution_status
        }
        
        if include_app_info and self.app_definition:
            result['app'] = {
                'code': self.app_definition.code,
                'name': self.app_definition.name,
                'category': self.app_definition.category,
                'icon': self.app_definition.icon
            }
        
        if include_stats:
            result['stats'] = {
                'total_executions': self.get_execution_count(),
                'success_count': self.get_execution_count(status='success'),
                'failed_count': self.get_execution_count(status='failed'),
                'success_rate': round(self.get_success_rate() * 100, 2),
                'avg_duration_ms': self.get_average_duration()
            }
        
        return result
    
    def __repr__(self):
        return f'<AppInstance {self.name} ({self.app_code})>'
