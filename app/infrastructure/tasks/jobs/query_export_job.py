"""
异步数据导出 RQ Job

执行流程：
1. 加载 QueryExport 记录并置 running
2. 获取数据源适配器
3. 以 chunk 方式流式执行 SQL（execute_query_stream）
4. 写 ChunkedCsvWriter，每个 chunk 结束检查 cancel / limit
5. 上传到 OSS（或本地回落）
6. 写回 file_url / row_count / file_size，置 success
失败分支写 error_message 并置 failed。

本 job 不抛异常（避免 RQ 自动重试，导出任务失败后不应重试）。
"""
from __future__ import annotations

import os
import time
import traceback
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

from flask import current_app, has_app_context
from rq import get_current_job  # type: ignore

from app.domain.entities.data_source import DataSource
from app.domain.entities.query_export import QueryExport
from app.infrastructure.adapters.datasources.factory import AdapterFactory
from app.infrastructure.adapters.file_delivery.file_delivery_service import (
    FileDeliveryService,
)
from app.infrastructure.database.session import get_db_session
from app.infrastructure.tasks.jobs.chunked_csv_writer import (
    ChunkedCsvWriter,
    ExportLimitExceeded,
)
from app.shared.enums import DeliveryMethod, QueryExportStatus
from app.shared.utils.logger import get_logger


logger = get_logger(__name__)


CHUNK_BATCH_SIZE = 50_000
DEFAULT_EXPIRY_HOURS = 24 * 7  # 与 QueryExport 默认过期保持一致


def execute_query_export_job(export_id: int) -> Dict[str, Any]:
    """导出任务入口函数（RQ 调度）。"""
    current_job = get_current_job()
    session = get_db_session()
    writer: Optional[ChunkedCsvWriter] = None

    logger.info(
        "Starting query export job",
        export_id=export_id,
        job_id=current_job.id if current_job else None,
    )

    export: Optional[QueryExport] = None
    try:
        export = session.query(QueryExport).filter_by(id=export_id).first()
        if not export:
            raise ValueError(f"QueryExport {export_id} not found")

        if export.status != QueryExportStatus.PENDING.value:
            logger.warning(
                "QueryExport not pending, skipping",
                export_id=export_id,
                status=export.status,
            )
            return {'status': 'skipped', 'reason': f'status={export.status}'}

        datasource = (
            session.query(DataSource).filter_by(id=export.source_id).first()
            if export.source_id
            else None
        )
        if not datasource:
            raise ValueError(f"DataSource {export.source_id} not found")

        export.start()
        session.commit()

        adapter = AdapterFactory.create_adapter(
            datasource.source_type,
            datasource.connection_config,
        )

        started = time.time()
        columns = None
        output_dir = _get_output_dir()
        output_path = os.path.join(output_dir, f'export_{export_id}.csv')

        for batch in _stream_query(adapter, export.sql_query):
            batch_columns = _extract_column_names(batch.get('columns') or [])
            rows: Iterable[Any] = batch.get('rows') or batch.get('data') or []

            if writer is None:
                columns = batch_columns or _extract_column_names_from_rows(rows)
                if not columns:
                    # 空结果：走 success 但 row_count=0
                    columns = ['value']
                writer = ChunkedCsvWriter(columns=columns, output_path=output_path)

            writer.write_rows(rows)

            # 检查用户是否请求取消
            session.refresh(export)
            if export.status == QueryExportStatus.CANCELLING.value:
                logger.info(
                    "Cancellation requested, aborting worker loop",
                    export_id=export_id,
                )
                writer.abort()
                export.mark_cancelled()
                session.commit()
                try:
                    adapter.close()
                except Exception:  # pragma: no cover
                    pass
                return {'status': 'cancelled', 'export_id': export_id}

        # 无任何 batch 返回：创建空 writer 以便后续上传（CSV 只含表头）
        if writer is None:
            columns = ['value']
            writer = ChunkedCsvWriter(columns=columns, output_path=output_path)

        writer.close()
        row_count = writer.row_count

        # 上传
        delivery = _upload(writer.output_path, export_id=export_id)

        file_size_bytes = delivery.get('file_size_bytes') or os.path.getsize(writer.output_path)
        method = delivery.get('method') or DeliveryMethod.LOCAL.value
        download_url = delivery.get('download_url')
        object_name = delivery.get('object_name')

        if method == DeliveryMethod.OSS.value:
            storage = 'oss'
            file_url = download_url or ''
            # OSS 成功：file_object_key 存 OSS 对象名便于后续清理
            file_object_key = object_name or writer.output_path
        else:
            storage = 'local'
            file_url = _local_download_url(export_id)
            # 本地回落：file_object_key 必须是本地绝对路径，供下载代理读取
            file_object_key = writer.output_path

        export.mark_success(
            row_count=row_count,
            file_size_bytes=file_size_bytes,
            file_url=file_url,
            file_storage=storage,
            file_object_key=file_object_key,
        )
        session.commit()

        # 本地回落情况：保留文件到 instance 目录，否则清理
        if storage == 'oss':
            try:
                os.remove(writer.output_path)
            except OSError:  # pragma: no cover
                pass

        try:
            adapter.close()
        except Exception:  # pragma: no cover
            pass

        elapsed_ms = int((time.time() - started) * 1000)
        logger.info(
            "Query export job completed",
            export_id=export_id,
            row_count=row_count,
            elapsed_ms=elapsed_ms,
            storage=storage,
        )
        return {
            'status': 'success',
            'export_id': export_id,
            'row_count': row_count,
            'file_size_bytes': file_size_bytes,
            'storage': storage,
        }

    except ExportLimitExceeded as exc:
        if writer is not None:
            writer.abort()
        if export is not None:
            export.mark_failed(str(exc), error_code='EXPORT_LIMIT_EXCEEDED')
            session.commit()
        logger.warning(
            "Query export job exceeded limit",
            export_id=export_id,
            error=str(exc),
        )
        return {'status': 'failed', 'export_id': export_id, 'error': str(exc)}

    except Exception as exc:  # pragma: no cover - generic failure path
        if writer is not None:
            writer.abort()
        logger.error(
            "Query export job failed",
            export_id=export_id,
            error=str(exc),
            exc_info=True,
        )
        if export is not None:
            try:
                export.mark_failed(str(exc), error_code='EXECUTION_FAILED')
                session.commit()
            except Exception:
                session.rollback()
        return {'status': 'failed', 'export_id': export_id, 'error': str(exc)}

    finally:
        session.close()


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------


