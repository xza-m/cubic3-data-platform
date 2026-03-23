"""
列出对话查询
"""
from dataclasses import dataclass


@dataclass
class ListConversationsQuery:
    """列出对话查询"""
    user_id: str
    offset: int = 0
    limit: int = 20
