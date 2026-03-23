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
            cache = self.session.query(DataSourceTableCache).filter_by(
                datasource_id=datasource_id,
                database_name=database
            ).first()
            
            if cache and cache.expires_at > utcnow():
                try:
                    cache.last_access_at = utcnow()
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
            now = utcnow()
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
            expired_caches = self.session.query(DataSourceTableCache).filter(
                DataSourceTableCache.expires_at <= utcnow()
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
            total = self.session.query(DataSourceTableCache).count()
            expired = self.session.query(DataSourceTableCache).filter(
                DataSourceTableCache.expires_at <= utcnow()
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
