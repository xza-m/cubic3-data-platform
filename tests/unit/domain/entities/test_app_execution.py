"""
AppExecution 实体单元测试
"""
import pytest
from unittest.mock import MagicMock
from app.domain.entities.app_execution import AppExecution
from app.shared.utils.time import utcnow


class TestAppExecution:
    def _make_execution(self, **overrides):
        defaults = dict(
            instance_id=1,
            trigger_type='manual',
            status='pending',
        )
        defaults.update(overrides)
        ex = AppExecution(**defaults)
        ex._domain_events = []
        return ex

    def test_start_sets_running(self):
        ex = self._make_execution()
        ex.instance = MagicMock(app_code='test_app')
        ex.start()
        assert ex.status == 'running'
        assert ex.started_at is not None
        assert len(ex._domain_events) == 1

    def test_complete_success(self):
        ex = self._make_execution(status='running')
        ex.started_at = utcnow()
        ex.instance = MagicMock(app_code='test_app')
        ex.complete_success(output={'rows': 10})
        assert ex.status == 'success'
        assert ex.output == {'rows': 10}
        assert ex.duration_ms is not None

    def test_complete_failure(self):
        ex = self._make_execution(status='running')
        ex.started_at = utcnow()
        ex.instance = MagicMock(app_code='test_app')
        ex.complete_failure(error_message='timeout')
        assert ex.status == 'failed'
        assert ex.error_message == 'timeout'

    def test_collect_domain_events_clears_list(self):
        ex = self._make_execution()
        ex._domain_events = ['event1', 'event2']
        events = ex.collect_domain_events()
        assert events == ['event1', 'event2']
        assert ex._domain_events == []

    def test_to_dict(self):
        ex = self._make_execution()
        ex.id = 42
        d = ex.to_dict()
        assert d['id'] == 42
        assert d['status'] == 'pending'

    def test_complete_success_with_naive_started_at(self):
        """回归：DB 回读的 started_at 是 naive，complete_* 不应抛 TypeError 卡死 running。"""
        ex = self._make_execution(status='running')
        ex.started_at = utcnow().replace(tzinfo=None)
        ex.instance = MagicMock(app_code='test_app')
        ex.complete_success(output={'ok': True})
        assert ex.status == 'success'
        assert ex.duration_ms is not None and ex.duration_ms >= 0

    def test_complete_failure_with_naive_started_at(self):
        ex = self._make_execution(status='running')
        ex.started_at = utcnow().replace(tzinfo=None)
        ex.instance = MagicMock(app_code='test_app')
        ex.complete_failure(error_message='boom')
        assert ex.status == 'failed'
        assert ex.duration_ms is not None and ex.duration_ms >= 0

    def test_complete_failure_without_start(self):
        ex = self._make_execution(status='running')
        ex.instance = MagicMock(app_code='test_app')
        ex.complete_failure(error_message='err')
        assert ex.status == 'failed'
        assert ex.duration_ms is None
