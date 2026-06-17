"""
执行服务

负责应用实例的执行和执行记录管理
"""
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta

from app.domain.entities import AppExecution, AppInstance
from app.domain.app_center import ExecutorFactory, ExecutionContext, TriggerType
from app.infrastructure.repositories.app_execution_repository import AppExecutionRepository
from app.infrastructure.repositories.app_instance_repository import AppInstanceRepository
from app.shared.exceptions import NotFoundError
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)





class ExecutionService:
    """执行服务"""
    
    def __init__(
        self,
        app_execution_repository: AppExecutionRepository,
        app_instance_repository: AppInstanceRepository,
        event_bus=None
    ):
        """
        初始化执行服务
        
        Args:
            app_execution_repository: 执行记录仓储
            app_instance_repository: 应用实例仓储
            event_bus: 事件总线实例（可选）
        """
        self.app_execution_repository = app_execution_repository
        self.app_instance_repository = app_instance_repository
        self.event_bus = event_bus
    
    def execute_instance(
        self,
        instance_id: int,
        trigger_type: str = 'manual',
        triggered_by: Optional[str] = None,
        extra_data: Optional[Dict[str, Any]] = None
    ) -> int:
        """
        执行应用实例
        
        Args:
            instance_id: 实例 ID
            trigger_type: 触发类型
            triggered_by: 触发者
            extra_data: 额外数据（如事件数据）
        
        Returns:
            执行记录 ID
        
        Raises:
            NotFoundError: 实例不存在
        """
        # 1. 查询实例
        instance = self.app_instance_repository.find_by_id(instance_id)
        if not instance:
            raise NotFoundError(f"实例 {instance_id} 不存在")
        
        # 2. 检查是否可执行
        can_execute, reason = instance.can_execute()
        if not can_execute:
            raise Exception(f"无法执行：{reason}")
        
        # 3. 创建执行记录
        execution = AppExecution(
            instance_id=instance_id,
            trigger_type=trigger_type,
            status='pending',
            input_params={'config': instance.config}
        )
        
        execution = self.app_execution_repository.save(execution)
        execution_id = execution.id
        
        # 4. 异步执行（推送到 RQ 队列）
        from app.infrastructure.queue import get_queue
        queue = get_queue()
        queue.enqueue(
            'app.application.services.app_center.execution_service.execute_app_instance_async',
            execution_id=execution_id,
            instance_id=instance.id,
            triggered_by=triggered_by,
            extra_data=extra_data,
            job_timeout='30m',  # 30 分钟超时
            result_ttl=86400,   # 结果保留 24 小时
        )
        
        return execution_id
    
    def _execute_sync(
        self,
        execution_id: int,
        instance_id: int,
        triggered_by: Optional[str],
        extra_data: Optional[Dict[str, Any]]
    ):
        """同步执行应用（由 RQ Worker 调用）"""
        # RQ Worker 已经在 Flask app context 中运行（通过 run_worker.py）
        # 直接访问数据库即可，无需再创建 app
        
        # 查询 execution 和 instance
        execution = self.app_execution_repository.find_by_id(execution_id)
        if not execution:
            return
        
        instance = self.app_instance_repository.find_by_id(instance_id)
        if not instance:
            return
        
        try:
            # 1. 标记开始执行
            execution.start()
            self.app_execution_repository.commit()
            
            # 发布收集的事件
            self._publish_domain_events(execution)
            
            # 2. 创建执行器
            executor = ExecutorFactory.create(instance.app_code)
            if not executor:
                raise Exception(f"未找到应用 {instance.app_code} 的执行器")
            
            # 3. 构建执行上下文
            context = ExecutionContext(
                execution_id=execution_id,
                instance_id=instance.id,
                app_code=instance.app_code,
                instance_name=instance.name,
                config=instance.config,
                trigger_type=TriggerType(execution.trigger_type),
                triggered_by=triggered_by,
                extra_data=extra_data or {}
            )
            
            # 4. 执行
            result = executor.execute(context)
            
            # 5. 更新执行记录
            if result.is_success():
                execution.complete_success(output=result.output)
            else:
                execution.complete_failure(error_message=result.error_message)
            
            self.app_execution_repository.commit()
            
        except Exception as e:
            execution.complete_failure(error_message=str(e))
            self.app_execution_repository.commit()

        # 发布收集的事件（成功与失败路径都要发布，订阅交付依赖 completed/failed 事件）
        self._publish_domain_events(execution)
    
    def get_execution(self, execution_id: int) -> Optional[Dict[str, Any]]:
        """获取执行记录详情"""
        execution = self.app_execution_repository.find_by_id(execution_id)
        if not execution:
            return None
        
        return execution.to_dict(include_instance_info=True)
    
    def list_executions(
        self,
        app_code: Optional[str] = None,
        instance_id: Optional[int] = None,
        status: Optional[str] = None,
        trigger_type: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        page: int = 1,
        page_size: int = 20
    ) -> Dict[str, Any]:
        """
        查询执行记录列表
        
        Args:
            app_code: 应用编码筛选
            instance_id: 实例 ID 筛选
            status: 执行状态筛选
            trigger_type: 触发类型筛选
            start_date: 开始时间筛选
            end_date: 结束时间筛选
            page: 页码
            page_size: 每页大小
        
        Returns:
            分页结果
        """
        executions, total = self.app_execution_repository.find_all(
            app_code=app_code,
            instance_id=instance_id,
            status=status,
            trigger_type=trigger_type,
            start_date=start_date,
            end_date=end_date,
            page=page,
            page_size=page_size
        )
        
        return {
            'items': [exec.to_dict(include_instance_info=True) for exec in executions],
            'total': total,
            'page': page,
            'page_size': page_size,
            'pages': (total + page_size - 1) // page_size
        }
    
    def get_execution_stats(
        self,
        instance_id: Optional[int] = None,
        days: int = 7
    ) -> Dict[str, Any]:
        """
        获取执行统计信息
        
        Args:
            instance_id: 实例 ID（可选）
            days: 统计最近多少天
        
        Returns:
            统计信息
        """
        start_date = datetime.now() - timedelta(days=days)
        
        stats = self.app_execution_repository.get_stats(
            instance_id=instance_id,
            start_date=start_date
        )
        
        total_executions = stats['total_executions']
        success_count = stats['success_count']
        success_rate = (success_count / total_executions * 100) if total_executions > 0 else 0
        
        return {
            'total_executions': total_executions,
            'success_count': success_count,
            'failed_count': stats['failed_count'],
            'success_rate': round(success_rate, 2),
            'avg_duration_ms': round(stats['avg_duration_ms'], 2),
            'period_days': days
        }
    
    def _publish_domain_events(self, entity):
        """
        发布实体收集的领域事件
        
        Args:
            entity: 实体实例（如 AppExecution）
        """
        if not self.event_bus:
            return
        
        events = entity.collect_domain_events()
        for event in events:
            try:
                self.event_bus.publish(event)
            except Exception as e:
                # 记录错误但不影响主流程
                logger.error(f"Failed to publish event {event.event_type}: {str(e)}")


