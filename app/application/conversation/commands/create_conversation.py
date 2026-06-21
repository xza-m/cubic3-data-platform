"""
创建对话命令
"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class CreateConversationCommand:
    """创建对话命令"""
    dataset_id: Optional[int]
    user_id: str
    title: Optional[str] = None
    description: Optional[str] = None
