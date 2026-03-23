"""
提取任务仓储实现（适配器）
"""
from typing import List, Optional
from sqlalchemy.orm import Session
from app.domain.entities.extraction_task import ExtractionTask
from app.domain.entities.extraction_run import ExtractionRun
from app.domain.ports.repositories.extraction_repository import IExtractionRepository
from app.shared.enums import TaskStatus
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class ExtractionRepository(IExtractionRepository):
    """
    提取任务仓储实现
    
    职责：
    1. 实现 IExtractionRepository 接口
    2. 使用 SQLAlchemy ORM 进行数据访问
    3. 管理数据库事务
    """
    
    def __init__(self, session: Session):
        """
        Args:
            session: SQLAlchemy 会话
        """
        self._session = session
    
    def save(self, task: ExtractionTask) -> ExtractionTask:
        """
        保存任务（创建或更新）
        
        Args:
            task: 任务实体
        
        Returns:
            保存后的任务实体
        """
        self._session.add(task)
        self._session.flush()  # 刷新以获取ID，但不提交事务
        return task
    
    def find_by_id(self, task_id: int) -> Optional[ExtractionTask]:
        """
        根据 ID 查找任务
        
        Args:
            task_id: 任务ID
        
        Returns:
            任务实体或 None
        """
        return self._session.query(ExtractionTask).filter_by(id=task_id).first()
    
    def find_by_code(self, task_code: str) -> Optional[ExtractionTask]:
        """
        根据任务编码查找任务
        
        Args:
            task_code: 任务编码
        
        Returns:
            任务实体或 None
        """
        return self._session.query(ExtractionTask).filter_by(task_code=task_code).first()
    
    def delete(self, task_id: int) -> bool:
        """
        删除任务
        
        Args:
            task_id: 任务ID
        
        Returns:
            是否删除成功
        """
        task = self.find_by_id(task_id)
        if task:
            self._session.delete(task)
            self._session.flush()
            return True
        return False
    
    def save_run(self, run: ExtractionRun) -> ExtractionRun:
        """
        保存执行记录
        
        Args:
            run: 执行记录实体
        
        Returns:
            保存后的执行记录实体
        """
        self._session.add(run)
        self._session.flush()
        return run
    
    def find_run_by_id(self, run_id: int) -> Optional[ExtractionRun]:
        """
        根据 ID 查找执行记录
        
        Args:
            run_id: 执行记录ID
        
        Returns:
            执行记录实体或 None
        """
        return self._session.query(ExtractionRun).filter_by(id=run_id).first()
    
    def list_runs(
        self,
        task_id: int = None,
        status: str = None,
        page: int = 1,
        page_size: int = 20
    ) -> dict:
        """
        分页查询执行记录
        
        Args:
            task_id: 任务 ID 筛选
            status: 状态筛选
            page: 页码
            page_size: 每页数量
        
        Returns:
            {'items': [...], 'total': int}
        """
        from sqlalchemy import desc
        
        query = self._session.query(ExtractionRun)
        
        if task_id:
            query = query.filter_by(task_id=task_id)
        if status:
            query = query.filter_by(status=status)
        
        total = query.count()
        items = (
            query.order_by(desc(ExtractionRun.created_at))
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        
        return {'items': items, 'total': total}
    
    def find_pending_runs(self, limit: int = 100) -> List[ExtractionRun]:
        """
        查找待执行的运行记录（用于任务恢复）
        
        Args:
            limit: 返回数量限制
        
        Returns:
            待执行的运行记录列表
        """
        return self._session.query(ExtractionRun).filter_by(
            status=TaskStatus.RUNNING.value
        ).limit(limit).all()
    
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
