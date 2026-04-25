"""
异步数据导出任务实体

职责：
1. 记录用户发起的数据导出任务
2. 跟踪任务生命周期（pending → running → success/failed/cancelled/expired）
3. 保存生成的结果文件元信息（URL、大小、行数、过期时间）
"""
from datetime import timedelta

from sqlalchemy import BigInteger, Column, DateTime, Index, Integer, String, Text

from app.extensions import db
from app.shared.db_types import JsonType
from app.shared.enums import QueryExportStatus
from app.shared.exceptions import InvalidOperationError
from app.shared.utils.time import utcnow


DEFAULT_EXPIRATION_DAYS = 7
DEFAULT_ROW_LIMIT = 1_000_000
DEFAULT_SIZE_LIMIT_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB


class QueryExport(db.Model):
    """
    异步数据导出任务实体
    """
    __tablename__ = 'query_exports'
    __table_args__ = (
        Index('idx_query_exports_user_created', 'user_id', 'created_at'),
        Index('idx_query_exports_status_created', 'status', 'created_at'),
        Index('idx_query_exports_status_expires', 'status', 'expires_at'),
        {'extend_existing': True},
    )

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    # 归属
    user_id = Column(String(128), nullable=False)
    source_id = Column(BigInteger, nullable=True)

    # 查询定义
    sql_query = Column(Text, nullable=False)
    visual_spec = Column(JsonType, nullable=True)

    # 状态机
    status = Column(String(20), nullable=False, default=QueryExportStatus.PENDING.value)

    # 结果
    row_count = Column(Integer, nullable=True)
    file_size_bytes = Column(BigInteger, nullable=True)
    file_url = Column(Text, nullable=True)
    file_storage = Column(String(16), nullable=True)  # 'oss' | 'local'
    file_object_key = Column(String(512), nullable=True)

    # 错误 / 任务追踪
    error_message = Column(Text, nullable=True)
    error_code = Column(String(64), nullable=True)
    job_id = Column(String(128), nullable=True)

    # 时间戳
    created_at = Column(DateTime, nullable=False, default=utcnow)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)

    # ------------------------------------------------------------------
    # 业务方法（状态机）
    # ------------------------------------------------------------------

    def start(self) -> None:
        """pending → running。"""
        if self.status != QueryExportStatus.PENDING.value:
            raise InvalidOperationError(
                f"QueryExport {self.id} cannot start from status {self.status}"
            )
        self.status = QueryExportStatus.RUNNING.value
        self.started_at = utcnow()

    def mark_success(
        self,
        *,
        row_count: int,
        file_size_bytes: int,
        file_url: str,
        file_storage: str,
        file_object_key: str,
        expiration_days: int = DEFAULT_EXPIRATION_DAYS,
    ) -> None:
        """running → success，并设置过期时间。"""
        if self.status not in (
            QueryExportStatus.RUNNING.value,
            QueryExportStatus.CANCELLING.value,
        ):
            raise InvalidOperationError(
                f"QueryExport {self.id} cannot mark_success from status {self.status}"
            )
        self.status = QueryExportStatus.SUCCESS.value
        self.finished_at = utcnow()
        self.row_count = row_count
        self.file_size_bytes = file_size_bytes
        self.file_url = file_url
        self.file_storage = file_storage
        self.file_object_key = file_object_key
        self.expires_at = self.finished_at + timedelta(days=expiration_days)

    def mark_failed(self, error_message: str, error_code: str = 'EXECUTION_FAILED') -> None:
        """任一非终态 → failed。"""
        if self.status in (
            QueryExportStatus.SUCCESS.value,
            QueryExportStatus.FAILED.value,
            QueryExportStatus.CANCELLED.value,
            QueryExportStatus.EXPIRED.value,
        ):
            raise InvalidOperationError(
                f"QueryExport {self.id} already terminated at {self.status}"
            )
        self.status = QueryExportStatus.FAILED.value
        self.finished_at = utcnow()
        # 截断避免爆库（保留前 4KB 即可用于定位）
        self.error_message = (error_message or '')[:4096]
        self.error_code = error_code

    def request_cancel(self) -> None:
        """pending/running → cancelling（或立即 cancelled）。"""
        if self.status == QueryExportStatus.PENDING.value:
            self.status = QueryExportStatus.CANCELLED.value
            self.cancelled_at = utcnow()
            self.finished_at = self.cancelled_at
            return
        if self.status == QueryExportStatus.RUNNING.value:
            self.status = QueryExportStatus.CANCELLING.value
            return
        raise InvalidOperationError(
            f"QueryExport {self.id} not cancellable at status {self.status}"
        )

    def mark_cancelled(self) -> None:
        """cancelling → cancelled（由 worker 在 chunk boundary 调用）。"""
        if self.status not in (
            QueryExportStatus.CANCELLING.value,
            QueryExportStatus.RUNNING.value,
        ):
            raise InvalidOperationError(
                f"QueryExport {self.id} cannot mark_cancelled from status {self.status}"
            )
        self.status = QueryExportStatus.CANCELLED.value
        self.cancelled_at = utcnow()
        self.finished_at = self.cancelled_at

    def expire(self) -> None:
        """success → expired（由过期清理 scheduler 调用）。"""
        if self.status != QueryExportStatus.SUCCESS.value:
            raise InvalidOperationError(
                f"QueryExport {self.id} cannot expire from status {self.status}"
            )
        self.status = QueryExportStatus.EXPIRED.value
        self.file_url = None

    # ------------------------------------------------------------------
    # 查询辅助
    # ------------------------------------------------------------------

    def is_finished(self) -> bool:
        return self.status in (
            QueryExportStatus.SUCCESS.value,
            QueryExportStatus.FAILED.value,
            QueryExportStatus.CANCELLED.value,
            QueryExportStatus.EXPIRED.value,
        )

    def is_cancel_requested(self) -> bool:
        return self.status == QueryExportStatus.CANCELLING.value

    # ------------------------------------------------------------------
    # 序列化
    # ------------------------------------------------------------------

    def to_dict(self, *, include_internal: bool = False) -> dict:
        data = {
            'id': self.id,
            'export_id': self.id,
            'user_id': self.user_id,
            'source_id': self.source_id,
            'sql_query': self.sql_query,
            'status': self.status,
            'row_count': self.row_count,
            'file_size_bytes': self.file_size_bytes,
            'file_url': self.file_url,
            'file_storage': self.file_storage,
            'error_message': self.error_message,
            'error_code': self.error_code,
            'job_id': self.job_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'finished_at': self.finished_at.isoformat() if self.finished_at else None,
            'cancelled_at': self.cancelled_at.isoformat() if self.cancelled_at else None,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
        }
        if include_internal:
            data['file_object_key'] = self.file_object_key
        return data

    def __repr__(self) -> str:
        return f'<QueryExport id={self.id} status={self.status} user={self.user_id}>'
