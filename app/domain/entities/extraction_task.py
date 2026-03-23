"""
提取任务实体（Entity = ORM Model）
包含业务逻辑，避免贫血模型
"""
from datetime import datetime
from app.shared.utils.time import utcnow
from typing import List
from sqlalchemy import Column, BigInteger, String, Boolean, DateTime, Text, Integer, ForeignKey, Float
from app.shared.db_types import JsonType
from sqlalchemy.orm import relationship
from app.extensions import db
from app.shared.exceptions import TaskNotActiveError, InvalidFieldsError
from app.shared.enums import TaskType, TaskStatus


class ExtractionTask(db.Model):
    """
    提取任务实体
    
    职责：
    1. 封装提取任务的业务规则
    2. 管理任务生命周期
    3. 验证业务约束
    4. 记录领域事件
    """
    __tablename__ = 'extraction_tasks'
    __table_args__ = {'extend_existing': True}
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._domain_events: List = []
    
    # ========================================================================
    # ORM 字段定义
    # ========================================================================
    
    id = Column(BigInteger, primary_key=True)
    task_name = Column(String(200), nullable=False)
    task_code = Column(String(100), unique=True)
    
    # 数据集关联
    dataset_id = Column(BigInteger, ForeignKey('datasets.id', ondelete='CASCADE'))
    
    # 查询关联（定时查询功能）
    query_id = Column(BigInteger, ForeignKey('queries.id', ondelete='SET NULL'), nullable=True)
    
    # 提取配置
    select_fields = Column(JsonType, nullable=False)
    filter_conditions = Column(JsonType, nullable=False)
    
    # SQL模板
    sql_template = Column(Text)
    
    # 限制
    row_limit = Column(Integer, default=500000)
    
    # 任务类型
    task_type = Column(String(20), default=TaskType.MANUAL.value)
    
    # 调度配置
    schedule_config = Column(JsonType)
    
    # 订阅配置
    subscription_config = Column(JsonType)
    
    # 状态
    is_active = Column(Boolean, default=True)
    last_run_at = Column(DateTime)
    last_run_status = Column(String(20))
    
    # 审计字段
    created_by = Column(String(50))
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    
    # 关系
    dataset = relationship('Dataset', back_populates='tasks')
    runs = relationship('ExtractionRun', back_populates='task', cascade='all, delete-orphan', lazy='dynamic')
    
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
    # 业务方法（领域逻辑）
    # ========================================================================
    
    def execute(self, triggered_by: str) -> 'ExtractionRun':
        """
        执行提取任务
        
        业务规则：
        1. 任务必须处于活跃状态
        2. 创建执行记录
        3. 返回执行记录供后续处理
        
        Args:
            triggered_by: 触发人
        
        Returns:
            ExtractionRun: 执行记录实体
        
        Raises:
            TaskNotActiveError: 任务未激活
        """
        # 业务规则验证
        if not self.is_active:
            raise TaskNotActiveError(self.id)
        
        # 导入放在这里避免循环依赖
        from app.domain.entities.extraction_run import ExtractionRun
        
        # 创建执行记录
        run = ExtractionRun(
            task_id=self.id,
            run_type='manual',
            triggered_by=triggered_by,
            generated_sql=self.sql_template,
            status=TaskStatus.PENDING.value,
            start_time=utcnow()
        )
        
        return run
    
    def update_last_run_info(self, status: str, run_at: datetime):
        """
        更新最后执行信息
        
        Args:
            status: 执行状态
            run_at: 执行时间
        """
        self.last_run_status = status
        self.last_run_at = run_at
        self.updated_at = utcnow()
    
    def validate_fields(self) -> bool:
        """
        验证字段有效性
        
        业务规则：
        1. select_fields 不能为空
        2. 字段必须在数据集中存在
        
        Returns:
            是否有效
        
        Raises:
            InvalidFieldsError: 字段无效
        """
        # 空数组表示选择所有字段，允许
        if self.select_fields is None:
            raise InvalidFieldsError(['select_fields cannot be None'])
        
        # 如果指定了字段，验证字段是否在数据集中存在
        if self.select_fields and len(self.select_fields) > 0 and self.dataset:
            valid_fields = {f.physical_name for f in self.dataset.fields}
            invalid_fields = set(self.select_fields) - valid_fields
            
            if invalid_fields:
                raise InvalidFieldsError(list(invalid_fields))
        
        return True
    
    def activate(self):
        """激活任务"""
        self.is_active = True
        self.updated_at = utcnow()
    
    def deactivate(self):
        """停用任务"""
        self.is_active = False
        self.updated_at = utcnow()
    
    def can_execute(self) -> bool:
        """
        判断是否可以执行
        
        Returns:
            是否可以执行
        """
        return self.is_active and self.dataset is not None
    
    # ========================================================================
    # 查询方法
    # ========================================================================
    
    def get_recent_runs(self, limit: int = 10):
        """
        获取最近的执行记录
        
        Args:
            limit: 返回数量
        
        Returns:
            执行记录列表
        """
        return self.runs.order_by(db.desc('created_at')).limit(limit).all()
    
    def get_success_rate(self) -> float:
        """
        获取任务成功率
        
        Returns:
            成功率（0.0-1.0）
        """
        total = self.runs.count()
        if total == 0:
            return 0.0
        
        success = self.runs.filter_by(status=TaskStatus.SUCCESS.value).count()
        return success / total
    
    # ========================================================================
    # 序列化
    # ========================================================================
    
    def to_dict(self, include_stats: bool = False):
        """
        转换为字典（用于 API 响应）
        
        Args:
            include_stats: 是否包含统计信息
        
        Returns:
            字典表示
        """
        result = {
            'id': self.id,
            'task_name': self.task_name,
            'task_code': self.task_code,
            'dataset_id': self.dataset_id,
            'select_fields': self.select_fields,
            'filter_conditions': self.filter_conditions,
            'sql_template': self.sql_template,
            'row_limit': self.row_limit,
            'task_type': self.task_type,
            'schedule_config': self.schedule_config,
            'subscription_config': self.subscription_config,
            'is_active': self.is_active,
            'last_run_at': self.last_run_at.isoformat() if self.last_run_at else None,
            'last_run_status': self.last_run_status,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
        
        # 可选：包含统计信息
        if include_stats:
            result['stats'] = {
                'total_runs': self.runs.count(),
                'success_rate': self.get_success_rate()
            }
        
        return result
    
    def __repr__(self):
        return f'<ExtractionTask {self.task_name} (id={self.id})>'
