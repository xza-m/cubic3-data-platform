"""
query_export_job 单元测试（走 mocked session + adapter）
"""
from __future__ import annotations

import os
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.shared.enums import QueryExportStatus


class _FakeExport:
    """轻量 stub，避免触发 ORM 属性访问。"""

    def __init__(self, **overrides):
        self.id = overrides.get('id', 1)
        self.user_id = overrides.get('user_id', 'u1')
        self.source_id = overrides.get('source_id', 10)
        self.sql_query = overrides.get('sql_query', 'SELECT 1')
        self.status = overrides.get('status', QueryExportStatus.PENDING.value)
        self.job_id = overrides.get('job_id', 'rq-1')
        self.file_object_key = None
        self.mark_success_calls = []
        self.mark_failed_calls = []
        self.mark_cancelled_calls = 0
        self.start_calls = 0

    def start(self):
        self.start_calls += 1
        self.status = QueryExportStatus.RUNNING.value

    def mark_success(self, **kwargs):
        self.mark_success_calls.append(kwargs)
        self.status = QueryExportStatus.SUCCESS.value
        self.row_count = kwargs.get('row_count')
        self.file_size_bytes = kwargs.get('file_size_bytes')
        self.file_url = kwargs.get('file_url')
        self.file_storage = kwargs.get('file_storage')
        self.file_object_key = kwargs.get('file_object_key')

    def mark_failed(self, msg, error_code='EXECUTION_FAILED'):
        self.mark_failed_calls.append((msg, error_code))
        self.status = QueryExportStatus.FAILED.value
        self.error_message = msg
        self.error_code = error_code

    def mark_cancelled(self):
        self.mark_cancelled_calls += 1
        self.status = QueryExportStatus.CANCELLED.value


def _make_export(**overrides):
    return _FakeExport(**overrides)


@patch('app.infrastructure.tasks.jobs.query_export_job.FileDeliveryService')
@patch('app.infrastructure.tasks.jobs.query_export_job.AdapterFactory')
@patch('app.infrastructure.tasks.jobs.query_export_job.get_db_session')
@patch('app.infrastructure.tasks.jobs.query_export_job.get_current_job')
def test_success_path_local_fallback(
    mock_get_job,
    mock_get_session,
    mock_adapter_factory,
    mock_file_service,
    tmp_path,
):
    from app.infrastructure.tasks.jobs.query_export_job import execute_query_export_job

    mock_get_job.return_value = MagicMock(id='job-1')

    export = _make_export()
    datasource = SimpleNamespace(id=10, source_type='mysql', connection_config={})

    session = MagicMock()
    session.query.return_value.filter_by.return_value.first.side_effect = [export, datasource]
    mock_get_session.return_value = session

    adapter = MagicMock()
    adapter.execute_query_stream.return_value = iter([
        {'columns': [{'name': 'id'}, {'name': 'name'}], 'rows': [[1, 'a'], [2, 'b']]},
    ])
    mock_adapter_factory.create_adapter.return_value = adapter

    file_service_instance = MagicMock()
    file_service_instance.upload_local_file.return_value = {
        'method': 'local',
        'file_path': str(tmp_path / 'fake.csv'),
        'object_name': 'query_exports/20260423/export_1.csv',
        'file_size_bytes': 100,
    }
    mock_file_service.return_value = file_service_instance

    result = execute_query_export_job(export_id=1)

    assert result['status'] == 'success'
    assert result['row_count'] == 2
    assert result['storage'] == 'local'
    assert len(export.mark_success_calls) == 1


@patch('app.infrastructure.tasks.jobs.query_export_job.FileDeliveryService')
@patch('app.infrastructure.tasks.jobs.query_export_job.AdapterFactory')
@patch('app.infrastructure.tasks.jobs.query_export_job.get_db_session')
@patch('app.infrastructure.tasks.jobs.query_export_job.get_current_job')
def test_cancelling_status_aborts_loop(
    mock_get_job,
    mock_get_session,
    mock_adapter_factory,
    mock_file_service,
):
    from app.infrastructure.tasks.jobs.query_export_job import execute_query_export_job

    mock_get_job.return_value = MagicMock(id='job-1')

    export = _make_export()
    datasource = SimpleNamespace(id=10, source_type='mysql', connection_config={})

    def _refresh(obj):
        obj.status = QueryExportStatus.CANCELLING.value

    session = MagicMock()
    session.query.return_value.filter_by.return_value.first.side_effect = [export, datasource]
    session.refresh.side_effect = _refresh
    mock_get_session.return_value = session

    adapter = MagicMock()
    adapter.execute_query_stream.return_value = iter([
        {'columns': [{'name': 'id'}], 'rows': [[1]]},
    ])
    mock_adapter_factory.create_adapter.return_value = adapter

    result = execute_query_export_job(export_id=1)
    assert result['status'] == 'cancelled'
    assert export.mark_cancelled_calls == 1


@patch('app.infrastructure.tasks.jobs.query_export_job.FileDeliveryService')
@patch('app.infrastructure.tasks.jobs.query_export_job.AdapterFactory')
@patch('app.infrastructure.tasks.jobs.query_export_job.get_db_session')
@patch('app.infrastructure.tasks.jobs.query_export_job.get_current_job')
def test_adapter_error_marks_failed(
    mock_get_job,
    mock_get_session,
    mock_adapter_factory,
    mock_file_service,
):
    from app.infrastructure.tasks.jobs.query_export_job import execute_query_export_job

    mock_get_job.return_value = MagicMock(id='job-1')

    export = _make_export()
    datasource = SimpleNamespace(id=10, source_type='mysql', connection_config={})
    session = MagicMock()
    session.query.return_value.filter_by.return_value.first.side_effect = [export, datasource]
    mock_get_session.return_value = session

    adapter = MagicMock()
    adapter.execute_query_stream.side_effect = RuntimeError('connection refused')
    mock_adapter_factory.create_adapter.return_value = adapter

    result = execute_query_export_job(export_id=1)
    assert result['status'] == 'failed'
    assert len(export.mark_failed_calls) == 1
