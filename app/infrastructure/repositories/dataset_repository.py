"""
数据集仓储实现（适配器）
"""
from typing import List, Optional
from sqlalchemy.orm import Session
from app.domain.entities.dataset import Dataset
from app.domain.entities.dataset_field import DatasetField
from app.domain.ports.repositories.dataset_repository import IDatasetRepository
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class DatasetRepository(IDatasetRepository):
    """
    数据集仓储实现
    
    职责：
    1. 实现 IDatasetRepository 接口
    2. 使用 SQLAlchemy ORM 进行数据访问
    3. 管理数据库事务
    """
    
    def __init__(self, session: Session):
        """
        Args:
            session: SQLAlchemy 会话
        """
        self._session = session
    
    def save(self, dataset: Dataset) -> Dataset:
        """保存数据集"""
        self._session.add(dataset)
        self._session.flush()
        return dataset
    
    def find_by_id(self, dataset_id: int) -> Optional[Dataset]:
        """根据 ID 查找数据集"""
        return self._session.query(Dataset).filter_by(id=dataset_id).first()
    
    def find_by_code(self, dataset_code: str) -> Optional[Dataset]:
        """根据数据集编码查找数据集"""
        return self._session.query(Dataset).filter_by(dataset_code=dataset_code).first()
    
    def delete(self, dataset_id: int) -> bool:
        """删除数据集（软删除）"""
        dataset = self.find_by_id(dataset_id)
        if dataset:
            dataset.soft_delete()
            self._session.flush()
            return True
        return False
    
    def save_field(self, field: DatasetField) -> DatasetField:
        """保存字段元数据"""
        self._session.add(field)
        self._session.flush()
        return field
    
    def save_fields_batch(self, fields: List[DatasetField]) -> List[DatasetField]:
        """批量保存字段元数据"""
        self._session.add_all(fields)
        self._session.flush()
        return fields
    
    def delete_fields(self, dataset_id: int, field_names: List[str]) -> int:
        """删除指定字段"""
        deleted_count = self._session.query(DatasetField).filter(
            DatasetField.dataset_id == dataset_id,
            DatasetField.physical_name.in_(field_names)
        ).delete(synchronize_session=False)
        
        self._session.flush()
        return deleted_count
    
    def commit(self):
        """提交事务"""
        try:
            self._session.commit()
            logger.debug("Transaction committed")
        except Exception as e:
            logger.error(f"Transaction commit failed: {e}", exc_info=True)
            self._session.rollback()
            raise
    
    def rollback(self):
        """回滚事务"""
        self._session.rollback()
        logger.debug("Transaction rolled back")
