"""
创建对话处理器
"""
from datetime import datetime
from app.shared.utils.time import utcnow
from app.application.conversation.commands.create_conversation import CreateConversationCommand
from app.domain.entities.conversation import Conversation
from app.domain.ports.repositories.conversation_repository import IConversationRepository
from app.infrastructure.repositories.dataset_repository import DatasetRepository
from app.shared.exceptions import ApplicationException
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class CreateConversationHandler:
    """创建对话处理器"""
    
    def __init__(
        self,
        conversation_repository: IConversationRepository,
        dataset_repository: DatasetRepository
    ):
        self.conversation_repository = conversation_repository
        self.dataset_repository = dataset_repository
    
    def handle(self, command: CreateConversationCommand) -> Conversation:
        """
        处理创建对话命令
        
        Args:
            command: 创建对话命令
        
        Returns:
            创建的对话实体
        """
        logger.info(
            "Creating conversation",
            dataset_id=command.dataset_id,
            user_id=command.user_id
        )
        
        # 验证数据集存在
        dataset = self.dataset_repository.find_by_id(command.dataset_id)
        if not dataset:
            raise ApplicationException(f"数据集不存在: {command.dataset_id}")
        
        if not dataset.is_ready():
            raise ApplicationException(f"数据集未就绪: {dataset.dataset_name}")
        
        # 创建对话
        title = command.title or f"与 {dataset.dataset_name} 的对话"
        
        conversation = Conversation(
            title=title,
            dataset_id=command.dataset_id,
            user_id=command.user_id,
            description=command.description,
            context={},
            created_at=utcnow(),
            updated_at=utcnow()
        )
        
        conversation = self.conversation_repository.create(conversation)
        # 仓储绑定的是容器 scoped_session（非 Flask db.session），事务必须在同一 session 上提交
        self.conversation_repository.commit()
        
        logger.info(
            "Conversation created successfully",
            conversation_id=conversation.id,
            dataset_id=command.dataset_id
        )
        
        return conversation
