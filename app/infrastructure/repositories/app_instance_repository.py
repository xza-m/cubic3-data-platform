"""
应用实例仓储实现（SQLAlchemy ORM）
"""
from typing import Optional, List
from sqlalchemy.orm import Session

from app.domain.entities import AppInstance
from app.domain.ports.repositories.app_instance_repository_port import IAppInstanceRepository


class AppInstanceRepository(IAppInstanceRepository):
    """
    应用实例仓储实现
    
    使用 SQLAlchemy ORM 进行持久化
    """
    
    def __init__(self, session: Session):
        """
        初始化
        
        Args:
            session: SQLAlchemy Session
        """
        self.session = session
    
    def save(self, instance: AppInstance) -> AppInstance:
        """
        保存应用实例（创建或更新）
        
        Args:
            instance: 应用实例实体
        
        Returns:
            保存后的应用实例实体
        """
        self.session.add(instance)
        self.session.commit()
        self.session.refresh(instance)
        return instance
    
    def find_by_id(self, instance_id: int) -> Optional[AppInstance]:
        """
        根据ID查找应用实例
        
        Args:
            instance_id: 实例ID
        
        Returns:
            应用实例实体或None
        """
        return self.session.query(AppInstance).filter_by(id=instance_id).first()
    
    def find_all(
        self,
        app_code: Optional[str] = None,
        owner: Optional[str] = None,
        enabled: Optional[bool] = None,
        page: int = 1,
        page_size: int = 20
    ) -> tuple:
        """
        分页查询应用实例列表
        
        Args:
            app_code: 应用代码筛选
            owner: 所有者筛选
            enabled: 启用状态筛选
            page: 页码
            page_size: 每页大小
        
        Returns:
            (instances, total) 实例列表和总数
        """
        query = self.session.query(AppInstance)
        
        if app_code:
            query = query.filter_by(app_code=app_code)
        if owner:
            query = query.filter_by(owner=owner)
        if enabled is not None:
            query = query.filter_by(enabled=enabled)
        
        total = query.count()
        
        query = query.order_by(AppInstance.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)
        
        instances = query.all()
        
        return instances, total
    
    def delete(self, instance: AppInstance) -> None:
        """
        删除应用实例
        
        Args:
            instance: 应用实例实体
        """
        self.session.delete(instance)
        self.session.commit()
    
    def find_enabled_event_instances(self) -> List[AppInstance]:
        """
        查询所有启用的事件触发实例
        
        Returns:
            启用的 event 实例列表
        """
        return self.session.query(AppInstance).filter_by(
            enabled=True,
            schedule_type='event'
        ).all()
    
    def find_enabled_cron_instances(self) -> List[AppInstance]:
        """
        查询所有启用的 cron 调度实例
        
        Returns:
            启用的 cron 实例列表
        """
        return self.session.query(AppInstance).filter_by(
            enabled=True,
            schedule_type='cron'
        ).all()
    
    def commit(self) -> None:
        """提交当前事务"""
        self.session.commit()
