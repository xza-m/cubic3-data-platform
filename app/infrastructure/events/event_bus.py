"""
异步事件总线
基于RQ队列实现异步事件处理
"""
from typing import Dict, List, Type, Callable, Union
import inspect
from app.domain.events.base import DomainEvent
from app.infrastructure.tasks.task_queue import TaskQueue
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)

# 类型别名
EventHandler = Union[Callable[[DomainEvent], None], str]


class EventBus:
    """
    事件总线（异步）
    
    负责事件的发布和订阅管理
    事件处理通过RQ队列异步执行
    
    特性：
    - 支持 Callable 和字符串路径两种订阅方式
    - 自动推断处理器路径（从 Callable）
    - 类型安全（使用 Callable 时）
    """
    
    def __init__(self, task_queue: TaskQueue):
        """
        初始化事件总线
        
        Args:
            task_queue: RQ任务队列
        """
        self.task_queue = task_queue
        self._handlers: Dict[Type[DomainEvent], List[str]] = {}
    
    def subscribe(self, event_type: Type[DomainEvent], handler: EventHandler):
        """
        订阅事件
        
        Args:
            event_type: 事件类型（类）
            handler: 事件处理器
                    - Callable: 处理器函数（推荐，类型安全）
                    - str: 处理器路径（向后兼容）
                      格式：'module.path.function_name'
                      示例：'app.infrastructure.events.handlers.datasource_handler.on_datasource_created'
        
        示例：
            # 推荐方式（类型安全）
            from app.infrastructure.events.handlers.datasource_handler import on_datasource_created
            event_bus.subscribe(DatasourceCreated, on_datasource_created)
            
            # 向后兼容方式
            event_bus.subscribe(
                DatasourceCreated,
                'app.infrastructure.events.handlers.datasource_handler.on_datasource_created'
            )
        """
        if event_type not in self._handlers:
            self._handlers[event_type] = []
        
        # 将 Callable 转换为路径字符串
        if callable(handler):
            handler_path = self._get_handler_path(handler)
        else:
            handler_path = handler
        
        if handler_path not in self._handlers[event_type]:
            self._handlers[event_type].append(handler_path)
            logger.info(
                "Event handler subscribed",
                event_type=event_type.__name__,
                handler=handler_path
            )
    
    def _get_handler_path(self, handler: Callable) -> str:
        """
        从 Callable 推断处理器路径
        
        Args:
            handler: 处理器函数
        
        Returns:
            处理器路径字符串
        """
        module = inspect.getmodule(handler)
        if module is None:
            raise ValueError(f"Cannot determine module for handler: {handler}")
        
        # 获取完整路径
        module_path = module.__name__
        handler_name = handler.__name__
        
        return f"{module_path}.{handler_name}"
    
    def publish(self, event: DomainEvent):
        """
        发布事件（异步）
        
        将事件推入RQ队列，由Worker异步处理
        
        Args:
            event: 领域事件实例
        """
        event_type = type(event)
        handlers = self._handlers.get(event_type, [])
        
        if not handlers:
            logger.debug(
                "No handlers for event",
                event_type=event_type.__name__
            )
            return
        
        event_dict = event.to_dict()
        
        for handler_path in handlers:
            try:
                # 推入RQ队列
                job = self.task_queue.enqueue(
                    'app.infrastructure.events.dispatcher.dispatch_event',
                    event_dict=event_dict,
                    handler_path=handler_path
                )
                
                logger.info(
                    "Event published to queue",
                    event_type=event_type.__name__,
                    event_id=event_dict.get('event_id'),
                    handler=handler_path,
                    job_id=job.id if job else None
                )
            except Exception as e:
                logger.error(
                    f"Failed to publish event: {e}",
                    event_type=event_type.__name__,
                    handler=handler_path,
                    exc_info=True
                )
    
    def publish_batch(self, events: List[DomainEvent]):
        """
        批量发布事件
        
        Args:
            events: 事件列表
        """
        for event in events:
            self.publish(event)
    
    def get_subscriptions(self) -> Dict[str, List[str]]:
        """
        获取所有订阅关系
        
        Returns:
            事件类型 -> 处理器列表的映射
        """
        return {
            event_type.__name__: handlers
            for event_type, handlers in self._handlers.items()
        }
