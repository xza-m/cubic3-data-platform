"""
Agent 查询日志实体

记录每次 DataAgent 查询的完整上下文，用于：
1. 反馈闭环 — 业务方标记结果正确/有误
2. 查询分析 — 统计使用量、成功率、耗时
3. 知识优化 — 筛查 negative 反馈优化知识文档
"""
from datetime import datetime
from app.shared.utils.time import utcnow
from typing import Dict, Any, Optional, List
from sqlalchemy import Column, BigInteger, Integer, String, Text, DateTime
from app.shared.db_types import JsonType
from app.extensions import db


class AgentQueryLog(db.Model):
    """Agent 查询日志"""

    __tablename__ = 'agent_query_log'
    __table_args__ = {'extend_existing': True}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._domain_events: List = []

    # ========================================================================
    # ORM 字段定义
    # ========================================================================

    id = Column(BigInteger, primary_key=True)
    app_instance_id = Column(BigInteger, nullable=True)
    channel = Column(String(20), nullable=False)            # feishu / datachat
    channel_ref = Column(String(128), nullable=True)        # chat_id 或 conversation_id
    user_id = Column(String(64), nullable=True)
    user_message = Column(Text, nullable=False)
    agent_response = Column(Text, nullable=True)
    sql_executed = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default='pending')
    llm_provider = Column(String(20), nullable=True)
    token_usage = Column(JsonType, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    feedback = Column(String(20), nullable=True)            # positive / negative
    created_at = Column(DateTime, default=utcnow)

    # ========================================================================
    # 业务方法
    # ========================================================================

    def mark_running(self):
        self.status = 'running'

    def mark_success(self, response: str, sql: Optional[str] = None,
                     usage: Optional[Dict] = None, duration: Optional[int] = None):
        self.status = 'success'
        self.agent_response = response
        self.sql_executed = sql
        self.token_usage = usage
        self.duration_ms = duration

    def mark_error(self, error_msg: str, duration: Optional[int] = None):
        self.status = 'error'
        self.agent_response = error_msg
        self.duration_ms = duration

    def set_feedback(self, feedback: str):
        """记录用户反馈（positive / negative）"""
        self.feedback = feedback

    # ========================================================================
    # 序列化
    # ========================================================================

    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'app_instance_id': self.app_instance_id,
            'channel': self.channel,
            'channel_ref': self.channel_ref,
            'user_id': self.user_id,
            'user_message': self.user_message,
            'agent_response': self.agent_response,
            'sql_executed': self.sql_executed,
            'status': self.status,
            'llm_provider': self.llm_provider,
            'token_usage': self.token_usage,
            'duration_ms': self.duration_ms,
            'feedback': self.feedback,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f'<AgentQueryLog {self.id} ({self.status})>'
