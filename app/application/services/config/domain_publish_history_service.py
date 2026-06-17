"""
领域发布历史服务（B-6）

- 发布时追加一条记录（``record_publish``）
- 按 domain 分页查询（``list_publish_records``）
"""
from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.infrastructure.models.domain_publish_record import DomainPublishRecord
from app.shared.utils.logger import get_logger
from app.shared.utils.time import utcnow

logger = get_logger(__name__)


class DomainPublishHistoryService:
    """领域发布历史服务（使用 SQLAlchemy session 直接访问表）"""

    def __init__(self, session: Session) -> None:
        self._session = session

    # ------------------------------------------------------------------
    # 写入
    # ------------------------------------------------------------------

    def record_publish(
        self,
        *,
        domain_id: str,
        domain_code: Optional[str],
        snapshot: Dict[str, Any],
        published_by: Optional[str] = None,
        note: Optional[str] = None,
        diff_summary: Optional[str] = None,
        status: str = 'success',
    ) -> DomainPublishRecord:
        """追加一条发布记录（失败不会抛异常，避免影响主链路）"""
        try:
            version = self._next_version(domain_id)
            record = DomainPublishRecord(
                domain_id=str(domain_id),
                domain_code=domain_code,
                version=version,
                status=status,
                published_by=published_by,
                diff_summary=diff_summary,
                note=note,
                snapshot=snapshot,
                published_at=utcnow(),
            )
            self._session.add(record)
            self._session.commit()
            self._session.refresh(record)
            return record
        except Exception as exc:
            logger.warning(f"写入领域发布记录失败: domain_id={domain_id}, err={exc}")
            try:
                self._session.rollback()
            except Exception:
                pass
            return DomainPublishRecord(
                domain_id=str(domain_id),
                version='-',
                status='failed',
                published_at=utcnow(),
            )

    # ------------------------------------------------------------------
    # 读取
    # ------------------------------------------------------------------

    def list_publish_records(
        self,
        *,
        domain_id: str,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """按时间倒序分页返回发布记录"""
        query = self._session.query(DomainPublishRecord) \
            .filter(DomainPublishRecord.domain_id == str(domain_id))

        total = query.count()

        records = query.order_by(DomainPublishRecord.published_at.desc()) \
            .offset((page - 1) * page_size) \
            .limit(page_size) \
            .all()

        return {
            'records': [r.to_dict() for r in records],
            'total': total,
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _next_version(self, domain_id: str) -> str:
        """基于已有记录数生成 ``v{n}`` 风格的版本号"""
        try:
            count = self._session.query(DomainPublishRecord) \
                .filter(DomainPublishRecord.domain_id == str(domain_id)) \
                .count()
            return f"v{count + 1}"
        except Exception:
            return "v1"

    @staticmethod
    def compute_diff_summary(
        prev_snapshot: Optional[Dict[str, Any]],
        next_snapshot: Dict[str, Any],
    ) -> str:
        """粗粒度差异摘要: 资产范围与业务上下文变化。"""
        def _len(snapshot: Optional[Dict[str, Any]], key: str) -> int:
            if not isinstance(snapshot, dict):
                return 0
            value = snapshot.get(key) or []
            return len(value) if isinstance(value, list) else 0

        def _context(snapshot: Optional[Dict[str, Any]]) -> Dict[str, Any]:
            if not isinstance(snapshot, dict):
                return {}
            return {
                "ontology_refs": snapshot.get("ontology_refs") or {},
                "default_context": snapshot.get("default_context") or {},
                "agent_hints": snapshot.get("agent_hints") or {},
            }

        prev_cubes = _len(prev_snapshot, 'cubes')
        next_cubes = _len(next_snapshot, 'cubes')

        parts: List[str] = []
        if next_cubes != prev_cubes:
            delta = next_cubes - prev_cubes
            parts.append(f"{'+' if delta > 0 else ''}{delta} cubes")
        if _context(prev_snapshot) != _context(next_snapshot):
            parts.append("context changed")
        if not parts:
            parts.append("no asset/context change")
        return ", ".join(parts)

    @staticmethod
    def fingerprint(snapshot: Dict[str, Any]) -> str:
        """内容指纹"""
        raw = json.dumps(snapshot, sort_keys=True, default=str).encode('utf-8')
        return hashlib.md5(raw).hexdigest()
