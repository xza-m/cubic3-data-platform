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
    # 决策 4（08.1-02）：principal 解析只在 interfaces 层（conversations.py），经本命令透传进 application。
    # principal_context 角色来自 access_role_bindings（权威源，非 JWT roles）；默认 None 放末尾向后兼容，
    # 旧构造点 SendMessageCommand(conversation_id=, user_id=, content=) 零改动。
    principal_context: dict | None = None
    viewer_roles: list[str] | None = None
