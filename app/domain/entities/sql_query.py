"""
SQL 查询任务实体
用于支持异步 SQL 查询
"""
from datetime import datetime
from app.shared.utils.time import utcnow
from sqlalchemy import Column, BigInteger, String, DateTime, Text, Integer, ForeignKey
from app.shared.db_types import JsonType
from app.extensions import db


class SQLQueryStatus:
    """SQL 查询状态枚举"""
    PENDING = 'pending'      # 等待执行
    RUNNING = 'running'      # 执行中
    COMPLETED = 'completed'  # 执行完成
    FAILED = 'failed'        # 执行失败


class SQLQuery(db.Model):
    """
    SQL 查询任务实体
    
    职责：
    1. 记录异步 SQL 查询请求
    2. 存储查询结果
    3. 跟踪执行状态
    """
    __tablename__ = 'sql_queries'
    __table_args__ = {'extend_existing': True}
    
    # ========================================================================
    # ORM 字段定义
    # ========================================================================
    
    id = Column(BigInteger, primary_key=True)
    
    # 查询信息
    source_id = Column(BigInteger, ForeignKey('data_sources.id', ondelete='SET NULL'), nullable=True)
    sql = Column(Text, nullable=False)
    limit_rows = Column(Integer, default=100)
    
    # 执行状态
    status = Column(String(20), default=SQLQueryStatus.PENDING)
    
    # 执行时间
    created_at = Column(DateTime, default=utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    execution_time_ms = Column(Integer, nullable=True)
    
    # 查询结果（JSON 格式存储）
    result = Column(JsonType, nullable=True)
    row_count = Column(Integer, nullable=True)
    
    # 错误信息
    error_message = Column(Text, nullable=True)
    error_stack = Column(Text, nullable=True)
    
    # 用户信息
    created_by = Column(String(191), nullable=True)
    
    # RQ Job ID（用于任务追踪）
    job_id = Column(String(100), nullable=True)
    
    # ========================================================================
    # 业务方法
    # ========================================================================
    
    def start(self):
        """开始执行"""
        self.status = SQLQueryStatus.RUNNING
        self.started_at = utcnow()
    
    def mark_as_completed(self, result: dict, row_count: int, execution_time_ms: int):
        """
        标记查询完成
        
        Args:
            result: 查询结果（包含 columns, data, fields 等）
            row_count: 结果行数
            execution_time_ms: 执行时间（毫秒）
        """
        self.status = SQLQueryStatus.COMPLETED
        self.completed_at = utcnow()
        self.result = result
        self.row_count = row_count
        self.execution_time_ms = execution_time_ms
    
    def mark_as_failed(self, error: str, error_stack: str = None):
        """
        标记查询失败
        
        Args:
            error: 错误信息
            error_stack: 错误堆栈（可选）
        """
        self.status = SQLQueryStatus.FAILED
        self.completed_at = utcnow()
        self.error_message = error
        self.error_stack = error_stack
        
        if self.started_at:
            self.execution_time_ms = int((self.completed_at - self.started_at).total_seconds() * 1000)
    
    def is_finished(self) -> bool:
        """判断是否已完成（成功或失败）"""
        return self.status in [SQLQueryStatus.COMPLETED, SQLQueryStatus.FAILED]
    
    def is_successful(self) -> bool:
        """判断是否执行成功"""
        return self.status == SQLQueryStatus.COMPLETED
    
    def get_duration_seconds(self) -> float:
        """获取执行时长（秒）"""
        if self.execution_time_ms:
            return self.execution_time_ms / 1000.0
        return 0.0
    
    # ========================================================================
    # 序列化
    # ========================================================================
    
    def to_dict(self, include_result: bool = False):
        """
        转换为字典
        
        Args:
            include_result: 是否包含完整结果（默认不包含，状态查询时使用）
        
        Returns:
            字典表示
        """
        data = {
            'id': self.id,
            'source_id': self.source_id,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'execution_time_ms': self.execution_time_ms,
            'row_count': self.row_count,
            'error_message': self.error_message,
            'created_by': self.created_by
        }
        
        if include_result and self.result:
            data['result'] = self.result
        
        return data
    
    def to_status_dict(self):
        """
        返回状态查询的简化字典
        """
        return {
            'id': self.id,
            'status': self.status,
            'execution_time_ms': self.execution_time_ms,
            'row_count': self.row_count,
            'error_message': self.error_message
        }
    
    def __repr__(self):
        return f'<SQLQuery id={self.id} status={self.status}>'
