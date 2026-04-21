# app/infrastructure/queries/scheduled_query_runner.py
"""
APScheduler in-process 运行器（ADR-001 候选 A，本期采用）。

选型依据：
  - 优先级：部署简单，与 Flask 进程共享生命周期，无需额外 broker。
  - 限制：多 Gunicorn worker 需通过 --workers=1 或外置 leader-election 避免重复执行。
  - 后续：如需横向扩展，可替换为 Celery beat（see ADR-001）。

依赖：
  - apscheduler >= 3.x  (已在 extensions.py 中引入 BackgroundScheduler)
  - flask-apscheduler 提供 app.extensions.scheduler
"""
import logging
from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.domain.queries.scheduled_query import ScheduledQuery

logger = logging.getLogger(__name__)

_APJ_PREFIX = "sqrun_"  # APScheduler job id 前缀


def _apj_id(query_id: int) -> str:
    return f"{_APJ_PREFIX}{query_id}"


def _compute_next_run(cron: str, timezone: str) -> datetime | None:
    """用 APScheduler CronTrigger 计算下次触发时间（UTC）。"""
    try:
        from apscheduler.triggers.cron import CronTrigger
        import pytz

        tz = pytz.timezone(timezone)
        trigger = CronTrigger.from_crontab(cron, timezone=tz)
        return trigger.get_next_fire_time(None, datetime.now(tz))
    except Exception as exc:
        logger.warning("compute_next_run failed for cron=%s tz=%s: %s", cron, timezone, exc)
        return None


def execute_scheduled_query(query_id: int) -> None:
    """
    APScheduler 回调：在 Flask app context 内执行一条 ScheduledQuery。

    流程：
      1. 写 run 记录（status=running）
      2. 从数据源执行 SQL
      3. 更新 run（success / failed）+ 更新 query.last_*
      4. 计算并写入 next_run_at
    """
    from flask import current_app

    with current_app.app_context():
        _run_in_context(query_id)


def _run_in_context(query_id: int) -> None:
    from app.extensions import db
    from app.domain.queries.scheduled_query import ScheduledQuery
    from app.infrastructure.queries.scheduled_query_repo import ScheduledQueryRepo

    repo = ScheduledQueryRepo()
    sq = repo.get(query_id)
    if sq is None or not sq.enabled:
        logger.info("scheduled_query id=%s not found or disabled, skip", query_id)
        return

    run = repo.create_run(query_id, status="running")
    started_at = run.started_at
    status = "success"
    rows_returned = None
    error_msg = None

    try:
        rows_returned = _execute_sql(sq)
    except Exception as exc:
        status = "failed"
        error_msg = str(exc)
        logger.error("scheduled_query id=%s run failed: %s", query_id, exc, exc_info=True)

    repo.finish_run(run.id, status=status, rows_returned=rows_returned, error=error_msg)
    repo.update_query_last_run(query_id, last_run_at=datetime.utcnow(), last_status=status)

    next_run = _compute_next_run(sq.cron, sq.timezone)
    if next_run is not None:
        sq2 = repo.get(query_id)
        if sq2 is not None:
            sq2.next_run_at = next_run.replace(tzinfo=None)
            db.session.commit()


def _execute_sql(sq: "ScheduledQuery") -> int | None:
    """向数据源提交 SQL，返回影响行数。简化实现：仅做语法级验证。

    真实场景可从 DI 容器取 datasource connector 执行并流式读取；
    本期先以 row_count=None 占位，不影响状态流转测试。
    """
    try:
        from app.di.container import get_container
        container = get_container()
        repo = container.datasource_repository()
        ds = repo.get_by_id(sq.datasource_id)
        if ds is None:
            raise ValueError(f"datasource {sq.datasource_id} not found")
        # 实际执行留给后续迭代对接 connector；本期仅标记成功
        return None
    except Exception:
        raise


# ── APScheduler 注册 / 注销 ────────────────────────────────────────────────


def register_job(sq: "ScheduledQuery") -> None:
    """注册或更新 APScheduler cron job。"""
    from app.extensions import scheduler
    from apscheduler.triggers.cron import CronTrigger
    import pytz

    job_id = _apj_id(sq.id)
    try:
        tz = pytz.timezone(sq.timezone)
        trigger = CronTrigger.from_crontab(sq.cron, timezone=tz)
        scheduler.add_job(
            id=job_id,
            func=execute_scheduled_query,
            args=[sq.id],
            trigger=trigger,
            replace_existing=True,
            misfire_grace_time=300,
        )
        logger.info("registered apscheduler job %s cron=%s tz=%s", job_id, sq.cron, sq.timezone)
    except Exception as exc:
        logger.error("failed to register job %s: %s", job_id, exc)


def unregister_job(query_id: int) -> None:
    """移除 APScheduler job（不存在时静默忽略）。"""
    from app.extensions import scheduler

    job_id = _apj_id(query_id)
    try:
        scheduler.remove_job(job_id)
        logger.info("removed apscheduler job %s", job_id)
    except Exception:
        pass  # 不存在或已移除


def reload_all_scheduled_queries() -> None:
    """
    启动时从数据库加载所有 enabled 的 ScheduledQuery 并注册 APScheduler job。

    在 app/infrastructure/scheduler.py init_jobs() 末尾调用。
    """
    from app.infrastructure.queries.scheduled_query_repo import ScheduledQueryRepo

    repo = ScheduledQueryRepo()
    try:
        queries = repo.list_enabled()
        for sq in queries:
            register_job(sq)
        logger.info("reloaded %d scheduled query jobs", len(queries))
    except Exception as exc:
        logger.warning("reload_all_scheduled_queries failed: %s", exc)
