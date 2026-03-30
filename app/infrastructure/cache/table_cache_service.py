"""
表列表缓存服务
提供数据源表列表的缓存管理功能
"""
import logging
from datetime import datetime, timedelta
from app.shared.utils.time import utcnow
from typing import List, Tuple, Dict, Any
from sqlalchemy.orm import Session
from app.domain.entities.table_cache import DataSourceTableCache
from app.domain.entities.data_source import DataSource
from app.infrastructure.adapters.datasources.factory import AdapterFactory

logger = logging.getLogger(__name__)


class TableCacheService:
    """表缓存服务类"""
    
    CACHE_TTL_HOURS = 24  # 缓存有效期24小时
    
    def __init__(self, session: Session):
        self.session = session

    @staticmethod
    def _cache_now() -> datetime:
        """返回用于缓存比较的 UTC 时间（无时区）。

        `datasource_table_cache` 当前使用 `DateTime`（无 timezone）字段存储时间。
        历史数据和 ORM 读取出来的值可能是 naive datetime；这里统一把当前时间
        也转换为 naive UTC，避免在比较时触发 aware/naive 混用错误。
        """
        return utcnow().replace(tzinfo=None)

    @staticmethod
    def _normalize_cache_datetime(value: datetime | None) -> datetime | None:
        """将缓存字段统一转换为无时区 UTC datetime。"""
        if value is None:
            return None
        return value.replace(tzinfo=None) if value.tzinfo is not None else value
    
    def get_cached_tables(self, datasource_id: int, database: str, force_refresh: bool = False) -> Tuple[List[Dict[str, Any]], bool]:
        """
        获取缓存的表列表（异步）
        
        Args:
            datasource_id: 数据源ID
            database: 数据库名
            force_refresh: 是否强制刷新
            
        Returns:
            (tables: List, from_cache: bool) - 表列表和是否来自缓存的标识
        """
        if not force_refresh:
            now = self._cache_now()
            cache = self.session.query(DataSourceTableCache).filter_by(
                datasource_id=datasource_id,
                database_name=database
            ).first()
            
            cache_expires_at = self._normalize_cache_datetime(cache.expires_at) if cache else None
            if cache and cache_expires_at and cache_expires_at > now:
                try:
                    cache.last_access_at = now
                    cache.access_count = (cache.access_count or 0) + 1
                    self.session.commit()
                except Exception as e:
                    logger.warning(f"Failed to update cache stats: {e}")
                    self.session.rollback()
                
                logger.info(f"Cache hit for datasource {datasource_id}, database {database}")
                return cache.table_list, True
        
        logger.info(f"Cache miss for datasource {datasource_id}, database {database}, fetching from source")
        tables = self._fetch_tables_from_source(datasource_id, database)
        
        self.save_cache(datasource_id, database, tables)
        
        return tables, False
    
    def _fetch_tables_from_source(self, datasource_id: int, database: str) -> List[Dict[str, Any]]:
        """从数据源获取表列表"""
        datasource = self.session.query(DataSource).filter_by(id=datasource_id).first()
        if not datasource:
            raise ValueError(f"数据源不存在: {datasource_id}")
        
        adapter = AdapterFactory.create_adapter(
            datasource.source_type,
            datasource.connection_config
        )
        
        result = adapter.list_tables(database)
        return result
    
    def save_cache(self, datasource_id: int, database: str, tables: List[Dict[str, Any]]):
        """保存表列表到缓存"""
        try:
            now = self._cache_now()
            expires_at = now + timedelta(hours=self.CACHE_TTL_HOURS)
            
            cache = self.session.query(DataSourceTableCache).filter_by(
                datasource_id=datasource_id,
                database_name=database
            ).first()
            
            if cache:
                cache.table_list = tables
                cache.table_count = len(tables)
                cache.cached_at = now
                cache.expires_at = expires_at
                logger.info(f"Updated cache for datasource {datasource_id}, database {database}")
            else:
                cache = DataSourceTableCache(
                    datasource_id=datasource_id,
                    database_name=database,
                    table_list=tables,
                    table_count=len(tables),
                    cached_at=now,
                    expires_at=expires_at,
                    access_count=0
                )
                self.session.add(cache)
                logger.info(f"Created cache for datasource {datasource_id}, database {database}")
            
            self.session.commit()
            
        except Exception as e:
            logger.error(f"Failed to save cache for datasource {datasource_id}, database {database}: {e}")
            self.session.rollback()
            raise
    
    def refresh_expired_caches(self) -> int:
        """刷新所有过期的缓存（定时任务调用）"""
        try:
            now = self._cache_now()
            expired_caches = self.session.query(DataSourceTableCache).filter(
                DataSourceTableCache.expires_at <= now
            ).all()
            
            logger.info(f"Found {len(expired_caches)} expired caches to refresh")
            
            refreshed = 0
            for cache in expired_caches:
                try:
                    tables = self._fetch_tables_from_source(
                        cache.datasource_id,
                        cache.database_name
                    )
                    
                    self.save_cache(
                        cache.datasource_id,
                        cache.database_name,
                        tables
                    )
                    refreshed += 1
                    
                except Exception as e:
                    logger.error(
                        f"Failed to refresh cache for datasource {cache.datasource_id}, "
                        f"database {cache.database_name}: {e}"
                    )
                    continue
            
            logger.info(f"Successfully refreshed {refreshed}/{len(expired_caches)} caches")
            return refreshed
            
        except Exception as e:
            logger.error(f"Failed to refresh expired caches: {e}")
            return 0
    
    def clear_datasource_caches(self, datasource_id: int) -> int:
        """清除指定数据源的所有缓存"""
        try:
            deleted = self.session.query(DataSourceTableCache).filter_by(
                datasource_id=datasource_id
            ).delete()
            
            self.session.commit()
            logger.info(f"Cleared {deleted} caches for datasource {datasource_id}")
            return deleted
            
        except Exception as e:
            logger.error(f"Failed to clear caches for datasource {datasource_id}: {e}")
            self.session.rollback()
            return 0
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """获取缓存统计信息"""
        try:
            now = self._cache_now()
            total = self.session.query(DataSourceTableCache).count()
            expired = self.session.query(DataSourceTableCache).filter(
                DataSourceTableCache.expires_at <= now
            ).count()
            valid = total - expired
            
            return {
                'total_caches': total,
                'valid_caches': valid,
                'expired_caches': expired
            }
            
        except Exception as e:
            logger.error(f"Failed to get cache stats: {e}")
            return {
                'total_caches': 0,
                'valid_caches': 0,
                'expired_caches': 0
            }
