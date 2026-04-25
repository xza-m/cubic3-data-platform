"""
QueryExportService 单元测试
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.application.query.services.query_export_service import (
    CONCURRENT_LIMIT,
    DAILY_LIMIT,
    QueryExportService,
)
from app.domain.entities.query_export import QueryExport
from app.shared.enums import QueryExportStatus
from app.shared.exceptions import (
    AuthorizationError,
    ExportNotCancellableError,
    InvalidSQLError,
    QueryExportNotFoundError,
    QuotaExceededError,
)


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------


class _Repo:
    """内存版仓储实现，方便做状态转移 / 计数断言。"""

    def __init__(self):
        self.store: dict[int, QueryExport] = {}
        self.saved: list[QueryExport] = []
        self.committed = 0
        self._next_id = 1
        self._active = 0
        self._today = 0

    def save(self, export: QueryExport) -> QueryExport:
        if export.id is None:
            export.id = self._next_id
            self._next_id += 1
        self.store[export.id] = export
        self.saved.append(export)
        return export

    def find_by_id(self, export_id: int):
        return self.store.get(export_id)

    def find_for_user(self, export_id: int, user_id: str):
        export = self.store.get(export_id)
        if export and export.user_id == user_id:
            return export
        return None

    def list_by_user(self, user_id, *, page=1, page_size=20, status=None):
        items = [
            e.to_dict()
            for e in self.store.values()
            if e.user_id == user_id and (not status or e.status == status)
        ]
        return {
            'items': items,
            'total': len(items),
            'page': page,
            'page_size': page_size,
            'total_pages': 1,
        }

    def list_expiring(self, cutoff, *, limit=100):
        return []

    def count_today_by_user(self, user_id):
        return self._today

    def count_active_by_user(self, user_id):
        return self._active

    def commit(self):
        self.committed += 1


def _build_service(repo=None, datasource=object()) -> tuple[QueryExportService, MagicMock, _Repo]:
    repo = repo or _Repo()
    datasource_repo = MagicMock()
    datasource_repo.find_by_id.return_value = datasource
    task_queue = MagicMock()
    task_queue.enqueue_query_export.return_value = 'rq-job-1'
    service = QueryExportService(
        export_repository=repo,
        datasource_repository=datasource_repo,
        task_queue=task_queue,
    )
    return service, task_queue, repo


# ----------------------------------------------------------------------
# Submit
# ----------------------------------------------------------------------


def test_submit_happy_path():
    service, task_queue, repo = _build_service()
    export = service.submit(user_id='u1', source_id=10, sql_query='SELECT 1')

    assert export.id == 1
    assert export.status == QueryExportStatus.PENDING.value
    assert export.user_id == 'u1'
    assert export.job_id == 'rq-job-1'
    task_queue.enqueue_query_export.assert_called_once_with(1)
    # save + commit(job_id)
    assert repo.committed >= 1


def test_submit_requires_user():
    service, _, _ = _build_service()
    with pytest.raises(AuthorizationError):
        service.submit(user_id='', source_id=10, sql_query='SELECT 1')


def test_submit_rejects_missing_source():
    repo = _Repo()
    datasource_repo = MagicMock()
    datasource_repo.find_by_id.return_value = None
    service = QueryExportService(
        export_repository=repo,
        datasource_repository=datasource_repo,
        task_queue=MagicMock(),
    )
    with pytest.raises(AuthorizationError):
        service.submit(user_id='u1', source_id=99, sql_query='SELECT 1')


def test_submit_rejects_invalid_sql():
    service, _, _ = _build_service()
    with pytest.raises(InvalidSQLError):
        service.submit(user_id='u1', source_id=10, sql_query='DROP TABLE x')


def test_submit_rejects_empty_sql():
    service, _, _ = _build_service()
    with pytest.raises(InvalidSQLError):
        service.submit(user_id='u1', source_id=10, sql_query='')


def test_submit_rejects_when_concurrent_quota_exhausted():
    repo = _Repo()
    repo._active = CONCURRENT_LIMIT  # noqa: SLF001
    service, _, _ = _build_service(repo=repo)
    with pytest.raises(QuotaExceededError) as info:
        service.submit(user_id='u1', source_id=10, sql_query='SELECT 1')
    assert info.value.details['reason'] == 'concurrent'


def test_submit_rejects_when_daily_quota_exhausted():
    repo = _Repo()
    repo._today = DAILY_LIMIT  # noqa: SLF001
    service, _, _ = _build_service(repo=repo)
    with pytest.raises(QuotaExceededError) as info:
        service.submit(user_id='u1', source_id=10, sql_query='SELECT 1')
    assert info.value.details['reason'] == 'daily'


# ----------------------------------------------------------------------
# Get / List
# ----------------------------------------------------------------------


def test_get_returns_record_for_owner():
    service, _, repo = _build_service()
    service.submit(user_id='u1', source_id=10, sql_query='SELECT 1')
    result = service.get(user_id='u1', export_id=1)
    assert result.id == 1
    assert result.user_id == 'u1'


def test_get_other_user_returns_not_found():
    service, _, repo = _build_service()
    service.submit(user_id='u1', source_id=10, sql_query='SELECT 1')
    with pytest.raises(QueryExportNotFoundError):
        service.get(user_id='u2', export_id=1)


def test_list_returns_only_current_user_items():
    service, _, repo = _build_service()
    service.submit(user_id='u1', source_id=10, sql_query='SELECT 1')
    service.submit(user_id='u2', source_id=10, sql_query='SELECT 2')
    result = service.list(user_id='u1')
    assert result['total'] == 1
    assert result['items'][0]['user_id'] == 'u1'


# ----------------------------------------------------------------------
# Cancel
# ----------------------------------------------------------------------


def test_cancel_pending_transitions_to_cancelled():
    service, task_queue, repo = _build_service()
    service.submit(user_id='u1', source_id=10, sql_query='SELECT 1')
    export = service.cancel(user_id='u1', export_id=1)
    assert export.status == QueryExportStatus.CANCELLED.value


def test_cancel_running_transitions_to_cancelling():
    service, _, repo = _build_service()
    service.submit(user_id='u1', source_id=10, sql_query='SELECT 1')
    repo.store[1].status = QueryExportStatus.RUNNING.value
    export = service.cancel(user_id='u1', export_id=1)
    assert export.status == QueryExportStatus.CANCELLING.value


def test_cancel_success_is_rejected():
    service, _, repo = _build_service()
    service.submit(user_id='u1', source_id=10, sql_query='SELECT 1')
    repo.store[1].status = QueryExportStatus.SUCCESS.value
    with pytest.raises(ExportNotCancellableError):
        service.cancel(user_id='u1', export_id=1)


def test_cancel_other_user_returns_not_found():
    service, _, repo = _build_service()
    service.submit(user_id='u1', source_id=10, sql_query='SELECT 1')
    with pytest.raises(QueryExportNotFoundError):
        service.cancel(user_id='u2', export_id=1)
