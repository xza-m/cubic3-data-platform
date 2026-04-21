# app/infrastructure/semantic/view_materialize_repo.py
"""
语义 View 物化仓储 — 负责 semantic_views + semantic_view_materialize_runs 的 DB 读写。
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

import sqlalchemy as sa

from app.extensions import db
from app.domain.semantic.views_materialize import SemanticViewMaterializeRun


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class ViewMaterializeRepository:
    """仓储：写入/查询物化运行记录，并维护 semantic_views 上的状态字段。"""

    # ── semantic_views 状态 ──────────────────────────────────────────────────

    def get_view_materialize_status(self, view_id: int) -> dict[str, Any]:
        """读取 semantic_views 对应行的 materialized_at / materialize_status。

        semantic_views 由其他服务管理，此处只读两列。若表不存在或行不存在则返回默认值。
        """
        try:
            result = db.session.execute(
                sa.text(
                    "SELECT materialized_at, materialize_status "
                    "FROM semantic_views WHERE id = :id"
                ),
                {"id": view_id},
            ).fetchone()
        except Exception:
            return {"materialized_at": None, "materialize_status": "idle"}

        if result is None:
            return {"materialized_at": None, "materialize_status": "idle"}

        mat_at = result[0]
        if mat_at is not None:
            mat_at_str = mat_at.isoformat() if hasattr(mat_at, "isoformat") else str(mat_at)
        else:
            mat_at_str = None
        return {
            "materialized_at": mat_at_str,
            "materialize_status": result[1] or "idle",
        }

    def set_view_materialize_status(
        self,
        view_id: int,
        *,
        status: str,
        materialized_at: Optional[datetime] = None,
    ) -> None:
        """更新 semantic_views 上的物化状态列（idempotent）。"""
        params: dict[str, Any] = {"id": view_id, "status": status}
        if materialized_at is not None:
            params["materialized_at"] = materialized_at
            db.session.execute(
                sa.text(
                    "UPDATE semantic_views "
                    "SET materialize_status = :status, materialized_at = :materialized_at "
                    "WHERE id = :id"
                ),
                params,
            )
        else:
            db.session.execute(
                sa.text(
                    "UPDATE semantic_views SET materialize_status = :status WHERE id = :id"
                ),
                params,
            )
        db.session.commit()

    # ── semantic_view_materialize_runs ───────────────────────────────────────

    def create_run(self, view_id: int) -> SemanticViewMaterializeRun:
        """插入一条 running 状态的物化记录，返回已持久化的对象。"""
        run = SemanticViewMaterializeRun(
            view_id=view_id,
            status="running",
            started_at=_utcnow(),
        )
        db.session.add(run)
        db.session.commit()
        db.session.refresh(run)
        return run

    def finish_run(
        self,
        run_id: int,
        *,
        success: bool,
        error: Optional[str] = None,
    ) -> None:
        """将运行记录标记为 idle（成功）或 failed。"""
        run = db.session.get(SemanticViewMaterializeRun, run_id)
        if run is None:
            return
        run.status = "idle" if success else "failed"
        run.finished_at = _utcnow()
        if error:
            run.error = error
        db.session.commit()

    def list_runs(
        self,
        view_id: int,
        *,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        """分页查询某个 view 的物化运行历史，按 started_at 倒序。"""
        page = max(1, page)
        page_size = min(max(1, page_size), 200)

        base_q = (
            db.session.query(SemanticViewMaterializeRun)
            .filter(SemanticViewMaterializeRun.view_id == view_id)
        )
        total = base_q.count()
        items = (
            base_q.order_by(SemanticViewMaterializeRun.started_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return {
            "items": [r.to_dict() for r in items],
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    def get_run(self, run_id: int) -> Optional[SemanticViewMaterializeRun]:
        return db.session.get(SemanticViewMaterializeRun, run_id)
