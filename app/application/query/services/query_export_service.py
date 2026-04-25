"""
异步数据导出应用服务

职责：
1. 统一配额/权限/SQL 校验
2. 把 domain 实体保存到仓储
3. 把任务推入 RQ 队列
4. 状态机转移 + 取消
"""
from typing import Any, Dict, Optional

from app.domain.entities.query_export import QueryExport
from app.domain.ports.repositories.query_export_repository_port import (
    IQueryExportRepository,
)
from app.infrastructure.repositories.datasource_repository import DatasourceRepository
from app.infrastructure.tasks.task_queue import TaskQueueManager
from app.shared.enums import QueryExportStatus
from app.shared.exceptions import (
    AuthorizationError,
    ExportNotCancellableError,
    InvalidSQLError,
    QueryExportNotFoundError,
    QuotaExceededError,
)
from app.shared.utils.logger import get_logger
from app.shared.utils.sql_validator import validate_sql_query


logger = get_logger(__name__)


DAILY_LIMIT = 20
CONCURRENT_LIMIT = 3
CONCURRENT_RETRY_AFTER_SECONDS = 60
DAILY_RETRY_AFTER_SECONDS = 3600


class QueryExportService:
    """QueryExport 应用服务"""

    def __init__(
        self,
        *,
        export_repository: IQueryExportRepository,
        datasource_repository: DatasourceRepository,
        task_queue: TaskQueueManager,
    ):
        self.export_repository = export_repository
        self.datasource_repository = datasource_repository
        self.task_queue = task_queue

    # ------------------------------------------------------------------
    # 提交
    # ------------------------------------------------------------------

    def submit(
        self,
        *,
        user_id: str,
        source_id: int,
        sql_query: str,
        visual_spec: Optional[Dict[str, Any]] = None,
    ) -> QueryExport:
        self._validate_user(user_id)
        self._validate_source(source_id, user_id=user_id)
        self._validate_sql(sql_query)
        self._check_quota(user_id)

        export = QueryExport(
            user_id=user_id,
            source_id=source_id,
            sql_query=sql_query,
            visual_spec=visual_spec,
            status=QueryExportStatus.PENDING.value,
        )
        export = self.export_repository.save(export)

        try:
            job_id = self.task_queue.enqueue_query_export(export.id)
            export.job_id = job_id
            self.export_repository.commit()
        except Exception as exc:  # pragma: no cover - infrastructure error path
            logger.error(
                "Failed to enqueue query export",
                export_id=export.id,
                error=str(exc),
                exc_info=True,
            )
            export.mark_failed(
                f"enqueue failed: {exc}",
                error_code='ENQUEUE_FAILED',
            )
            self.export_repository.commit()
            raise

        return export

    # ------------------------------------------------------------------
    # 读取
    # ------------------------------------------------------------------

    def get(self, *, user_id: str, export_id: int) -> QueryExport:
        export = self.export_repository.find_for_user(export_id, user_id)
        if not export:
            raise QueryExportNotFoundError(export_id)
        return export

    def list(
        self,
        *,
        user_id: str,
        page: int = 1,
        page_size: int = 20,
        status: Optional[str] = None,
    ) -> dict:
        return self.export_repository.list_by_user(
            user_id,
            page=page,
            page_size=page_size,
            status=status,
        )

    # ------------------------------------------------------------------
    # 取消
    # ------------------------------------------------------------------

    def cancel(self, *, user_id: str, export_id: int) -> QueryExport:
        export = self.export_repository.find_for_user(export_id, user_id)
        if not export:
            raise QueryExportNotFoundError(export_id)

        if export.status in (
            QueryExportStatus.SUCCESS.value,
            QueryExportStatus.FAILED.value,
            QueryExportStatus.CANCELLED.value,
            QueryExportStatus.EXPIRED.value,
        ):
            raise ExportNotCancellableError(export_id, export.status)

        prior_status = export.status
        export.request_cancel()
        self.export_repository.commit()

        # pending → 直接置 cancelled，同时尝试把 RQ job 从队列移除
        if prior_status == QueryExportStatus.PENDING.value and export.job_id:
            self._best_effort_cancel_job(export.job_id)

        return export

    # ------------------------------------------------------------------
    # 内部校验
    # ------------------------------------------------------------------

    @staticmethod
    def _validate_user(user_id: str) -> None:
        if not user_id or not str(user_id).strip():
            raise AuthorizationError("Authenticated user required for export")

    def _validate_source(self, source_id: int, *, user_id: str) -> None:
        if not source_id or int(source_id) <= 0:
            raise InvalidSQLError("source_id is required")
        datasource = self.datasource_repository.find_by_id(source_id)
        if not datasource:
            # 统一按权限缺失处理，避免枚举数据源
            raise AuthorizationError(
                f"User {user_id} has no access to source {source_id}"
            )

    @staticmethod
    def _validate_sql(sql: str) -> None:
        if not sql or not sql.strip():
            raise InvalidSQLError("sql_query is required")
        is_valid, errors = validate_sql_query(sql)
        if not is_valid:
            raise InvalidSQLError("; ".join(errors) or "invalid sql_query")

    def _check_quota(self, user_id: str) -> None:
        active = self.export_repository.count_active_by_user(user_id)
        if active >= CONCURRENT_LIMIT:
            raise QuotaExceededError(
                CONCURRENT_RETRY_AFTER_SECONDS,
                reason='concurrent',
            )
        today = self.export_repository.count_today_by_user(user_id)
        if today >= DAILY_LIMIT:
            raise QuotaExceededError(
                DAILY_RETRY_AFTER_SECONDS,
                reason='daily',
            )

    def _best_effort_cancel_job(self, job_id: str) -> None:
        """尽量删除 RQ 队列中的 pending job；失败只记日志。"""
        try:
            from rq.job import Job  # type: ignore

            job = Job.fetch(job_id, connection=self.task_queue.redis_conn)
            job.cancel()
        except Exception as exc:  # pragma: no cover - external failure tolerated
            logger.info(
                "Best-effort RQ cancel failed",
                job_id=job_id,
                error=str(exc),
            )
