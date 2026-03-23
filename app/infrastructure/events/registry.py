"""
事件处理器注册
"""
from app.infrastructure.events.event_bus import EventBus
from app.domain.events.datasource_events import (
    DatasourceCreated,
    DatasourceUpdated,
    DatasourceDeleted,
    DatasourceConnectionTested
)
from app.domain.events.dataset_events import (
    DatasetCreated,
    DatasetUpdated,
    DatasetDeleted,
    DatasetSchemaSynced
)
from app.domain.events.extraction_events import (
    TaskCreated,
    TaskExecuted,
    TaskExecutionCompleted,
    TaskExecutionFailed,
    TaskDeleted
)
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


def register_event_handlers(event_bus: EventBus):
    """
    注册所有事件处理器
    
    Args:
        event_bus: 事件总线实例
    """
    logger.info("Registering event handlers...")
    
    # ========================================================================
    # Datasource 事件处理器
    # ========================================================================
    
    event_bus.subscribe(
        DatasourceCreated,
        'app.infrastructure.events.handlers.datasource_handler.on_datasource_created'
    )
    
    event_bus.subscribe(
        DatasourceUpdated,
        'app.infrastructure.events.handlers.datasource_handler.on_datasource_updated'
    )
    
    event_bus.subscribe(
        DatasourceDeleted,
        'app.infrastructure.events.handlers.datasource_handler.on_datasource_deleted'
    )
    
    # ========================================================================
    # Dataset 事件处理器
    # ========================================================================
    
    event_bus.subscribe(
        DatasetCreated,
        'app.infrastructure.events.handlers.dataset_handler.on_dataset_created'
    )
    
    event_bus.subscribe(
        DatasetUpdated,
        'app.infrastructure.events.handlers.dataset_handler.on_dataset_updated'
    )
    
    event_bus.subscribe(
        DatasetDeleted,
        'app.infrastructure.events.handlers.dataset_handler.on_dataset_deleted'
    )
    
    # ========================================================================
    # Extraction 事件处理器
    # ========================================================================
    
    event_bus.subscribe(
        TaskCreated,
        'app.infrastructure.events.handlers.extraction_handler.on_task_created'
    )
    
    event_bus.subscribe(
        TaskExecuted,
        'app.infrastructure.events.handlers.extraction_handler.on_task_executed'
    )
    
    event_bus.subscribe(
        TaskExecutionCompleted,
        'app.infrastructure.events.handlers.extraction_handler.on_task_execution_completed'
    )
    
    event_bus.subscribe(
        TaskExecutionFailed,
        'app.infrastructure.events.handlers.extraction_handler.on_task_execution_failed'
    )
    
    # ========================================================================
    # App Center 事件处理器
    # ========================================================================
    
    from app.domain.events.app_events import (
        AppExecutionStarted,
        AppExecutionCompleted,
        AppExecutionFailed
    )
    
    event_bus.subscribe(
        AppExecutionStarted,
        'app.infrastructure.events.handlers.app_handler.on_execution_started'
    )
    
    event_bus.subscribe(
        AppExecutionCompleted,
        'app.infrastructure.events.handlers.app_handler.on_execution_completed'
    )
    
    event_bus.subscribe(
        AppExecutionFailed,
        'app.infrastructure.events.handlers.app_handler.on_execution_failed'
    )

    
    logger.info(
        f"Event handlers registered",
        extra={'subscriptions': event_bus.get_subscriptions()}
    )
