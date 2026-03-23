"""
事件分发器
用于在RQ Worker中执行事件处理器
"""
import importlib
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


def dispatch_event(event_dict: dict, handler_path: str):
    """
    分发事件到处理器（RQ Job）
    
    此函数会在RQ Worker中执行
    
    Args:
        event_dict: 事件数据字典
        handler_path: 处理器路径
    
    Raises:
        Exception: 处理失败时抛出异常，触发RQ重试
    """
    try:
        # 动态导入处理器
        module_path, function_name = handler_path.rsplit('.', 1)
        module = importlib.import_module(module_path)
        handler = getattr(module, function_name)
        
        # 执行处理器
        handler(event_dict)
        
        logger.info(
            f"Event handled successfully",
            extra={
                'event_type': event_dict.get('event_type'),
                'event_id': event_dict.get('event_id'),
                'handler': handler_path
            }
        )
        
    except ImportError as e:
        logger.error(
            f"Failed to import event handler: {e}",
            extra={
                'handler_path': handler_path,
                'event_dict': event_dict
            },
            exc_info=True
        )
        raise
    
    except AttributeError as e:
        logger.error(
            f"Handler function not found: {e}",
            extra={
                'handler_path': handler_path,
                'event_dict': event_dict
            },
            exc_info=True
        )
        raise
    
    except Exception as e:
        logger.error(
            f"Event handling failed: {e}",
            extra={
                'event_dict': event_dict,
                'handler_path': handler_path
            },
            exc_info=True
        )
        raise
