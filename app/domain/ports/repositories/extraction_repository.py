"""
提取任务仓储接口（端口）
定义数据访问契约，由基础设施层实现
"""
from abc import ABC, abstractmethod
from typing import List, Optional
from app.domain.entities.extraction_task import ExtractionTask
from app.domain.entities.extraction_run import ExtractionRun


class IExtractionRepository(ABC):
    """
    提取任务仓储接口（写操作）
    
    职责：
    1. 管理 ExtractionTask 实体的持久化
    2. 管理 ExtractionRun 实体的持久化
    3. 提供事务支持
    
    注意：此接口仅用于写操作（Command），读操作（Query）直接使用 SQLAlchemy Core
    """
    
    @abstractmethod
    def save(self, task: ExtractionTask) -> ExtractionTask:
        """
        保存任务（创建或更新）
        
        Args:
            task: 任务实体
        
        Returns:
            保存后的任务实体
        """
        pass
    
    @abstractmethod
    def find_by_id(self, task_id: int) -> Optional[ExtractionTask]:
        """
        根据 ID 查找任务
        
        Args:
            task_id: 任务ID
        
        Returns:
            任务实体或 None
        """
        pass
    
    @abstractmethod
    def find_by_code(self, task_code: str) -> Optional[ExtractionTask]:
        """
        根据任务编码查找任务
        
        Args:
            task_code: 任务编码
        
        Returns:
            任务实体或 None
        """
        pass
    
    @abstractmethod
    def delete(self, task_id: int) -> bool:
        """
        删除任务
        
        Args:
            task_id: 任务ID
        
        Returns:
            是否删除成功
        """
        pass
    
    @abstractmethod
    def save_run(self, run: ExtractionRun) -> ExtractionRun:
        """
        保存执行记录
        
        Args:
            run: 执行记录实体
        
        Returns:
            保存后的执行记录实体
        """
        pass
    
    @abstractmethod
    def find_run_by_id(self, run_id: int) -> Optional[ExtractionRun]:
        """
        根据 ID 查找执行记录
        
        Args:
            run_id: 执行记录ID
        
        Returns:
            执行记录实体或 None
        """
        pass
    
    @abstractmethod
    def find_pending_runs(self, limit: int = 100) -> List[ExtractionRun]:
        """
        查找待执行的运行记录（用于任务恢复）
        
        Args:
            limit: 返回数量限制
        
        Returns:
            待执行的运行记录列表
        """
        pass
    
    @abstractmethod
    def commit(self):
        """提交事务"""
        pass
    
    @abstractmethod
    def rollback(self):
        """回滚事务"""
        pass
