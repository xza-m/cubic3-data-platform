"""
获取对话查询
"""
from dataclasses import dataclass


@dataclass
class GetConversationQuery:
    """获取对话查询"""
    conversation_id: int
    user_id: str
