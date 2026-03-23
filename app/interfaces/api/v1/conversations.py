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
from app.interfaces.api.middleware.auth import optional_auth

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
        dataset_id=data['dataset_id'],
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
    
    return success()


@bp.route('/<int:conversation_id>/messages', methods=['POST'])
@optional_auth
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
    user_id = getattr(g, 'user_id', None) or 'anonymous'
    
    command = SendMessageCommand(
        conversation_id=conversation_id,
        user_id=user_id,
        content=data['content']
    )
    
    container = get_app_container()
    handler = container.send_message_handler()
    
    # 异步执行
    result = handler.handle(command)
    
    return success(data=result)
