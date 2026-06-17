"""
提取任务执行记录实体
"""
from datetime import datetime
from app.shared.utils.time import utcnow
from sqlalchemy import Column, BigInteger, String, DateTime, Text, Integer, ForeignKey, Float
from app.shared.db_types import JsonType
from sqlalchemy.orm import relationship
from app.extensions import db
from app.shared.enums import TaskStatus, DeliveryMethod


class ExtractionRun(db.Model):
    """
    提取任务执行记录实体
    
    职责：
    1. 记录任务执行状态
    2. 管理执行生命周期
    3. 存储执行结果信息
    """
    __tablename__ = 'extraction_runs'
    __table_args__ = {'extend_existing': True}
    
    # ========================================================================
    # ORM 字段定义
    # ========================================================================
    
    id = Column(BigInteger, primary_key=True)
    task_id = Column(BigInteger, ForeignKey('extraction_tasks.id', ondelete='CASCADE'))
    
    # 执行信息
    run_type = Column(String(20))
    triggered_by = Column(String(191))
    
    # 执行参数
    execution_params = Column(JsonType)
    generated_sql = Column(Text)
    
    # 执行状态
    status = Column(String(20), default=TaskStatus.PENDING.value)
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    duration_ms = Column(Integer)
    
    # 结果信息
    row_count = Column(BigInteger)
    result_file_path = Column(Text)
    result_size_mb = Column(Float)
    
    # 交付信息
    delivery_method = Column(String(20))
    delivery_info = Column(JsonType, default={})
    
    # 兼容旧字段
    file_size = Column(BigInteger)
    file_path = Column(Text)
    download_url = Column(Text)
    url_expires_at = Column(DateTime)
    
    # 错误信息
    error_message = Column(Text)
    error_stack = Column(Text)
    
    # 通知状态
    notification_status = Column(JsonType, default={})
    
    created_at = Column(DateTime, default=utcnow)
    
    # 关系
    task = relationship('ExtractionTask', back_populates='runs')
    
    # ========================================================================
    # 业务方法
    # ========================================================================
    
    def start(self):
        """开始执行"""
        self.status = TaskStatus.RUNNING.value
        self.start_time = utcnow()
    
    def mark_as_success(self, result: dict):
        """
        标记任务成功
        
        Args:
            result: 执行结果，包含：
                - row_count: 行数
                - file_path: 文件路径
                - file_size_mb: 文件大小（MB）
                - delivery_method: 交付方式
                - delivery_info: 交付详情
        """
        self.status = TaskStatus.SUCCESS.value
        self.end_time = utcnow()
        self.duration_ms = int((self.end_time - self.start_time).total_seconds() * 1000)
        
        # 更新结果信息
        self.row_count = result.get('row_count', 0)
        self.result_file_path = result.get('file_path')
        self.result_size_mb = result.get('file_size_mb')
        self.delivery_method = result.get('delivery_method')
        self.delivery_info = result.get('delivery_info', {})
    
    def mark_as_failed(self, error: str, error_stack: str = None):
        """
        标记任务失败
        
        Args:
            error: 错误信息
            error_stack: 错误堆栈（可选）
        """
        self.status = TaskStatus.FAILED.value
        self.end_time = utcnow()
        
        if self.start_time:
            self.duration_ms = int((self.end_time - self.start_time).total_seconds() * 1000)
        
        self.error_message = error
        self.error_stack = error_stack
    
    def mark_as_timeout(self):
        """标记任务超时"""
        self.status = TaskStatus.TIMEOUT.value
        self.end_time = utcnow()
        
        if self.start_time:
            self.duration_ms = int((self.end_time - self.start_time).total_seconds() * 1000)
        
        self.error_message = "Task execution timeout"
    
    def is_finished(self) -> bool:
        """判断是否已完成（成功或失败）"""
        return self.status in [
            TaskStatus.SUCCESS.value,
            TaskStatus.FAILED.value,
            TaskStatus.TIMEOUT.value
        ]
    
    def is_successful(self) -> bool:
        """判断是否执行成功"""
        return self.status == TaskStatus.SUCCESS.value
    
    def can_download(self) -> bool:
        """判断是否可以下载结果文件"""
        return (
            self.is_successful() and
            self.result_file_path is not None and
            self.delivery_method == DeliveryMethod.LOCAL.value
        )
    
    def get_duration_seconds(self) -> float:
        """获取执行时长（秒）"""
        if self.duration_ms:
            return self.duration_ms / 1000.0
        return 0.0
    
    # ========================================================================
    # 序列化
    # ========================================================================
    
    def to_dict(self, include_sql: bool = False):
        """
        转换为字典
        
        Args:
            include_sql: 是否包含 SQL（默认不包含，避免日志过长）
        
        Returns:
            字典表示
        """
        result = {
            'id': self.id,
            'task_id': self.task_id,
            'run_type': self.run_type,
            'triggered_by': self.triggered_by,
            'status': self.status,
            'start_time': self.start_time.isoformat() if self.start_time else None,
            'end_time': self.end_time.isoformat() if self.end_time else None,
            'duration_ms': self.duration_ms,
            'duration_seconds': self.get_duration_seconds(),
            'row_count': self.row_count,
            'result_file_path': self.result_file_path,
            'result_size_mb': self.result_size_mb,
            'delivery_method': self.delivery_method,
            'delivery_info': self.delivery_info,
            'error_message': self.error_message,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
        
        # 可选：包含 SQL
        if include_sql:
            result['generated_sql'] = self.generated_sql
        
        return result
    
    def __repr__(self):
        return f'<ExtractionRun id={self.id} task_id={self.task_id} status={self.status}>'
