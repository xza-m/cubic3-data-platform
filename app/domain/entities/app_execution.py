"""
应用执行记录实体
"""
from datetime import datetime
from app.shared.utils.time import utcnow
from typing import List, Dict, Any, Optional
from sqlalchemy import Column, BigInteger, String, Integer, DateTime, Text, ForeignKey
from app.shared.db_types import JsonType
from sqlalchemy.orm import relationship, reconstructor
from app.extensions import db


class AppExecution(db.Model):
    """
    应用执行记录实体
    
    职责：
    1. 记录每次执行的详细信息
    2. 跟踪执行状态和结果
    3. 提供执行统计和分析
    4. 记录领域事件
    """
    __tablename__ = 'app_executions'
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
    instance_id = Column(BigInteger, ForeignKey('app_instances.id', ondelete='CASCADE'), nullable=False)
    trigger_type = Column(String(20), nullable=False)  # 触发方式（scheduled/event/manual）
    status = Column(String(20), nullable=False, default='pending')  # 执行状态
    started_at = Column(DateTime)  # 开始时间
    ended_at = Column(DateTime)  # 结束时间
    duration_ms = Column(Integer)  # 执行耗时（毫秒）
    input_params = Column(JsonType)  # 输入参数
    output = Column(JsonType)  # 输出结果
    error_message = Column(Text)  # 错误信息
    created_at = Column(DateTime, default=utcnow)
    
    # 关系
    instance = relationship('AppInstance', back_populates='executions')
    
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
    
    def _compute_duration_ms(self) -> Optional[int]:
        """计算耗时（毫秒）。

        列类型是无时区 DateTime，ORM 回读后 started_at 会变 naive，
        而 utcnow() 是 aware；两者统一按 UTC 对齐后再相减。
        """
        if not self.started_at or not self.ended_at:
            return None
        start, end = self.started_at, self.ended_at
        if start.tzinfo is None and end.tzinfo is not None:
            start = start.replace(tzinfo=end.tzinfo)
        elif end.tzinfo is None and start.tzinfo is not None:
            end = end.replace(tzinfo=start.tzinfo)
        return int((end - start).total_seconds() * 1000)

    def start(self):
        """开始执行"""
        self.status = 'running'
        self.started_at = utcnow()
        
        # 收集执行开始事件
        from app.domain.events.app_events import AppExecutionStarted
        event = AppExecutionStarted(
            execution_id=self.id,
            instance_id=self.instance_id,
            app_code=self.instance.app_code if self.instance else None,
            trigger_type=self.trigger_type
        )
        self._domain_events.append(event)
    
    def complete_success(self, output: Optional[Dict[str, Any]] = None):
        """
        标记执行成功
        
        Args:
            output: 执行输出结果
        """
        self.status = 'success'
        self.ended_at = utcnow()
        self.output = output
        self.duration_ms = self._compute_duration_ms()
        
        # 更新实例的最后执行状态
        if self.instance:
            self.instance.record_execution('success', self.ended_at)
        
        # 收集执行成功事件
        from app.domain.events.app_events import AppExecutionCompleted
        event = AppExecutionCompleted(
            execution_id=self.id,
            instance_id=self.instance_id,
            app_code=self.instance.app_code if self.instance else None,
            instance_name=self.instance.name if self.instance else None,
            trigger_type=self.trigger_type,
            duration_ms=self.duration_ms or 0,
            output=output
        )
        self._domain_events.append(event)
    
    def complete_failure(self, error_message: str):
        """
        标记执行失败
        
        Args:
            error_message: 错误信息
        """
        self.status = 'failed'
        self.ended_at = utcnow()
        self.error_message = error_message
        self.duration_ms = self._compute_duration_ms()
        
        # 更新实例的最后执行状态
        if self.instance:
            self.instance.record_execution('failed', self.ended_at)
        
        # 收集执行失败事件
        from app.domain.events.app_events import AppExecutionFailed
        event = AppExecutionFailed(
            execution_id=self.id,
            instance_id=self.instance_id,
            app_code=self.instance.app_code if self.instance else None,
            instance_name=self.instance.name if self.instance else None,
            trigger_type=self.trigger_type,
            error_message=error_message
        )
        self._domain_events.append(event)
    
    def is_success(self) -> bool:
        """判断是否执行成功"""
        return self.status == 'success'
    
    def is_failed(self) -> bool:
        """判断是否执行失败"""
        return self.status == 'failed'
    
    def is_running(self) -> bool:
        """判断是否正在执行"""
        return self.status == 'running'
    
    def is_pending(self) -> bool:
        """判断是否等待执行"""
        return self.status == 'pending'
    
    def get_duration_seconds(self) -> Optional[float]:
        """
        获取执行耗时（秒）
        
        Returns:
            耗时秒数，如果未完成则返回 None
        """
        if self.duration_ms is None:
            return None
        return self.duration_ms / 1000.0
    
    def get_trigger_display_name(self) -> str:
        """获取触发方式的显示名称"""
        trigger_names = {
            'scheduled': '定时触发',
            'event': '事件触发',
            'manual': '手动触发'
        }
        return trigger_names.get(self.trigger_type, self.trigger_type)
    
    def get_status_display_name(self) -> str:
        """获取执行状态的显示名称"""
        status_names = {
            'pending': '等待中',
            'running': '执行中',
            'success': '成功',
            'failed': '失败'
        }
        return status_names.get(self.status, self.status)
    
    # ========================================================================
    # 辅助方法
    # ========================================================================
    
    def to_dict(self, include_instance_info: bool = False) -> Dict[str, Any]:
        """
        转换为字典
        
        Args:
            include_instance_info: 是否包含实例信息
        """
        result = {
            'id': self.id,
            'instance_id': self.instance_id,
            'trigger_type': self.trigger_type,
            'trigger_display_name': self.get_trigger_display_name(),
            'status': self.status,
            'status_display_name': self.get_status_display_name(),
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'ended_at': self.ended_at.isoformat() if self.ended_at else None,
            'duration_ms': self.duration_ms,
            'duration_seconds': self.get_duration_seconds(),
            'input_params': self.input_params,
            'output': self.output,
            'error_message': self.error_message,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
        
        if include_instance_info and self.instance:
            result['instance'] = {
                'id': self.instance.id,
                'name': self.instance.name,
                'app_code': self.instance.app_code
            }
            
            if self.instance.app_definition:
                result['app'] = {
                    'code': self.instance.app_definition.code,
                    'name': self.instance.app_definition.name,
                    'icon': self.instance.app_definition.icon
                }
        
        return result
    
    def __repr__(self):
        return f'<AppExecution {self.id} ({self.status})>'