def enqueue_instance_execution(
    instance_id: int,
    trigger_type: str = 'manual',
    triggered_by: str = None,
    extra_data: dict = None
):
    """
    在队列任务中创建执行记录并入队
    
    适用于延迟触发场景，避免直接调用需要 execution_id 的底层函数
    """
    from app.di.container import get_container
    
    service = get_container().execution_service()
    return service.execute_instance(
        instance_id=instance_id,
        trigger_type=trigger_type,
        triggered_by=triggered_by,
        extra_data=extra_data
    )


# RQ Worker 调用的顶层函数
def execute_app_instance_async(
    execution_id: Optional[int],
    instance_id: int,
    triggered_by: str = None,
    extra_data: dict = None
):
    """
    RQ Worker 调用的异步执行函数
    
    Args:
        execution_id: 执行记录 ID
        instance_id: 实例 ID
        triggered_by: 触发者
        extra_data: 额外数据
    """
    from app.di.container import get_container
    
    service = get_container().execution_service()
    if execution_id is None:
        logger.warning(
            "execute_app_instance_async 收到空 execution_id，回退为创建执行记录后再入队"
        )
        return service.execute_instance(
            instance_id=instance_id,
            trigger_type='event',
            triggered_by=triggered_by,
            extra_data=extra_data
        )
    
    service._execute_sync(execution_id, instance_id, triggered_by, extra_data)