def _stream_query(adapter, sql: str):
    """优先走 adapter.execute_query_stream，若 adapter 不支持就 fallback 到 execute_query。"""
    stream_method = getattr(adapter, 'execute_query_stream', None)
    if callable(stream_method):
        try:
            yield from stream_method(sql, batch_size=CHUNK_BATCH_SIZE)
            return
        except NotImplementedError:
            pass  # fallthrough

    # Fallback：一次性执行，再拆成一批 yield
    result = adapter.execute_query(sql, limit=1_000_000)
    columns = result.get('columns') or []
    data = result.get('data') or []
    rows = result.get('rows') or data
    yield {
        'columns': columns,
        'rows': rows,
        'batch_size': len(rows) if hasattr(rows, '__len__') else 0,
    }


def _extract_column_names(columns: List[Any]) -> List[str]:
    names: List[str] = []
    for idx, col in enumerate(columns):
        if isinstance(col, dict):
            names.append(str(col.get('name') or f'column_{idx + 1}'))
        else:
            names.append(str(col))
    return names


def _extract_column_names_from_rows(rows: Iterable[Any]) -> List[str]:
    for row in rows:
        if isinstance(row, dict):
            return list(row.keys())
        break
    return []


def _upload(file_path: str, *, export_id: int) -> Dict[str, Any]:
    file_delivery = FileDeliveryService()
    timestamp = datetime.now(timezone.utc).strftime('%Y%m%d')
    object_name = f"query_exports/{timestamp}/export_{export_id}.csv"
    return file_delivery.upload_local_file(
        file_path=file_path,
        object_name=object_name,
        expiry_hours=DEFAULT_EXPIRY_HOURS,
    )


def _local_download_url(export_id: int) -> str:
    # 对本地回落场景，前端走后端 /api/v1/queries/exports/{id}/download 代理读文件
    return f"/api/v1/queries/exports/{export_id}/download"


def _get_output_dir() -> str:
    """获取导出文件的持久化目录（backend + worker 共享）。"""
    if has_app_context():
        base = current_app.config.get('QUERY_EXPORT_DIR') or current_app.config.get(
            'EXTRACTION_RESULT_DIR', 'instance/query_exports'
        )
        root = os.path.dirname(current_app.instance_path)
    else:
        base = os.environ.get('QUERY_EXPORT_DIR') or os.environ.get(
            'EXTRACTION_RESULT_DIR',
            'instance/query_exports',
        )
        root = os.getcwd()
    if not os.path.isabs(base):
        base = os.path.join(root, base)
    # 若借用了 extraction 的目录，再下钻一层避免混杂
    if base.rstrip('/').endswith('extraction_results'):
        base = os.path.join(base, 'query_exports')
    os.makedirs(base, exist_ok=True)
    return base
