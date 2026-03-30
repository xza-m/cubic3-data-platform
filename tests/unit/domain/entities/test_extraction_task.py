"""
提取任务实体测试
"""
from datetime import datetime
from unittest.mock import MagicMock

import pytest

from app.domain.entities.dataset import Dataset
from app.domain.entities.extraction_run import ExtractionRun
from app.domain.entities.extraction_task import ExtractionTask
from app.shared.enums import TaskStatus, TaskType
from app.shared.exceptions import InvalidFieldsError, TaskNotActiveError


class TestExtractionTask:
    """提取任务实体测试"""

    def test_create_task_with_valid_data(self):
        """测试创建有效任务"""
        task = ExtractionTask(
            task_name="测试任务",
            dataset_id=1,
            select_fields=["id", "name"],
            filter_conditions={},
            is_active=True,
        )

        assert task.task_name == "测试任务"
        assert task.dataset_id == 1
        assert len(task.select_fields) == 2
        assert task.is_active is True

    def test_task_with_row_limit(self):
        """测试带行数限制的任务"""
        task = ExtractionTask(
            task_name="限制任务",
            dataset_id=1,
            select_fields=["id"],
            filter_conditions={},
            row_limit=10000,
        )

        assert task.row_limit == 10000

    def test_task_type_explicit(self):
        """测试任务类型可以显式设置"""
        task = ExtractionTask(
            task_name="定时任务",
            dataset_id=1,
            select_fields=["id"],
            filter_conditions={},
            task_type=TaskType.MANUAL.value,
        )

        assert task.task_type == TaskType.MANUAL.value

    def test_task_with_filter_conditions(self):
        """测试带过滤条件的任务"""
        filter_conditions = {
            "logic": "AND",
            "filters": [
                {"field": "id", "operator": ">", "value": 100}
            ],
        }

        task = ExtractionTask(
            task_name="过滤任务",
            dataset_id=1,
            select_fields=["id", "name"],
            filter_conditions=filter_conditions,
        )

        assert task.filter_conditions["logic"] == "AND"
        assert len(task.filter_conditions["filters"]) == 1

    def test_record_and_clear_events(self):
        task = ExtractionTask(task_name="事件任务", dataset_id=1, select_fields=[], filter_conditions={})
        task.record_event("created")
        task.record_event("updated")

        assert task.clear_events() == ["created", "updated"]
        assert task.clear_events() == []

    def test_execute_requires_active_task(self):
        task = ExtractionTask(
            id=9,
            task_name="停用任务",
            dataset_id=1,
            select_fields=["id"],
            filter_conditions={},
            is_active=False,
        )

        with pytest.raises(TaskNotActiveError):
            task.execute(triggered_by="tester")

    def test_execute_creates_pending_run(self, monkeypatch):
        now = datetime(2026, 1, 1, 9, 0, 0)
        monkeypatch.setattr("app.domain.entities.extraction_task.utcnow", lambda: now)
        task = ExtractionTask(
            id=7,
            task_name="执行任务",
            dataset_id=1,
            select_fields=["id"],
            filter_conditions={},
            sql_template="SELECT 1",
            is_active=True,
        )

        run = task.execute(triggered_by="tester")

        assert isinstance(run, ExtractionRun)
        assert run.task_id == 7
        assert run.status == TaskStatus.PENDING.value
        assert run.generated_sql == "SELECT 1"
        assert run.start_time == now

    def test_update_last_run_info_and_toggle_active_state(self, monkeypatch):
        now = datetime(2026, 1, 1, 10, 0, 0)
        monkeypatch.setattr("app.domain.entities.extraction_task.utcnow", lambda: now)
        task = ExtractionTask(task_name="状态任务", dataset_id=1, select_fields=["id"], filter_conditions={})

        task.update_last_run_info(TaskStatus.SUCCESS.value, now)
        assert task.last_run_status == TaskStatus.SUCCESS.value
        assert task.last_run_at == now
        assert task.updated_at == now

        task.deactivate()
        assert task.is_active is False
        task.activate()
        assert task.is_active is True

    def test_validate_fields_rejects_none_and_invalid_field(self):
        task = ExtractionTask(task_name="校验任务", dataset_id=1, select_fields=None, filter_conditions={})
        with pytest.raises(InvalidFieldsError):
            task.validate_fields()

        dataset = MagicMock()
        dataset.fields = [MagicMock(physical_name="id"), MagicMock(physical_name="name")]
        task = ExtractionTask(task_name="校验任务", dataset_id=1, select_fields=["id", "email"], filter_conditions={})
        task.dataset = dataset

        with pytest.raises(InvalidFieldsError) as exc:
            task.validate_fields()

        assert exc.value.details["invalid_fields"] == ["email"]

    def test_can_execute_recent_runs_and_success_rate(self):
        task = ExtractionTask(task_name="查询任务", dataset_id=1, select_fields=["id"], filter_conditions={}, is_active=True)
        task.__dict__["dataset"] = Dataset(dataset_code="ds", dataset_name="数据集")
        assert task.can_execute() is True

        ordered = MagicMock()
        limited = MagicMock()
        limited.all.return_value = ["run1", "run2"]
        ordered.limit.return_value = limited
        runs = MagicMock()
        runs.order_by.return_value = ordered
        original_runs = ExtractionTask.runs
        ExtractionTask.runs = runs
        try:
            assert task.get_recent_runs(limit=2) == ["run1", "run2"]
            runs.order_by.assert_called_once()

            task.runs.count.return_value = 0
            assert task.get_success_rate() == 0.0

            task.runs.count.return_value = 4
            task.runs.filter_by.return_value.count.return_value = 3
            assert task.get_success_rate() == 0.75
        finally:
            ExtractionTask.runs = original_runs

    def test_to_dict_include_stats_and_repr(self):
        task = ExtractionTask(
            id=3,
            task_name="统计任务",
            task_code="task_3",
            dataset_id=1,
            select_fields=["id"],
            filter_conditions={"logic": "AND"},
            row_limit=100,
            task_type=TaskType.API.value,
            is_active=True,
        )
        task.created_at = datetime(2026, 1, 1, 11, 0, 0)
        task.updated_at = datetime(2026, 1, 1, 12, 0, 0)
        runs = MagicMock()
        runs.count.return_value = 2
        runs.filter_by.return_value.count.return_value = 1
        original_runs = ExtractionTask.runs
        ExtractionTask.runs = runs

        try:
            data = task.to_dict(include_stats=True)
        finally:
            ExtractionTask.runs = original_runs

        assert data["stats"] == {"total_runs": 2, "success_rate": 0.5}
        assert data["task_type"] == TaskType.API.value
        assert "统计任务" in repr(task)
