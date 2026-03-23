import logging
from app.extensions import scheduler

logger = logging.getLogger(__name__)


def init_jobs():
    """启动 Flask-APScheduler 并重载应用中心的定时调度"""
    scheduler.start()

    try:
        from app.di.container import get_container
        svc = get_container().scheduler_service()
        svc.reload_all_schedules()
    except Exception as e:
        logger.warning("Failed to reload app-center schedules at startup: %s", e)
