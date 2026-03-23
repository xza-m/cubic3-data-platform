"""
应用中心事件处理器

处理应用实例和应用执行的生命周期事件
"""
from typing import Dict, Any, Optional, List
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


def on_execution_started(event_dict: Dict[str, Any]):
    """
    处理应用执行开始事件
    
    Args:
        event_dict: 事件数据字典
    """
    try:
        logger.info(
            "Application execution started",
            extra={
                "event_id": event_dict.get("event_id"),
                "execution_id": event_dict.get("entity_id"),
                "instance_id": event_dict["data"].get("instance_id"),
                "app_code": event_dict["data"].get("app_code"),
                "trigger_type": event_dict["data"].get("trigger_type")
            }
        )
    except Exception as e:
        logger.error(f"Error handling execution started event: {str(e)}")


def on_execution_completed(event_dict: Dict[str, Any]):
    """
    处理应用执行完成事件
    
    Args:
        event_dict: 事件数据字典
    """
    try:
        data = event_dict.get("data", {})
        logger.info(
            "Application execution completed",
            extra={
                "event_id": event_dict.get("event_id"),
                "execution_id": event_dict.get("entity_id"),
                "instance_id": data.get("instance_id"),
                "app_code": data.get("app_code"),
                "duration_ms": data.get("duration_ms")
            }
        )
        
        # 检查事件级联配置并触发
        _trigger_cascade_applications(event_dict)
        
        # 触发订阅分发
        _deliver_to_subscriptions(
            event_type='app.execution.completed',
            event_dict=event_dict
        )
        
    except Exception as e:
        logger.error(f"Error handling execution completed event: {str(e)}")


def on_execution_failed(event_dict: Dict[str, Any]):
    """
    处理应用执行失败事件
    
    Args:
        event_dict: 事件数据字典
    """
    try:
        data = event_dict.get("data", {})
        logger.error(
            "Application execution failed",
            extra={
                "event_id": event_dict.get("event_id"),
                "execution_id": event_dict.get("entity_id"),
                "instance_id": data.get("instance_id"),
                "app_code": data.get("app_code"),
                "error_message": data.get("error_message")
            }
        )
        
        # 触发订阅分发（失败告警）
        _deliver_to_subscriptions(
            event_type='app.execution.failed',
            event_dict=event_dict
        )
        
    except Exception as e:
        logger.error(f"Error handling execution failed event: {str(e)}")


def _deliver_to_subscriptions(event_type: str, event_dict: Dict[str, Any]):
    """
    将事件分发到匹配的订阅渠道
    
    Args:
        event_type: 事件类型
        event_dict: 事件数据字典
    """
    try:
        from app.di.container import get_container
        
        data = event_dict.get("data", {})
        instance_id = data.get("instance_id")
        
        if not instance_id:
            logger.warning("No instance_id in event, skipping subscription delivery")
            return
        
        delivery_service = get_container().delivery_service()
        result = delivery_service.deliver_event(
            event_type=event_type,
            event_data=data,
            source_app_instance_id=instance_id
        )
        
        if result['total_subscriptions'] > 0:
            logger.info(
                f"Subscription delivery completed",
                extra={
                    "event_type": event_type,
                    "total": result['total_subscriptions'],
                    "successful": result['successful'],
                    "failed": result['failed']
                }
            )
    except Exception as e:
        logger.error(f"Error in subscription delivery: {str(e)}", exc_info=True)


def _trigger_cascade_applications(event_dict: Dict[str, Any]):
    """
    检查事件级联配置并触发相应的应用实例
    
    Args:
        event_dict: 事件数据字典
    """
    try:
        from app.di.container import get_container
        
        # 通过 DI 容器获取 Repository，查询所有启用事件触发的应用实例
        repo = get_container().app_instance_repository()
        instances = repo.find_enabled_event_instances()
        
        if not instances:
            logger.debug("No event-triggered instances found")
            return
        
        event_type = event_dict.get("event_type")
        triggered_count = 0
        
        for instance in instances:
            # 检查级联配置
            trigger_config = instance.config.get('trigger_on_event', {})
            if not trigger_config.get('enabled'):
                continue
            
            # 检查事件类型匹配
            if not _match_event_type(event_type, trigger_config.get('event_types', [])):
                continue
            
            # 检查条件匹配
            if not _check_conditions(event_dict, trigger_config.get('conditions', {})):
                continue
            
            # 循环检测
            if _check_cascade_loop(instance.id, event_dict):
                logger.warning(
                    f"Cascade loop detected for instance {instance.id}, skipping",
                    extra={"instance_id": instance.id, "instance_name": instance.name}
                )
                continue
            
            # 触发执行
            _execute_cascade_instance(instance, event_dict, trigger_config)
            triggered_count += 1
        
        if triggered_count > 0:
            logger.info(
                f"Triggered {triggered_count} cascade application(s)",
                extra={"event_id": event_dict.get("event_id"), "triggered_count": triggered_count}
            )
    
    except Exception as e:
        logger.error(f"Error in cascade trigger: {str(e)}", exc_info=True)


