"""
应用中心模块领域事件

定义应用实例和应用执行的生命周期事件，支持事件驱动架构。
"""
from datetime import datetime
from typing import Dict, Any, Optional
from app.domain.events.base import DomainEvent


class AppInstanceCreated(DomainEvent):
    """应用实例创建事件"""
    
    def __init__(
        self,
        instance_id: int,
        app_code: str,
        name: str,
        schedule_type: str,
        enabled: bool,
        config: Dict[str, Any]
    ):
        super().__init__(
            _event_type="app.instance.created",
            entity_type="app_instance",
            entity_id=instance_id,
            data={
                "instance_id": instance_id,
                "app_code": app_code,
                "name": name,
                "schedule_type": schedule_type,
                "enabled": enabled,
                "config": config
            }
        )


class AppInstanceEnabled(DomainEvent):
    """应用实例启用事件"""
    
    def __init__(self, instance_id: int, app_code: str, name: str):
        super().__init__(
            _event_type="app.instance.enabled",
            entity_type="app_instance",
            entity_id=instance_id,
            data={
                "instance_id": instance_id,
                "app_code": app_code,
                "name": name
            }
        )


class AppInstanceDisabled(DomainEvent):
    """应用实例禁用事件"""
    
    def __init__(self, instance_id: int, app_code: str, name: str):
        super().__init__(
            _event_type="app.instance.disabled",
            entity_type="app_instance",
            entity_id=instance_id,
            data={
                "instance_id": instance_id,
                "app_code": app_code,
                "name": name
            }
        )


class AppInstanceDeleted(DomainEvent):
    """应用实例删除事件"""
    
    def __init__(self, instance_id: int, app_code: str, name: str):
        super().__init__(
            _event_type="app.instance.deleted",
            entity_type="app_instance",
            entity_id=instance_id,
            data={
                "instance_id": instance_id,
                "app_code": app_code,
                "name": name
            }
        )


class AppExecutionStarted(DomainEvent):
    """应用开始执行事件"""
    
    def __init__(
        self,
        execution_id: int,
        instance_id: int,
        app_code: str,
        trigger_type: str,
        triggered_by: Optional[str] = None
    ):
        super().__init__(
            _event_type="app.execution.started",
            entity_type="app_execution",
            entity_id=execution_id,
            data={
                "execution_id": execution_id,
                "instance_id": instance_id,
                "app_code": app_code,
                "trigger_type": trigger_type,
                "triggered_by": triggered_by
            }
        )


class AppExecutionCompleted(DomainEvent):
    """应用执行成功完成事件"""
    
    def __init__(
        self,
        execution_id: int,
        instance_id: int,
        app_code: str,
        instance_name: str,
        trigger_type: str,
        duration_ms: int,
        output: Optional[Dict[str, Any]] = None
    ):
        super().__init__(
            _event_type="app.execution.completed",
            entity_type="app_execution",
            entity_id=execution_id,
            data={
                "execution_id": execution_id,
                "instance_id": instance_id,
                "app_code": app_code,
                "instance_name": instance_name,
                "trigger_type": trigger_type,
                "duration_ms": duration_ms,
                "output": output or {}
            }
        )


class AppExecutionFailed(DomainEvent):
    """应用执行失败事件"""
    
    def __init__(
        self,
        execution_id: int,
        instance_id: int,
        app_code: str,
        instance_name: str,
        trigger_type: str,
        error_message: str,
        error_type: Optional[str] = None
    ):
        super().__init__(
            _event_type="app.execution.failed",
            entity_type="app_execution",
            entity_id=execution_id,
            data={
                "execution_id": execution_id,
                "instance_id": instance_id,
                "app_code": app_code,
                "instance_name": instance_name,
                "trigger_type": trigger_type,
                "error_message": error_message,
                "error_type": error_type
            }
        )
