"""
RQ 任务队列管理器
"""
from rq import Queue
from redis import Redis
from flask import current_app
from app.infrastructure.database.session import get_db_session
from app.domain.entities.extraction_run import ExtractionRun
from app.shared.enums import TaskStatus
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class TaskQueueManager:
    """
    任务队列管理器
    
    职责：
    1. 将任务提交到 RQ 队列
    2. 查询任务状态
    3. 恢复待执行任务（服务重启后）
    
    基于：RQ (Redis Queue) + 数据库持久化
    """
    
    def __init__(self, redis_url: str = None):
        """
        Args:
            redis_url: Redis 连接URL
        """
        self.redis_url = redis_url or current_app.config.get('REDIS_URL', 'redis://localhost:6379/0')
        self.redis_conn = Redis.from_url(
            self.redis_url,
            socket_timeout=10,
            socket_connect_timeout=10,
            socket_keepalive=True,
            retry_on_timeout=False,  # 禁用自动重试避免递归
            max_connections=50
        )
        self.queue = Queue('default', connection=self.redis_conn)
    
    def enqueue_extraction_task(self, run_id: int) -> str:
        """
        将提取任务加入队列
        
        Args:
            run_id: 执行记录ID
        
        Returns:
            job_id: RQ 任务ID
        """
        from app.infrastructure.tasks.jobs.extraction_job import execute_extraction_job
        
        # 提交到 RQ 队列
        job = self.queue.enqueue(
            execute_extraction_job,
            run_id,
            job_timeout=3600,  # 1小时超时
            result_ttl=86400,  # 结果保留24小时
            failure_ttl=604800  # 失败记录保留7天
        )
        
        logger.info(
            f"Enqueued extraction task",
            run_id=run_id,
            job_id=job.id
        )
        
        return job.id
    
    def enqueue_sql_query(self, query_id: int) -> str:
        """
        将 SQL 查询任务加入队列
        
        Args:
            query_id: SQL 查询记录 ID
        
        Returns:
            job_id: RQ 任务ID
        """
        from app.infrastructure.tasks.jobs.sql_query_job import execute_sql_query_job
        
        # 提交到 RQ 队列
        job = self.queue.enqueue(
            execute_sql_query_job,
            query_id,
            job_timeout=1800,  # 30分钟超时（大数据查询）
            result_ttl=86400,  # 结果保留24小时
            failure_ttl=604800  # 失败记录保留7天
        )
        
        logger.info(
            f"Enqueued SQL query task",
            query_id=query_id,
            job_id=job.id
        )
        
        return job.id
    
    def enqueue_query_export(self, export_id: int) -> str:
        """
        将异步数据导出任务加入队列

        Args:
            export_id: QueryExport 记录 ID

        Returns:
            job_id: RQ 任务 ID
        """
        from app.infrastructure.tasks.jobs.query_export_job import execute_query_export_job

        job = self.queue.enqueue(
            execute_query_export_job,
            export_id,
            job_timeout=7200,   # 大数据导出 2 小时超时
            result_ttl=86400,
            failure_ttl=604800
        )

        logger.info(
            f"Enqueued query export task",
            export_id=export_id,
            job_id=job.id
        )

        return job.id

    def enqueue(self, func, *args, **kwargs):
        """
        通用任务入队方法（用于事件处理等场景）
        
        Args:
            func: 任务函数（字符串路径或可调用对象）
            *args: 位置参数
            **kwargs: 命名参数
        
        Returns:
            RQ Job对象
        """
        return self.queue.enqueue(func, *args, **kwargs)
    
    def get_job_status(self, job_id: str) -> dict:
        """
        获取任务状态
        
        Args:
            job_id: RQ 任务ID
        
        Returns:
            任务状态字典
        """
        from rq.job import Job
        
        try:
            job = Job.fetch(job_id, connection=self.redis_conn)
            return {
                'job_id': job.id,
                'status': job.get_status(),
                'result': job.result,
                'exc_info': job.exc_info,
                'created_at': job.created_at.isoformat() if job.created_at else None,
                'started_at': job.started_at.isoformat() if job.started_at else None,
                'ended_at': job.ended_at.isoformat() if job.ended_at else None
            }
        except Exception as e:
            logger.warning(f"Failed to fetch job {job_id}: {e}")
            return {
                'job_id': job_id,
                'status': 'not_found',
                'error': str(e)
            }
    
    def recover_pending_tasks(self):
        """
        恢复待执行任务（服务重启后调用）
        
        从数据库中查找 status='running' 的记录，重新提交到队列
        """
        session = get_db_session()
        
        try:
            # 查找所有 running 状态的任务（可能因服务重启而中断）
            pending_runs = session.query(ExtractionRun).filter_by(
                status=TaskStatus.RUNNING.value
            ).all()
            
            logger.info(f"Found {len(pending_runs)} pending tasks to recover")
            
            for run in pending_runs:
                # 重置状态为 pending
                run.status = TaskStatus.PENDING.value
                session.commit()
                
                # 重新提交到队列
                try:
                    job_id = self.enqueue_extraction_task(run.id)
                    logger.info(f"Recovered task: run_id={run.id}, job_id={job_id}")
                except Exception as e:
                    logger.error(f"Failed to recover task {run.id}: {e}")
                    run.mark_as_failed(f"Recovery failed: {str(e)}")
                    session.commit()
        
        except Exception as e:
            logger.error(f"Task recovery failed: {e}", exc_info=True)
        
        finally:
            session.close()
    
    def get_queue_info(self) -> dict:
        """
        获取队列信息
        
        Returns:
            {
                'name': str,
                'count': int,  # 待处理任务数
                'failed_count': int,
                'finished_count': int
            }
        """
        try:
            return {
                'name': self.queue.name,
                'count': len(self.queue),
                'failed_count': len(self.queue.failed_job_registry),
                'finished_count': len(self.queue.finished_job_registry)
            }
        except Exception as e:
            logger.error(f"Failed to get queue info: {e}")
            return {'error': str(e)}


# 别名：向后兼容
TaskQueue = TaskQueueManager
