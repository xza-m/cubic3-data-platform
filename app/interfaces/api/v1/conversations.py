"""
对话 API 路由
"""

from flask import Blueprint, request, g
from app.application.conversation.commands.create_conversation import CreateConversationCommand
from app.application.conversation.commands.send_message import SendMessageCommand
from app.application.conversation.queries.get_conversation import GetConversationQuery
from app.application.conversation.queries.list_conversations import ListConversationsQuery
from app.di.utils import get_app_container
from app.shared.response import success, created
from app.shared.utils.logger import get_logger
from app.interfaces.api.middleware.auth import optional_auth, require_auth
from app.interfaces.api.v1.principal_context import principal_context_from_bearer

logger = get_logger(__name__)
bp = Blueprint('conversations', __name__, url_prefix='/api/v1/conversations')


@bp.route('', methods=['POST'])
@optional_auth
def create_conversation():
    """
    创建对话
    
    Request Body:
        {
            "dataset_id": 1,
            "title": "可选标题",
            "description": "可选描述"
        }
    
    Returns:
        {
            "code": 0,
            "message": "success",
            "data": {...}
        }
    """
    data = request.get_json()
    user_id = getattr(g, 'user_id', None) or 'anonymous'
    
    command = CreateConversationCommand(
        dataset_id=data.get('dataset_id'),
        user_id=user_id,
        title=data.get('title'),
        description=data.get('description')
    )
    
    container = get_app_container()
    handler = container.create_conversation_handler()
    conversation = handler.handle(command)
    
    return created(data=conversation.to_dict(include_messages=False))


@bp.route('', methods=['GET'])
@optional_auth
def list_conversations():
    """
    列出对话
    
    Query Parameters:
        offset: int (default: 0)
        limit: int (default: 20)
    
    Returns:
        {
            "code": 0,
            "message": "success",
            "data": {
                "items": [...],
                "offset": 0,
                "limit": 20,
                "total": 10
            }
        }
    """
    user_id = getattr(g, 'user_id', None) or 'anonymous'
    offset = request.args.get('offset', 0, type=int)
    limit = request.args.get('limit', 20, type=int)
    
    query = ListConversationsQuery(
        user_id=user_id,
        offset=offset,
        limit=limit
    )
    
    container = get_app_container()
    handler = container.list_conversations_handler()
    result = handler.handle(query)
    
    return success(data=result)


@bp.route('/<int:conversation_id>', methods=['GET'])
@optional_auth
def get_conversation(conversation_id):
    """
    获取对话详情
    
    Returns:
        {
            "code": 0,
            "message": "success",
            "data": {
                "id": 1,
                "title": "...",
                "messages": [...]
            }
        }
    """
    user_id = getattr(g, 'user_id', None) or 'anonymous'
    
    query = GetConversationQuery(
        conversation_id=conversation_id,
        user_id=user_id
    )
    
    container = get_app_container()
    handler = container.get_conversation_handler()
    result = handler.handle(query)
    
    return success(data=result)


@bp.route('/<int:conversation_id>', methods=['DELETE'])
@optional_auth
def delete_conversation(conversation_id):
    """
    删除对话
    
    Returns:
        {
            "code": 0,
            "message": "success"
        }
    """
    user_id = getattr(g, 'user_id', None) or 'anonymous'
    
    # 验证权限
    query = GetConversationQuery(
        conversation_id=conversation_id,
        user_id=user_id
    )
    container = get_app_container()
    handler = container.get_conversation_handler()
    handler.handle(query)  # 验证存在性和权限
    
    # 删除对话
    repo = container.conversation_repository()
    repo.delete(conversation_id)
    repo.commit()
    
    return success()


@bp.route('/<int:conversation_id>/messages', methods=['POST'])
@require_auth
def send_message(conversation_id):
    """
    发送消息
    
    Request Body:
        {
            "content": "用户问题"
        }
    
    Returns:
        {
            "code": 0,
            "message": "success",
            "data": {
                "user_message": {...},
                "ai_message": {...}
            }
        }
    """
    data = request.get_json()
    user_id = g.user_id  # require_auth 已注入；拒匿名后无 'anonymous' 兜底

    # 决策 4（08.1-02）：principal 解析（碰 Flask g）只在 interfaces 层完成，经 Command 透传进 application。
    # 角色统一来自 access_role_bindings（治理主体权威源），非 JWT roles。
    pc = principal_context_from_bearer(source="datachat_bearer")

    command = SendMessageCommand(
        conversation_id=conversation_id,
        user_id=user_id,
        content=data['content'],
        principal_context=pc,
        viewer_roles=pc.get("roles") or [],
    )
    
    container = get_app_container()
    handler = container.send_message_handler()
    
    # 异步执行
    result = handler.handle(command)
    
    return success(data=result)
