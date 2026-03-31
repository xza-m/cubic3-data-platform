import logging
from app.extensions import scheduler

logger = logging.getLogger(__name__)
PLATFORM_DATASOURCE_CATALOG_SYNC_CRON = "0 2 * * *"


def execute_platform_datasource_catalog_sync():
    """枚举平台内活跃数据源并投递目录同步任务。"""
    from app.di.container import get_container

    container = get_container()
    repository = container.datasource_repository()
    task_queue = container.task_queue()

    for datasource in repository.find_all():
        if not datasource.is_active:
            continue
        if datasource.source_type not in {'postgresql', 'maxcompute'}:
            continue
        task_queue.enqueue(
            'app.infrastructure.tasks.jobs.datasource_catalog_sync_job.execute_datasource_catalog_sync_job',
            datasource.id,
            job_timeout=1800,
            result_ttl=86400,
            failure_ttl=604800,
        )


def register_platform_datasource_catalog_sync_job():
    """注册平台级固定周期目录同步任务。"""
    scheduler.add_job(
        id='platform_datasource_catalog_sync',
        func=execute_platform_datasource_catalog_sync,
        trigger='cron',
        hour=2,
        minute=0,
        replace_existing=True,
    )


def init_jobs():
    """启动 Flask-APScheduler 并重载应用中心的定时调度"""
    scheduler.start()
    register_platform_datasource_catalog_sync_job()

    try:
        from app.di.container import get_container
        svc = get_container().scheduler_service()
        svc.reload_all_schedules()
    except Exception as e:
        logger.warning("Failed to reload app-center schedules at startup: %s", e)
