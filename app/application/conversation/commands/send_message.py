"""
发送消息命令
"""
from dataclasses import dataclass


@dataclass
class SendMessageCommand:
    """发送消息命令"""
    conversation_id: int
    user_id: str
    content: str
