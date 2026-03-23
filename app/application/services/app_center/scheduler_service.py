"""
调度服务

负责应用实例的定时任务调度
"""
from typing import Optional
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.domain.entities import AppInstance
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class SchedulerService:
    """调度服务（使用 APScheduler）"""
    
    _scheduler: Optional[BackgroundScheduler] = None
    
    def __init__(self, app_instance_repository=None):
        """
        初始化调度服务
        
        Args:
            app_instance_repository: 应用实例仓储（用于 reload_all_schedules）
        """
        self.app_instance_repository = app_instance_repository
    
    @classmethod
    def get_scheduler(cls) -> BackgroundScheduler:
        """获取调度器实例（单例）"""
        if cls._scheduler is None:
            cls._scheduler = BackgroundScheduler()
            cls._scheduler.start()
        return cls._scheduler
    
    def add_schedule(self, instance: AppInstance):
        """
        添加定时任务
        
        Args:
            instance: 应用实例
        """
        if instance.schedule_type != 'cron':
            return
        
        schedule_config = instance.schedule_config or {}
        cron_expr = schedule_config.get('cron')
        if not cron_expr:
            logger.warning(f"实例 {instance.id} 缺少 cron 表达式")
            return
        
        # 解析 cron 表达式（分 时 日 月 周）
        parts = cron_expr.split()
        if len(parts) != 5:
            logger.error(f"实例 {instance.id} cron 表达式格式错误：{cron_expr}")
            return
        
        minute, hour, day, month, day_of_week = parts
        
        trigger = CronTrigger(
            minute=minute,
            hour=hour,
            day=day,
            month=month,
            day_of_week=day_of_week
        )
        
        job_id = f"app_instance_{instance.id}"
        scheduler = self.get_scheduler()
        
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)
        
        scheduler.add_job(
            func=self._execute_instance_job,
            trigger=trigger,
            args=[instance.id],
            id=job_id,
            name=f"{instance.name} (#{instance.id})",
            replace_existing=True
        )
        
        logger.info(f"已添加定时任务：{instance.name} (#{instance.id}), cron={cron_expr}")
    
    def remove_schedule(self, instance_id: int):
        """
        移除定时任务
        
        Args:
            instance_id: 实例 ID
        """
        job_id = f"app_instance_{instance_id}"
        scheduler = self.get_scheduler()
        
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)
            logger.info(f"已移除定时任务：实例 #{instance_id}")
    
    def reload_all_schedules(self):
        """重新加载所有定时任务"""
        scheduler = self.get_scheduler()
        scheduler.remove_all_jobs()
        
        # 通过注入的 Repository 查询，避免直接使用 db.session
        if self.app_instance_repository is None:
            logger.error("SchedulerService 未注入 app_instance_repository，无法重载调度")
            return
        
        instances = self.app_instance_repository.find_enabled_cron_instances()
        
        for instance in instances:
            try:
                self.add_schedule(instance)
            except Exception as e:
                logger.error(f"添加定时任务失败：实例 #{instance.id}, 错误={e}")
        
        logger.info(f"已重新加载 {len(instances)} 个定时任务")
    
    def get_all_jobs(self):
        """获取所有调度任务"""
        scheduler = self.get_scheduler()
        jobs = scheduler.get_jobs()
        
        return [
            {
                'id': job.id,
                'name': job.name,
                'next_run_time': job.next_run_time.isoformat() if job.next_run_time else None,
                'trigger': str(job.trigger)
            }
            for job in jobs
        ]
    
    @staticmethod
    def _execute_instance_job(instance_id: int):
        """
        定时任务回调函数
        
        注意：这个函数在 APScheduler 的线程中执行，
        通过 DI 容器获取 ExecutionService 避免无参实例化
        """
        try:
            from app.di.container import get_container
            execution_service = get_container().execution_service()
            execution_id = execution_service.execute_instance(
                instance_id=instance_id,
                trigger_type='scheduled',
                triggered_by='system'
            )
            
            logger.info(f"定时任务执行成功：实例 #{instance_id}, 执行记录 #{execution_id}")
            
        except Exception as e:
            logger.error(f"定时任务执行失败：实例 #{instance_id}, 错误={e}")
