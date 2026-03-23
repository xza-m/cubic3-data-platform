"""
数据源仓储实现（SQLAlchemy ORM）
"""
from typing import Optional, List
from sqlalchemy.orm import Session
from app.domain.entities.data_source import DataSource
from app.domain.ports.repositories.datasource_repository import IDatasourceRepository


class DatasourceRepository(IDatasourceRepository):
    """
    数据源仓储实现
    
    使用 SQLAlchemy ORM 进行持久化
    """
    
    def __init__(self, session: Session):
        """
        初始化
        
        Args:
            session: SQLAlchemy Session
        """
        self.session = session
    
    def save(self, datasource: DataSource) -> DataSource:
        """
        保存数据源（创建或更新）
        
        Args:
            datasource: 数据源实体
        
        Returns:
            保存后的数据源实体
        """
        self.session.add(datasource)
        self.session.commit()
        self.session.refresh(datasource)
        return datasource
    
    def find_by_id(self, datasource_id: int) -> Optional[DataSource]:
        """
        根据ID查找数据源
        
        Args:
            datasource_id: 数据源ID
        
        Returns:
            数据源实体或None
        """
        return self.session.query(DataSource).filter_by(id=datasource_id).first()
    
    def find_by_name(self, name: str) -> Optional[DataSource]:
        """
        根据名称查找数据源
        
        Args:
            name: 数据源名称
        
        Returns:
            数据源实体或None
        """
        return self.session.query(DataSource).filter_by(name=name).first()
    
    def find_all(self) -> List[DataSource]:
        """
        查找所有数据源
        
        Returns:
            数据源实体列表
        """
        return self.session.query(DataSource).all()
    
    def delete(self, datasource: DataSource) -> None:
        """
        删除数据源
        
        Args:
            datasource: 数据源实体
        """
        self.session.delete(datasource)
        self.session.commit()
    
    def exists_by_name(self, name: str, exclude_id: Optional[int] = None) -> bool:
        """
        检查名称是否已存在
        
        Args:
            name: 数据源名称
            exclude_id: 排除的ID（用于更新时检查）
        
        Returns:
            是否存在
        """
        query = self.session.query(DataSource).filter_by(name=name)
        
        if exclude_id is not None:
            query = query.filter(DataSource.id != exclude_id)
        
        return query.first() is not None
