# app/domain/semantic/diagnose_run.py
"""DiagnoseRun 领域实体（B-back-9）"""
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, Column, DateTime, Integer, String, Text

from app.extensions import db

_PK_TYPE = BigInteger().with_variant(Integer, "sqlite")


class DiagnoseRun(db.Model):
    """语义诊断历史记录，对应 semantic_diagnose_runs 表。"""

    __tablename__ = "semantic_diagnose_runs"
    __table_args__ = {"extend_existing": True}

    id = Column(_PK_TYPE, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, nullable=False, index=True)
    input_kind = Column(String(32), nullable=False)  # nl | sql | yaml
    input_text = Column(Text, nullable=False)
    parse_ok = Column(Boolean, nullable=True)
    validate_ok = Column(Boolean, nullable=True)
    sql_text = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    # 诊断时刻语义定义集的版本标识，用于回放时检测定义是否已漂移
    definition_hash = Column(String(128), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "input_kind": self.input_kind,
            "input_text": self.input_text,
            "parse_ok": self.parse_ok,
            "validate_ok": self.validate_ok,
            "sql_text": self.sql_text,
            "error": self.error,
            "duration_ms": self.duration_ms,
            "definition_hash": self.definition_hash,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