def _match_event_type(event_type: str, allowed_types: List[str]) -> bool:
    """
    检查事件类型是否匹配
    
    Args:
        event_type: 实际事件类型
        allowed_types: 允许的事件类型列表
    
    Returns:
        是否匹配
    """
    if not allowed_types:
        return False
    
    return event_type in allowed_types


def _check_conditions(event_dict: Dict[str, Any], conditions: Dict[str, Any]) -> bool:
    """
    检查事件是否匹配条件
    
    Args:
        event_dict: 事件数据字典
        conditions: 条件配置
    
    Returns:
        是否匹配所有条件
    """
    if not conditions:
        return True  # 无条件则匹配
    
    data = event_dict.get('data', {})
    
    for key, expected_value in conditions.items():
        actual_value = data.get(key)
        
        # 支持简单的相等匹配
        if actual_value != expected_value:
            logger.debug(
                f"Condition not matched: {key}={actual_value}, expected={expected_value}"
            )
            return False
    
    return True


def _check_cascade_loop(instance_id: int, event_dict: Dict[str, Any], max_depth: int = 3) -> bool:
    """
    检查事件级联是否会导致循环
    
    Args:
        instance_id: 当前实例 ID
        event_dict: 事件数据字典
        max_depth: 最大级联深度
    
    Returns:
        True 表示检测到循环，应阻止触发
    """
    # 从事件元数据中提取调用链
    metadata = event_dict.get('metadata', {})
    cascade_chain = metadata.get('cascade_chain', [])
    
    # 检查当前实例是否已在调用链中（直接循环）
    if instance_id in cascade_chain:
        logger.warning(
            f"Direct loop detected: instance {instance_id} already in chain {cascade_chain}"
        )
        return True
    
    # 检查调用深度
    if len(cascade_chain) >= max_depth:
        logger.warning(
            f"Cascade depth limit reached: {len(cascade_chain)} >= {max_depth}"
        )
        return True
    
    return False


def _execute_cascade_instance(
    instance: 'AppInstance',
    event_dict: Dict[str, Any],
    trigger_config: Dict[str, Any]
):
    """
    执行级联触发的应用实例
    
    Args:
        instance: 应用实例
        event_dict: 触发事件数据
        trigger_config: 触发配置
    """
    try:
        from app.di.utils import get_app_container
        
        # 获取执行服务
        container = get_app_container()
        execution_service = container.execution_service()
        
        # 构建级联调用链
        metadata = event_dict.get('metadata', {})
        cascade_chain = metadata.get('cascade_chain', [])
        source_instance_id = event_dict.get('data', {}).get('instance_id')
        
        # 准备额外数据
        extra_data = {
            'triggered_by_event': event_dict.get('event_id'),
            'triggered_by_instance': source_instance_id,
            'cascade_chain': cascade_chain + [source_instance_id] if source_instance_id else cascade_chain
        }
        
        # 获取延迟配置
        delay_seconds = trigger_config.get('delay_seconds', 0)
        
        if delay_seconds > 0:
            # 延迟触发（通过 RQ 延迟队列）
            from datetime import timedelta
            from app.infrastructure.queue import get_queue
            queue = get_queue()
            queue.enqueue_in(
                timedelta(seconds=delay_seconds),
                'app.application.services.app_center.execution_service.enqueue_instance_execution',
                instance_id=instance.id,
                trigger_type='event',
                triggered_by='event_cascade',
                extra_data=extra_data
            )
            logger.info(
                f"Scheduled cascade execution with {delay_seconds}s delay",
                extra={"instance_id": instance.id, "delay_seconds": delay_seconds}
            )
        else:
            # 立即触发
            execution_id = execution_service.execute_instance(
                instance_id=instance.id,
                trigger_type='event',
                triggered_by='event_cascade',
                extra_data=extra_data
            )
            logger.info(
                f"Triggered cascade execution immediately",
                extra={"instance_id": instance.id, "execution_id": execution_id}
            )
    
    except Exception as e:
        logger.error(
            f"Failed to execute cascade instance {instance.id}: {str(e)}",
            exc_info=True
        )
