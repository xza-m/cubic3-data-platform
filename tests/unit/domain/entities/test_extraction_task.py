"""
提取任务实体测试
"""
import pytest
from app.domain.entities.extraction_task import ExtractionTask
from app.shared.enums import TaskType


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
