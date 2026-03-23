"""
数据源表列表缓存实体
"""
from app.extensions import db
from app.shared.db_types import JsonType


class DataSourceTableCache(db.Model):
    """数据源表列表缓存"""
    __tablename__ = 'datasource_table_cache'

    id = db.Column(db.BigInteger, primary_key=True)
    datasource_id = db.Column(db.BigInteger, nullable=False)
    database_name = db.Column(db.String(200), nullable=False)
    table_list = db.Column(JsonType, nullable=False)
    table_count = db.Column(db.Integer)
    cached_at = db.Column(db.DateTime, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    last_access_at = db.Column(db.DateTime)
    access_count = db.Column(db.Integer, default=0)

    __table_args__ = (
        db.UniqueConstraint('datasource_id', 'database_name', name='uq_datasource_database'),
        db.Index('idx_datasource_table_cache_expires', 'expires_at'),
        db.Index('idx_datasource_table_cache_datasource', 'datasource_id'),
    )

    def __repr__(self):
        return f'<DataSourceTableCache ds={self.datasource_id} db={self.database_name}>'
