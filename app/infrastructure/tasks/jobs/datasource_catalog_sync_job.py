"""
数据源目录同步异步任务。
"""
from __future__ import annotations

from rq import get_current_job

from app.infrastructure.database.session import get_db_session
from app.infrastructure.adapters.datasources.factory import AdapterFactory
from app.infrastructure.cache.table_cache_service import TableCacheService
from app.domain.entities.data_source import DataSource
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


def execute_datasource_catalog_sync_job(datasource_id: int):
    """刷新数据源目录与表缓存。"""
    session = get_db_session()
    current_job = get_current_job()

    datasource = session.query(DataSource).filter_by(id=datasource_id).first()
    if not datasource:
        raise ValueError(f"DataSource {datasource_id} not found")

    logger.info(
        "start_datasource_catalog_sync_job",
        datasource_id=datasource_id,
        job_id=current_job.id if current_job else None,
    )

    try:
        datasource.mark_catalog_sync_syncing()
        session.commit()

        adapter = AdapterFactory.create_adapter(
            datasource.source_type,
            datasource.connection_config,
        )
        databases = list(adapter.list_databases() or [])
        tracked = sorted({database for database in databases if database})

        cache_service = TableCacheService(session=session)
        cache_service.prune_datasource_caches(datasource.id, tracked)
        for database in tracked:
            cache_service.get_cached_tables(datasource.id, database, force_refresh=True)

        datasource.mark_catalog_sync_synced(tracked)
        session.commit()
        return {
            'datasource_id': datasource.id,
            'status': datasource.get_catalog_sync_summary()['status'],
            'tracked_databases': datasource.get_catalog_sync_summary()['tracked_databases'],
            'database_count': datasource.get_catalog_sync_summary()['database_count'],
        }
    except Exception as exc:
        session.rollback()
        datasource = session.query(DataSource).filter_by(id=datasource_id).first()
        if datasource is not None:
            datasource.mark_catalog_sync_failed(str(exc))
            session.commit()
        logger.error("datasource_catalog_sync_failed", datasource_id=datasource_id, error=str(exc), exc_info=True)
        raise
    finally:
        session.close()
