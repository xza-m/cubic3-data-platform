# app/application/queries/scheduled_query_service.py
"""ScheduledQuery 应用服务（B-back-8）"""
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from apscheduler.triggers.cron import CronTrigger

from app.shared.exceptions import EntityNotFoundError, ValidationError

logger = logging.getLogger(__name__)

_ALLOWED_UPDATE_FIELDS = {
    "name",
    "description",
    "sql",
    "datasource_id",
    "cron",
    "timezone",
}


def _validate_cron(cron: str) -> None:
    """校验 cron 表达式（5 段格式）。"""
    parts = cron.strip().split()
    if len(parts) != 5:
        raise ValidationError(f"cron 必须为 5 段格式，当前：'{cron}'")
    try:
        CronTrigger.from_crontab(cron)
    except Exception as exc:
        raise ValidationError(f"cron 解析失败：{exc}") from exc


def _compute_next_run(cron: str, tz_name: str = "Asia/Shanghai") -> Optional[datetime]:
    try:
        import pytz

        tz = pytz.timezone(tz_name)
        trigger = CronTrigger.from_crontab(cron, timezone=tz)
        fire = trigger.get_next_fire_time(None, datetime.now(tz))
        return fire.replace(tzinfo=None) if fire else None
    except Exception as exc:
        logger.warning(f"compute_next_run failed: {exc}")
        return None


class ScheduledQueryService:
    """
    ScheduledQuery 的业务逻辑层。

    职责：
    - 校验 cron 格式
    - CRUD + 分页
    - enable / disable（幂等）
    - 手动 trigger（不影响 next_run_at）
    - 同步 APScheduler job
    """

    def __init__(self, repo=None):
        if repo is None:
            from app.infrastructure.queries.scheduled_query_repo import ScheduledQueryRepo
            repo = ScheduledQueryRepo()
        self._repo = repo

    # ── 列表 / 详情 ──────────────────────────────────────────────────────────

    def list(self, page: int = 1, page_size: int = 20, owner_id: Any = None) -> dict:
        return self._repo.list(page=page, page_size=page_size, owner_id=owner_id)

    def get(self, query_id: int) -> dict:
        sq = self._repo.get(query_id)
        if sq is None:
            raise EntityNotFoundError(f"ScheduledQuery {query_id} 不存在")
        return sq.to_dict()

    # ── 创建 ──────────────────────────────────────────────────────────────────

    def create(self, data: dict, owner_id: Any) -> dict:
        cron = data.get("cron", "")
        _validate_cron(cron)
        tz = data.get("timezone", "Asia/Shanghai")
        next_run = _compute_next_run(cron, tz)
        payload = {
            "name": data["name"],
            "description": data.get("description"),
            "sql": data["sql"],
            "datasource_id": data["datasource_id"],
            "cron": cron,
            "timezone": tz,
            "enabled": data.get("enabled", True),
            "next_run_at": next_run,
            "owner_id": owner_id,
        }
        sq = self._repo.create(payload)
        if sq.enabled:
            self._sync_job(sq, enable=True)
        return sq.to_dict()

    # ── 更新 ──────────────────────────────────────────────────────────────────

    def update(self, query_id: int, data: dict) -> dict:
        sq = self._repo.get(query_id)
        if sq is None:
            raise EntityNotFoundError(f"ScheduledQuery {query_id} 不存在")

        updates: dict = {}
        for field in _ALLOWED_UPDATE_FIELDS:
            if field in data:
                updates[field] = data[field]

        if "cron" in updates:
            _validate_cron(updates["cron"])
            tz = updates.get("timezone", sq.timezone)
            updates["next_run_at"] = _compute_next_run(updates["cron"], tz)

        sq = self._repo.update(query_id, updates)
        self._sync_job(sq, enable=sq.enabled)
        return sq.to_dict()

    # ── 删除 ──────────────────────────────────────────────────────────────────

    def delete(self, query_id: int) -> None:
        sq = self._repo.get(query_id)
        if sq is None:
            raise EntityNotFoundError(f"ScheduledQuery {query_id} 不存在")
        self._unregister_job(query_id)
        self._repo.delete(query_id)

    # ── enable / disable（幂等）─────────────────────────────────────────────

    def enable(self, query_id: int) -> dict:
        sq = self._repo.get(query_id)
        if sq is None:
            raise EntityNotFoundError(f"ScheduledQuery {query_id} 不存在")
        if not sq.enabled:
            sq = self._repo.update(query_id, {"enabled": True})
            self._sync_job(sq, enable=True)
        return sq.to_dict()

    def disable(self, query_id: int) -> dict:
        sq = self._repo.get(query_id)
        if sq is None:
            raise EntityNotFoundError(f"ScheduledQuery {query_id} 不存在")
        if sq.enabled:
            sq = self._repo.update(query_id, {"enabled": False})
            self._unregister_job(query_id)
        return sq.to_dict()

    # ── 手动 trigger ──────────────────────────────────────────────────────────

    def trigger(self, query_id: int) -> dict:
        """立即执行一次；不修改 next_run_at，不影响调度周期。"""
        sq = self._repo.get(query_id)
        if sq is None:
            raise EntityNotFoundError(f"ScheduledQuery {query_id} 不存在")

        next_run_at_before = sq.next_run_at

        from app.infrastructure.queries.scheduled_query_runner import _run_in_context
        _run_in_context(query_id)

        sq = self._repo.get(query_id)
        if sq and sq.next_run_at != next_run_at_before:
            self._repo.update(query_id, {"next_run_at": next_run_at_before})
            sq = self._repo.get(query_id)

        run_result = self._repo.list_runs(query_id, page=1, page_size=1)
        run = run_result["items"][0] if run_result["items"] else {}
        return run

    # ── runs 列表 ─────────────────────────────────────────────────────────────

    def list_runs(self, query_id: int, page: int = 1, page_size: int = 20) -> dict:
        sq = self._repo.get(query_id)
        if sq is None:
            raise EntityNotFoundError(f"ScheduledQuery {query_id} 不存在")
        return self._repo.list_runs(query_id=query_id, page=page, page_size=page_size)

    # ── 内部：同步 APScheduler ────────────────────────────────────────────────

    def _sync_job(self, sq, enable: bool) -> None:
        try:
            from app.infrastructure.queries.scheduled_query_runner import register_job, unregister_job
            if enable:
                register_job(sq)
            else:
                unregister_job(sq.id)
        except Exception as exc:
            logger.warning(f"sync apscheduler job failed for query {sq.id}: {exc}")

    def _unregister_job(self, query_id: int) -> None:
        try:
            from app.infrastructure.queries.scheduled_query_runner import unregister_job
            unregister_job(query_id)
        except Exception as exc:
            logger.warning(f"unregister job failed for query {query_id}: {exc}")
