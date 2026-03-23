"""
提取任务事件处理器
"""
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


def on_task_created(event_dict: dict):
    """处理任务创建事件"""
    try:
        logger.info(
            f"Extraction task created",
            extra={
                'task_id': event_dict.get('task_id'),
                'task_name': event_dict.get('task_name'),
                'dataset_id': event_dict.get('dataset_id')
            }
        )
        
        # TODO: 记录审计日志
        
    except Exception as e:
        logger.error(f"Failed to handle TaskCreated event: {e}", exc_info=True)
        raise


def on_task_executed(event_dict: dict):
    """处理任务执行事件"""
    try:
        logger.info(
            f"Extraction task executed",
            extra={
                'task_id': event_dict.get('task_id'),
                'run_id': event_dict.get('run_id'),
                'executor_id': event_dict.get('executor_id')
            }
        )
        
        # TODO: 更新统计信息
        
    except Exception as e:
        logger.error(f"Failed to handle TaskExecuted event: {e}", exc_info=True)
        raise


def on_task_execution_completed(event_dict: dict):
    """处理任务执行完成事件"""
    try:
        logger.info(
            f"Extraction task completed",
            extra={
                'task_id': event_dict.get('task_id'),
                'run_id': event_dict.get('run_id'),
                'success': event_dict.get('success'),
                'extracted_rows': event_dict.get('extracted_rows')
            }
        )
        
        # TODO: 发送通知
        # TODO: 更新任务统计
        
    except Exception as e:
        logger.error(f"Failed to handle TaskExecutionCompleted event: {e}", exc_info=True)
        raise


def on_task_execution_failed(event_dict: dict):
    """处理任务执行失败事件"""
    try:
        logger.error(
            f"Extraction task failed",
            extra={
                'task_id': event_dict.get('task_id'),
                'run_id': event_dict.get('run_id'),
                'error_message': event_dict.get('error_message'),
                'retry_count': event_dict.get('retry_count')
            }
        )
        
        # TODO: 发送告警通知
        
    except Exception as e:
        logger.error(f"Failed to handle TaskExecutionFailed event: {e}", exc_info=True)
        raise
