"""
应用执行记录仓储实现（SQLAlchemy ORM）
"""
from typing import Optional, List
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from app.domain.entities import AppExecution
from app.domain.entities.app_instance import AppInstance
from app.domain.ports.repositories.app_execution_repository_port import IAppExecutionRepository


class AppExecutionRepository(IAppExecutionRepository):
    """
    应用执行记录仓储实现
    
    使用 SQLAlchemy ORM 进行持久化
    """
    
    def __init__(self, session: Session):
        """
        初始化
        
        Args:
            session: SQLAlchemy Session
        """
        self.session = session
    
    def save(self, execution: AppExecution) -> AppExecution:
        """
        保存执行记录（创建或更新）
        
        Args:
            execution: 执行记录实体
        
        Returns:
            保存后的执行记录实体
        """
        self.session.add(execution)
        self.session.commit()
        self.session.refresh(execution)
        return execution
    
    def find_by_id(self, execution_id: int) -> Optional[AppExecution]:
        """
        根据ID查找执行记录
        
        Args:
            execution_id: 执行记录ID
        
        Returns:
            执行记录实体或None
        """
        return self.session.query(AppExecution).filter_by(id=execution_id).first()
    
    def find_all(
        self,
        app_code: Optional[str] = None,
        instance_id: Optional[int] = None,
        status: Optional[str] = None,
        trigger_type: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        page: int = 1,
        page_size: int = 20
    ) -> tuple:
        """
        分页查询执行记录列表
        
        Args:
            app_code: 应用编码筛选
            instance_id: 实例ID筛选
            status: 状态筛选
            trigger_type: 触发类型筛选
            start_date: 开始时间筛选
            end_date: 结束时间筛选
            page: 页码
            page_size: 每页大小
        
        Returns:
            (executions, total) 执行记录列表和总数
        """
        query = self.session.query(AppExecution)
        if app_code:
            query = query.join(AppInstance, AppExecution.instance_id == AppInstance.id).filter(AppInstance.app_code == app_code)
        
        if instance_id:
            query = query.filter_by(instance_id=instance_id)
        if status:
            query = query.filter_by(status=status)
        if trigger_type:
            query = query.filter_by(trigger_type=trigger_type)
        if start_date:
            query = query.filter(AppExecution.created_at >= start_date)
        if end_date:
            query = query.filter(AppExecution.created_at <= end_date)
        
        total = query.count()
        
        query = query.order_by(AppExecution.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)
        
        executions = query.all()
        
        return executions, total
    
    def get_stats(
        self,
        instance_id: Optional[int] = None,
        start_date: Optional[datetime] = None
    ) -> dict:
        """
        获取执行统计信息
        
        Args:
            instance_id: 实例ID（可选）
            start_date: 统计开始时间
        
        Returns:
            统计信息字典
        """
        query = self.session.query(AppExecution).filter(
            AppExecution.created_at >= start_date
        )
        
        if instance_id:
            query = query.filter_by(instance_id=instance_id)
        
        total_executions = query.count()
        success_count = query.filter_by(status='success').count()
        failed_count = query.filter_by(status='failed').count()
        
        # 平均耗时
        avg_duration_query = self.session.query(
            func.avg(AppExecution.duration_ms)
        ).filter(
            and_(
                AppExecution.created_at >= start_date,
                AppExecution.status == 'success',
                AppExecution.duration_ms.isnot(None)
            )
        )
        
        if instance_id:
            avg_duration_query = avg_duration_query.filter_by(instance_id=instance_id)
        
        avg_duration_ms = avg_duration_query.scalar() or 0
        
        return {
            'total_executions': total_executions,
            'success_count': success_count,
            'failed_count': failed_count,
            'avg_duration_ms': avg_duration_ms
        }
    
    def find_by_instance(
        self, instance_id: int, page: int = 1, page_size: int = 20
    ) -> tuple:
        """按实例ID分页查找执行记录"""
        query = self.session.query(AppExecution).filter_by(instance_id=instance_id)
        total = query.count()
        executions = (
            query.order_by(AppExecution.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return executions, total

    def commit(self) -> None:
        """提交当前事务"""
        self.session.commit()
