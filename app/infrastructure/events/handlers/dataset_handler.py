"""
数据集事件处理器
"""
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


def on_dataset_created(event_dict: dict):
    """处理数据集创建事件"""
    try:
        logger.info(
            f"Dataset created",
            extra={
                'dataset_id': event_dict.get('dataset_id'),
                'dataset_code': event_dict.get('dataset_code'),
                'dataset_name': event_dict.get('dataset_name')
            }
        )
        
        # TODO: 记录审计日志
        # TODO: 更新数据目录
        
    except Exception as e:
        logger.error(f"Failed to handle DatasetCreated event: {e}", exc_info=True)
        raise


def on_dataset_updated(event_dict: dict):
    """处理数据集更新事件"""
    try:
        logger.info(
            f"Dataset updated",
            extra={
                'dataset_id': event_dict.get('dataset_id'),
                'changes': event_dict.get('changes')
            }
        )
    except Exception as e:
        logger.error(f"Failed to handle DatasetUpdated event: {e}", exc_info=True)
        raise


def on_dataset_deleted(event_dict: dict):
    """处理数据集删除事件"""
    try:
        logger.info(
            f"Dataset deleted",
            extra={
                'dataset_id': event_dict.get('dataset_id'),
                'dataset_code': event_dict.get('dataset_code')
            }
        )
        
        # TODO: 清理关联的提取任务
        
    except Exception as e:
        logger.error(f"Failed to handle DatasetDeleted event: {e}", exc_info=True)
        raise
