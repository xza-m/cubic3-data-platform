"""
订阅仓储实现（SQLAlchemy ORM）
"""
from typing import Optional, List
from sqlalchemy.orm import Session, joinedload

from app.domain.entities.config.subscription import Subscription
from app.domain.entities import AppInstance, AppDefinition
from app.domain.ports.repositories.subscription_repository_port import ISubscriptionRepository


class SubscriptionRepository(ISubscriptionRepository):
    """
    订阅仓储实现
    
    使用 SQLAlchemy ORM 进行持久化
    """
    
    def __init__(self, session: Session):
        """
        初始化
        
        Args:
            session: SQLAlchemy Session
        """
        self.session = session
    
    def save(self, subscription: Subscription) -> Subscription:
        """
        保存订阅（创建或更新）
        
        Args:
            subscription: 订阅实体
        
        Returns:
            保存后的订阅实体
        """
        self.session.add(subscription)
        self.session.commit()
        self.session.refresh(subscription)
        return subscription
    
    def find_by_id(self, subscription_id: int) -> Optional[Subscription]:
        """
        根据ID查找订阅（简单查询）
        
        Args:
            subscription_id: 订阅ID
        
        Returns:
            订阅实体或None
        """
        return self.session.query(Subscription).get(subscription_id)
    
    def find_by_id_with_relations(self, subscription_id: int) -> Optional[Subscription]:
        """
        根据ID查找订阅（含关联数据 eager loading）
        
        Args:
            subscription_id: 订阅ID
        
        Returns:
            订阅实体或None
        """
        return self.session.query(Subscription) \
            .options(joinedload(Subscription.app_instance).joinedload(AppInstance.app_definition)) \
            .options(joinedload(Subscription.channel)) \
            .filter(Subscription.id == subscription_id) \
            .first()
    
    def find_all(
        self,
        app_instance_id: Optional[int] = None,
        channel_id: Optional[int] = None,
        enabled: Optional[bool] = None,
        page: int = 1,
        page_size: int = 20
    ) -> tuple:
        """
        分页查询订阅列表（含关联数据）
        
        Args:
            app_instance_id: 按应用实例过滤
            channel_id: 按渠道过滤
            enabled: 按启用状态过滤
            page: 页码
            page_size: 每页数量
        
        Returns:
            (subscriptions, total) 订阅列表和总数
        """
        query = self.session.query(Subscription) \
            .options(joinedload(Subscription.app_instance).joinedload(AppInstance.app_definition)) \
            .options(joinedload(Subscription.channel))
        
        if app_instance_id:
            query = query.filter(Subscription.app_instance_id == app_instance_id)
        if channel_id:
            query = query.filter(Subscription.channel_id == channel_id)
        if enabled is not None:
            query = query.filter(Subscription.enabled == enabled)
        
        total = query.count()
        
        subscriptions = query.order_by(Subscription.created_at.desc()) \
            .offset((page - 1) * page_size) \
            .limit(page_size) \
            .all()
        
        return subscriptions, total
    
    def find_by_app_instance(self, app_instance_id: int, enabled_only: bool = True) -> List[Subscription]:
        """
        获取应用实例的所有订阅
        
        Args:
            app_instance_id: 应用实例ID
            enabled_only: 仅返回启用的订阅
        
        Returns:
            订阅列表
        """
        query = self.session.query(Subscription) \
            .options(joinedload(Subscription.app_instance).joinedload(AppInstance.app_definition)) \
            .options(joinedload(Subscription.channel)) \
            .filter(Subscription.app_instance_id == app_instance_id)
        
        if enabled_only:
            query = query.filter(Subscription.enabled == True)
        
        return query.all()
    
    def find_matching_subscriptions(self, event_type: str) -> List[Subscription]:
        """
        查找订阅指定事件类型的启用订阅
        
        Args:
            event_type: 事件类型
        
        Returns:
            匹配的订阅列表
        """
        return self.session.query(Subscription) \
            .filter(Subscription.enabled == True) \
            .filter(Subscription.event_types.contains([event_type])) \
            .all()
    
    def delete(self, subscription: Subscription) -> None:
        """
        删除订阅
        
        Args:
            subscription: 订阅实体
        """
        self.session.delete(subscription)
        self.session.commit()
    
    def commit(self) -> None:
        """提交当前事务"""
        self.session.commit()
