"""
渠道仓储实现（SQLAlchemy ORM）
"""
from typing import Optional, List
from sqlalchemy.orm import Session

from app.domain.entities.config.channel import Channel
from app.domain.ports.repositories.channel_repository_port import IChannelRepository


class ChannelRepository(IChannelRepository):
    """
    渠道仓储实现
    
    使用 SQLAlchemy ORM 进行持久化
    """
    
    def __init__(self, session: Session):
        """
        初始化
        
        Args:
            session: SQLAlchemy Session
        """
        self.session = session
    
    def save(self, channel: Channel) -> Channel:
        """
        保存渠道（创建或更新）
        
        Args:
            channel: 渠道实体
        
        Returns:
            保存后的渠道实体
        """
        self.session.add(channel)
        self.session.commit()
        self.session.refresh(channel)
        return channel
    
    def find_by_id(self, channel_id: int) -> Optional[Channel]:
        """
        根据ID查找渠道
        
        Args:
            channel_id: 渠道ID
        
        Returns:
            渠道实体或None
        """
        return self.session.query(Channel).get(channel_id)
    
    def find_all(
        self,
        channel_type: Optional[str] = None,
        enabled: Optional[bool] = None,
        page: int = 1,
        page_size: int = 20
    ) -> tuple:
        """
        分页查询渠道列表
        
        Args:
            channel_type: 按类型过滤
            enabled: 按启用状态过滤
            page: 页码
            page_size: 每页数量
        
        Returns:
            (channels, total) 渠道列表和总数
        """
        query = self.session.query(Channel)
        
        if channel_type:
            query = query.filter(Channel.channel_type == channel_type)
        if enabled is not None:
            query = query.filter(Channel.enabled == enabled)
        
        total = query.count()
        
        channels = query.order_by(Channel.created_at.desc()) \
            .offset((page - 1) * page_size) \
            .limit(page_size) \
            .all()
        
        return channels, total
    
    def delete(self, channel: Channel) -> None:
        """
        删除渠道
        
        Args:
            channel: 渠道实体
        """
        self.session.delete(channel)
        self.session.commit()
    
    def commit(self) -> None:
        """提交当前事务"""
        self.session.commit()
