"""
语义对象状态注册实体
"""
from app.extensions import db
from app.shared.utils.time import utcnow
from app.shared.db_types import JsonType
from sqlalchemy import Column, DateTime, Integer, String, UniqueConstraint


class SemanticRegistryEntry(db.Model):
    """
    语义对象状态注册表。

    仅保存语义对象的状态摘要，不保存查询结果或完整编译产物。
    """

    __tablename__ = "semantic_registry_entries"
    __table_args__ = (
        UniqueConstraint("object_type", "object_name", name="uq_semantic_registry_object"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    object_type = Column(String(32), nullable=False)
    object_name = Column(String(128), nullable=False)
    source_id = Column(Integer, nullable=True)
    status = Column(String(32), nullable=True)
    definition_hash = Column(String(128), nullable=True)
    last_loaded_at = Column(DateTime, default=utcnow, nullable=True)
    publish_status = Column(String(32), nullable=True)
    last_published_at = Column(DateTime, nullable=True)
    last_drift_status = Column(String(32), nullable=True)
    last_drift_checked_at = Column(DateTime, nullable=True)
    measure_summary_snapshot = Column(JsonType, nullable=True)
    certified_measure_list = Column(JsonType, nullable=True)
    lineage_summary = Column(JsonType, nullable=True)
    source_binding_summary = Column(JsonType, nullable=True)
    domain_fingerprint = Column(String(128), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    def to_summary(self) -> dict:
        return {
            "object_type": self.object_type,
            "object_name": self.object_name,
            "source_id": self.source_id,
            "status": self.status,
            "definition_hash": self.definition_hash,
            "last_loaded_at": self.last_loaded_at.isoformat() if self.last_loaded_at else None,
            "publish_status": self.publish_status,
            "last_published_at": self.last_published_at.isoformat() if self.last_published_at else None,
            "last_drift_status": self.last_drift_status,
            "last_drift_checked_at": (
                self.last_drift_checked_at.isoformat() if self.last_drift_checked_at else None
            ),
            "measure_summary_snapshot": self.measure_summary_snapshot,
            "certified_measure_list": self.certified_measure_list,
            "lineage_summary": self.lineage_summary,
            "source_binding_summary": self.source_binding_summary,
            "domain_fingerprint": self.domain_fingerprint,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
