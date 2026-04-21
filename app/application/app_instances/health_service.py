# app/application/app_instances/health_service.py
"""
App 实例 health 计算服务（B-back-2）

health 状态由最近一次心跳时间与配置阈值共同决定：
  - last_heartbeat_at 距今 ≤ HEALTH_DEGRADED_SECONDS  → healthy
  - last_heartbeat_at 距今 ≤ HEALTH_UNHEALTHY_SECONDS → degraded
  - 超过 HEALTH_UNHEALTHY_SECONDS 或无心跳记录        → unhealthy

心跳来源：instance_heartbeats 表（如未建表则降级为 unhealthy + 日志说明）。

阈值配置：app/config_schema.py → AppConfig.health_degraded_seconds / health_unhealthy_seconds
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Literal, Optional

logger = logging.getLogger(__name__)

HealthStatus = Literal["healthy", "degraded", "unhealthy"]

_HEARTBEATS_TABLE = "instance_heartbeats"
_TABLE_MISSING_WARNED = False


def _warn_table_missing_once() -> None:
    global _TABLE_MISSING_WARNED
    if not _TABLE_MISSING_WARNED:
        logger.warning(
            "instance_heartbeats_table_not_found: "
            "health 字段将固定返回 'unhealthy'。"
            "请在下一个 migration 中建立 instance_heartbeats 表，"
            "schema 参考：id BIGSERIAL PK, instance_id BIGINT FK app_instances, "
            "beat_at TIMESTAMPTZ NOT NULL。"
        )
        _TABLE_MISSING_WARNED = True


def _fetch_last_heartbeat(session, instance_id: int) -> Optional[datetime]:
    """
    从 instance_heartbeats 表获取最近心跳时间。

    如果表不存在（TODO：建表），返回 None 并打印一次警告。
    """
    try:
        from sqlalchemy import text

        row = session.execute(
            text(
                "SELECT MAX(beat_at) FROM instance_heartbeats WHERE instance_id = :iid"
            ),
            {"iid": instance_id},
        ).fetchone()
        if row and row[0]:
            ts = row[0]
            if isinstance(ts, datetime):
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                return ts
        return None
    except Exception as exc:
        if "no such table" in str(exc).lower() or "does not exist" in str(exc).lower():
            _warn_table_missing_once()
        else:
            logger.warning("fetch_last_heartbeat_error instance_id=%s err=%s", instance_id, exc)
        return None


def compute_health(
    last_heartbeat_at: Optional[datetime],
    degraded_seconds: int,
    unhealthy_seconds: int,
) -> HealthStatus:
    """
    纯函数：根据最近心跳时间计算 health 状态（便于单元测试）。

    Args:
        last_heartbeat_at: 最近一次心跳时间（aware datetime 或 None）
        degraded_seconds:  超过此秒数进入 degraded
        unhealthy_seconds: 超过此秒数进入 unhealthy

    Returns:
        'healthy' | 'degraded' | 'unhealthy'
    """
    if last_heartbeat_at is None:
        return "unhealthy"

    now = datetime.now(tz=timezone.utc)
    if last_heartbeat_at.tzinfo is None:
        last_heartbeat_at = last_heartbeat_at.replace(tzinfo=timezone.utc)

    elapsed = (now - last_heartbeat_at).total_seconds()

    if elapsed <= degraded_seconds:
        return "healthy"
    if elapsed <= unhealthy_seconds:
        return "degraded"
    return "unhealthy"


def enrich_instance_with_health(
    instance_dict: Dict[str, Any],
    session,
    degraded_seconds: int,
    unhealthy_seconds: int,
) -> Dict[str, Any]:
    """
    为实例字典注入 health / last_heartbeat_at 字段（原地修改并返回）。

    Args:
        instance_dict:      AppInstance.to_dict() 输出
        session:            SQLAlchemy session（用于查询心跳表）
        degraded_seconds:   降级阈值（秒）
        unhealthy_seconds:  不健康阈值（秒）
    """
    instance_id = instance_dict.get("id")
    last_hb: Optional[datetime] = None

    if instance_id is not None:
        last_hb = _fetch_last_heartbeat(session, instance_id)

    health = compute_health(last_hb, degraded_seconds, unhealthy_seconds)
    instance_dict["health"] = health
    instance_dict["last_heartbeat_at"] = last_hb.isoformat() if last_hb else None
    return instance_dict
