"""
订阅服务

负责订阅规则的 CRUD 操作和事件匹配
"""
from typing import List, Optional, Dict, Any
from datetime import datetime
from app.shared.utils.time import utcnow

from app.domain.entities.config.subscription import Subscription
from app.domain.entities.config.channel import Channel
from app.domain.entities import AppInstance, AppDefinition
from app.infrastructure.repositories.subscription_repository import SubscriptionRepository
from app.infrastructure.repositories.app_instance_repository import AppInstanceRepository
from app.infrastructure.repositories.channel_repository import ChannelRepository
from app.shared.exceptions import ValidationError, NotFoundError


class SubscriptionService:
    """订阅服务"""
    
    # 支持的事件类型
    SUPPORTED_EVENT_TYPES = [
        'app.instance.created',
        'app.instance.enabled',
        'app.instance.disabled',
        'app.instance.deleted',
        'app.execution.started',
        'app.execution.completed',
        'app.execution.failed',
        'extraction.completed',
        'extraction.failed'
    ]
    
    def __init__(
        self,
        subscription_repository: SubscriptionRepository,
        app_instance_repository: AppInstanceRepository,
        channel_repository: ChannelRepository
    ):
        """
        初始化
        
        Args:
            subscription_repository: 订阅仓储
            app_instance_repository: 应用实例仓储
            channel_repository: 渠道仓储
        """
        self.subscription_repository = subscription_repository
        self.app_instance_repository = app_instance_repository
        self.channel_repository = channel_repository
    
    def create_subscription(
        self,
        name: str,
        app_instance_id: int,
        channel_id: int,
        event_types: List[str],
        filter_conditions: Optional[Dict[str, Any]] = None,
        delivery_config: Optional[Dict[str, Any]] = None,
        description: Optional[str] = None,
        created_by: Optional[str] = None,
        enabled: bool = True
    ) -> Dict[str, Any]:
        """
        创建订阅
        
        Args:
            name: 订阅名称
            app_instance_id: 应用实例ID
            channel_id: 渠道ID
            event_types: 订阅的事件类型列表
            filter_conditions: 过滤条件
            delivery_config: 分发配置
            description: 描述
            created_by: 创建者
            enabled: 是否启用
        
        Returns:
            创建的订阅信息
        
        Raises:
            NotFoundError: 应用实例或渠道不存在
            ValidationError: 参数验证失败
        """
        # 1. 验证应用实例存在
        app_instance = self.app_instance_repository.find_by_id(app_instance_id)
        if not app_instance:
            raise NotFoundError(f"应用实例 {app_instance_id} 不存在")
        
        # 2. 验证渠道存在
        channel = self.channel_repository.find_by_id(channel_id)
        if not channel:
            raise NotFoundError(f"渠道 {channel_id} 不存在")
        
        # 3. 验证事件类型
        invalid_types = [et for et in event_types if et not in self.SUPPORTED_EVENT_TYPES]
        if invalid_types:
            raise ValidationError(f"不支持的事件类型: {invalid_types}")
        
        if not event_types:
            raise ValidationError("至少需要订阅一个事件类型")
        
        # 4. 创建订阅
        subscription = Subscription(
            name=name,
            description=description,
            app_instance_id=app_instance_id,
            channel_id=channel_id,
            event_types=event_types,
            filter_conditions=filter_conditions or {},
            delivery_config=delivery_config or {},
            enabled=enabled,
            created_by=created_by
        )
        
        subscription = self.subscription_repository.save(subscription)
        
        return subscription.to_dict(include_relations=True)
    
    def update_subscription(
        self,
        subscription_id: int,
        name: Optional[str] = None,
        event_types: Optional[List[str]] = None,
        filter_conditions: Optional[Dict[str, Any]] = None,
        delivery_config: Optional[Dict[str, Any]] = None,
        description: Optional[str] = None,
        enabled: Optional[bool] = None
    ) -> Dict[str, Any]:
        """
        更新订阅
        
        Args:
            subscription_id: 订阅ID
            name: 新名称
            event_types: 新的事件类型列表
            filter_conditions: 新的过滤条件
            delivery_config: 新的分发配置
            description: 新描述
            enabled: 是否启用
        
        Returns:
            更新后的订阅信息
        
        Raises:
            NotFoundError: 订阅不存在
            ValidationError: 参数验证失败
        """
        subscription = self.subscription_repository.find_by_id(subscription_id)
        if not subscription:
            raise NotFoundError(f"订阅 {subscription_id} 不存在")
        
        if name is not None:
            subscription.name = name
        if description is not None:
            subscription.description = description
        if event_types is not None:
            # 验证事件类型
            invalid_types = [et for et in event_types if et not in self.SUPPORTED_EVENT_TYPES]
            if invalid_types:
                raise ValidationError(f"不支持的事件类型: {invalid_types}")
            if not event_types:
                raise ValidationError("至少需要订阅一个事件类型")
            subscription.event_types = event_types
        if filter_conditions is not None:
            subscription.filter_conditions = filter_conditions
        if delivery_config is not None:
            subscription.delivery_config = delivery_config
        if enabled is not None:
            subscription.enabled = enabled
        
        subscription.updated_at = utcnow()
        self.subscription_repository.commit()
        
        return subscription.to_dict(include_relations=True)
    
    def delete_subscription(self, subscription_id: int) -> bool:
        """
        删除订阅
        
        Args:
            subscription_id: 订阅ID
        
        Returns:
            是否删除成功
        
        Raises:
            NotFoundError: 订阅不存在
        """
        subscription = self.subscription_repository.find_by_id(subscription_id)
        if not subscription:
            raise NotFoundError(f"订阅 {subscription_id} 不存在")
        
        self.subscription_repository.delete(subscription)
        
        return True
    
    def get_subscription(self, subscription_id: int) -> Dict[str, Any]:
        """
        获取订阅详情
        
        Args:
            subscription_id: 订阅ID
        
        Returns:
            订阅信息
        
        Raises:
            NotFoundError: 订阅不存在
        """
        subscription = self.subscription_repository.find_by_id_with_relations(subscription_id)
        
        if not subscription:
            raise NotFoundError(f"订阅 {subscription_id} 不存在")
        
        return subscription.to_dict(include_relations=True)
    
    def list_subscriptions(
        self,
        app_instance_id: Optional[int] = None,
        channel_id: Optional[int] = None,
        enabled: Optional[bool] = None,
        page: int = 1,
        page_size: int = 20
    ) -> Dict[str, Any]:
        """
        获取订阅列表
        
        Args:
            app_instance_id: 按应用实例过滤
            channel_id: 按渠道过滤
            enabled: 按启用状态过滤
            page: 页码
            page_size: 每页数量
        
        Returns:
            分页的订阅列表
        """
        subscriptions, total = self.subscription_repository.find_all(
            app_instance_id=app_instance_id,
            channel_id=channel_id,
            enabled=enabled,
            page=page,
            page_size=page_size
        )
        
        return {
            'items': [s.to_dict(include_relations=True) for s in subscriptions],
            'total': total,
            'page': page,
            'page_size': page_size,
            'pages': (total + page_size - 1) // page_size
        }
    
    def get_subscriptions_by_app_instance(self, app_instance_id: int) -> List[Dict[str, Any]]:
        """
        获取应用实例的所有订阅（快捷查询）
        
        Args:
            app_instance_id: 应用实例ID
        
        Returns:
            订阅列表
        """
        subscriptions = self.subscription_repository.find_by_app_instance(
            app_instance_id=app_instance_id,
            enabled_only=True
        )
        
        return [s.to_dict(include_relations=True) for s in subscriptions]
    
    def find_matching_subscriptions(
        self,
        event_type: str,
        event_data: Dict[str, Any]
    ) -> List[Subscription]:
        """
        查找匹配事件的订阅
        
        Args:
            event_type: 事件类型
            event_data: 事件数据
        
        Returns:
            匹配的订阅列表
        """
        # 获取订阅该事件类型的所有启用订阅
        subscriptions = self.subscription_repository.find_matching_subscriptions(event_type)
        
        # 过滤匹配条件
        matching = []
        for sub in subscriptions:
            if sub.matches_event(event_type, event_data):
                matching.append(sub)
        
        return matching
    
    def enable_subscription(self, subscription_id: int) -> Dict[str, Any]:
        """启用订阅"""
        subscription = self.subscription_repository.find_by_id(subscription_id)
        if not subscription:
            raise NotFoundError(f"订阅 {subscription_id} 不存在")
        
        subscription.enable()
        self.subscription_repository.commit()
        
        return subscription.to_dict(include_relations=True)
    
    def disable_subscription(self, subscription_id: int) -> Dict[str, Any]:
        """禁用订阅"""
        subscription = self.subscription_repository.find_by_id(subscription_id)
        if not subscription:
            raise NotFoundError(f"订阅 {subscription_id} 不存在")
        
        subscription.disable()
        self.subscription_repository.commit()
        
        return subscription.to_dict(include_relations=True)

    # ========================================================================
    # 分发日志（触发历史）
    # ========================================================================

    def list_delivery_history(
        self,
        subscription_id: int,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """
        分页获取订阅分发历史

        Args:
            subscription_id: 订阅ID
            page: 页码
            page_size: 每页数量

        Returns:
            分页结果

        Raises:
            NotFoundError: 订阅不存在
        """
        subscription = self.subscription_repository.find_by_id(subscription_id)
        if not subscription:
            raise NotFoundError(f"订阅 {subscription_id} 不存在")

        logs, total = self.subscription_repository.list_delivery_logs(
            subscription_id=subscription_id,
            page=page,
            page_size=page_size,
        )

        return {
            'items': [log.to_dict() for log in logs],
            'total': total,
            'page': page,
            'page_size': page_size,
            'pages': (total + page_size - 1) // page_size if page_size else 0,
        }
