# app/infrastructure/semantic/diagnose_run_repo.py
"""DiagnoseRun 仓储（基础设施层）"""
from datetime import datetime
from typing import Optional

from app.domain.semantic.diagnose_run import DiagnoseRun
from app.extensions import db


class DiagnoseRunRepo:
    """语义诊断历史仓储。"""

    def create(self, data: dict) -> DiagnoseRun:
        run = DiagnoseRun(**data)
        db.session.add(run)
        db.session.commit()
        return run

    def get(self, run_id: int) -> Optional[DiagnoseRun]:
        return db.session.get(DiagnoseRun, run_id)

    def list(self, user_id: Optional[int], page: int, page_size: int) -> dict:
        q = db.session.query(DiagnoseRun)
        if user_id is not None:
            q = q.filter(DiagnoseRun.user_id == user_id)
        total = q.count()
        items = (
            q.order_by(DiagnoseRun.created_at.desc())
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

    def delete_older_than(self, cutoff: datetime) -> int:
        """删除 created_at < cutoff 的记录，返回删除行数。"""
        deleted = (
            db.session.query(DiagnoseRun)
            .filter(DiagnoseRun.created_at < cutoff)
            .delete(synchronize_session=False)
        )
        db.session.commit()
        return deleted
