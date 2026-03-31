"""
提取执行记录实体测试
"""
from datetime import datetime

from app.domain.entities.extraction_run import ExtractionRun
from app.shared.enums import DeliveryMethod, TaskStatus


class TestExtractionRun:
    def test_start_and_mark_as_success(self, monkeypatch):
        times = iter(
            [
                datetime(2026, 1, 1, 8, 0, 0),
                datetime(2026, 1, 1, 8, 0, 5),
            ]
        )
        monkeypatch.setattr("app.domain.entities.extraction_run.utcnow", lambda: next(times))
        run = ExtractionRun(task_id=1, generated_sql="SELECT 1")

        run.start()
        run.mark_as_success(
            {
                "row_count": 10,
                "file_path": "/tmp/result.csv",
                "file_size_mb": 1.5,
                "delivery_method": DeliveryMethod.LOCAL.value,
                "delivery_info": {"filename": "result.csv"},
            }
        )

        assert run.status == TaskStatus.SUCCESS.value
        assert run.duration_ms == 5000
        assert run.can_download() is True
        data = run.to_dict(include_sql=True)
        assert data["duration_seconds"] == 5.0
        assert data["generated_sql"] == "SELECT 1"
        assert "id=None" in repr(run)

    def test_mark_as_failed_and_timeout(self, monkeypatch):
        times = iter(
            [
                datetime(2026, 1, 1, 8, 0, 0),
                datetime(2026, 1, 1, 8, 0, 3),
                datetime(2026, 1, 1, 8, 0, 8),
                datetime(2026, 1, 1, 8, 0, 12),
            ]
        )
        monkeypatch.setattr("app.domain.entities.extraction_run.utcnow", lambda: next(times))

        failed = ExtractionRun(task_id=1, start_time=datetime(2026, 1, 1, 8, 0, 0))
        failed.mark_as_failed("boom", error_stack="stack")
        assert failed.status == TaskStatus.FAILED.value
        assert failed.error_message == "boom"
        assert failed.error_stack == "stack"
        assert failed.is_finished() is True
        assert failed.is_successful() is False

        timeout = ExtractionRun(task_id=2)
        timeout.mark_as_timeout()
        assert timeout.status == TaskStatus.TIMEOUT.value
        assert timeout.duration_ms is None
        assert timeout.error_message == "Task execution timeout"
        assert timeout.get_duration_seconds() == 0.0
        assert timeout.can_download() is False

        timeout_with_start = ExtractionRun(task_id=3, start_time=datetime(2026, 1, 1, 8, 0, 4))
        timeout_with_start.mark_as_timeout()
        assert timeout_with_start.duration_ms == 4000
