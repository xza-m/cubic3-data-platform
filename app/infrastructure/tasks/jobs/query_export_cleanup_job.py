"""
异步数据导出过期清理任务

由 Flask-APScheduler 每小时触发，扫描 status=success 且 expires_at <= now()
的 QueryExport 记录：
- 删 OSS 对象 / 本地文件
- 将状态置为 expired，file_url 置空，保留 row_count / file_size_bytes 供审计
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import List

from app.domain.entities.query_export import QueryExport
from app.infrastructure.database.session import get_db_session
from app.shared.enums import QueryExportStatus
from app.shared.utils.logger import get_logger


logger = get_logger(__name__)


MAX_BATCH = 200


def execute_query_export_cleanup_job() -> dict:
    """扫描并清理过期的导出任务文件。"""
    session = get_db_session()
    try:
        cutoff = datetime.now(timezone.utc).replace(tzinfo=None)
        expired: List[QueryExport] = (
            session.query(QueryExport)
            .filter(
                QueryExport.status == QueryExportStatus.SUCCESS.value,
                QueryExport.expires_at.isnot(None),
                QueryExport.expires_at <= cutoff,
            )
            .limit(MAX_BATCH)
            .all()
        )

        if not expired:
            return {'scanned': 0, 'expired': 0}

        deleted = 0
        for export in expired:
            try:
                _delete_file(export)
            except Exception as exc:  # pragma: no cover - external failure path
                logger.warning(
                    "Failed to delete export file",
                    export_id=export.id,
                    storage=export.file_storage,
                    object_key=export.file_object_key,
                    error=str(exc),
                )
            try:
                export.expire()
                deleted += 1
            except Exception:  # pragma: no cover
                logger.exception(
                    "Failed to transition export to expired",
                    export_id=export.id,
                )
        session.commit()
        logger.info(
            "Query export cleanup finished",
            scanned=len(expired),
            expired=deleted,
        )
        return {'scanned': len(expired), 'expired': deleted}
    except Exception:  # pragma: no cover
        session.rollback()
        raise
    finally:
        session.close()


def _delete_file(export: QueryExport) -> None:
    if not export.file_object_key:
        return
    if export.file_storage == 'oss':
        _delete_oss_object(export.file_object_key)
    else:
        _delete_local_file(export.file_object_key)


def _delete_local_file(path: str) -> None:
    if path and os.path.exists(path):
        os.remove(path)


def _delete_oss_object(object_name: str) -> None:
    try:
        from flask import current_app

        access_key = current_app.config.get('OSS_ACCESS_KEY_ID')
        access_secret = current_app.config.get('OSS_ACCESS_KEY_SECRET')
        endpoint = current_app.config.get('OSS_ENDPOINT')
        bucket_name = current_app.config.get('OSS_BUCKET_NAME')
        if not all([access_key, access_secret, endpoint, bucket_name]):
            return
        import oss2  # type: ignore

        auth = oss2.Auth(access_key, access_secret)
        bucket = oss2.Bucket(auth, endpoint, bucket_name)
        bucket.delete_object(object_name)
    except ImportError:
        return
    except Exception as exc:
        logger.warning(
            "OSS delete failed",
            object_name=object_name,
            error=str(exc),
        )
