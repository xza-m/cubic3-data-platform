"""
执行器单元测试

覆盖 5 个执行器：
- SchemaDriftExecutor
- BiDashboardPushExecutor
- DatasetCardPushExecutor
- ExtractionNotifyExecutor
- QueryResultPushExecutor

测试场景：成功执行、异常失败、配置校验
"""
import base64
import pytest
from datetime import datetime
from unittest.mock import MagicMock, patch

from app.domain.app_center.execution_context import (
    ExecutionContext,
    ExecutionResult,
    ExecutionStatus,
    TriggerType,
    ValidationResult,
)
from app.executors.schema_drift_executor import SchemaDriftExecutor
from app.executors.bi_dashboard_push_executor import BiDashboardPushExecutor
from app.executors.dataset_card_push_executor import DatasetCardPushExecutor
from app.executors.extraction_notify_executor import ExtractionNotifyExecutor
from app.executors.query_result_push_executor import QueryResultPushExecutor


# ============================================================================
# Fixtures
# ============================================================================


def make_context(config=None, extra_data=None, instance_name="test_instance"):
    """构建执行上下文"""
    context = ExecutionContext(
        execution_id=1,
        instance_id=1,
        app_code="test_app",
        instance_name=instance_name,
        config=config or {},
        trigger_type=TriggerType.MANUAL,
        triggered_by="user1",
        extra_data=extra_data or {},
    )
    # 部分执行器使用 context.instance.name
    context.instance = MagicMock()
    context.instance.name = instance_name
    return context


# ============================================================================
# SchemaDriftExecutor
# ============================================================================


class TestSchemaDriftExecutor:
    def test_success_when_no_maxcompute_skips_check(self, app):
        """无 MaxCompute 数据源时跳过检测，返回 SUCCESS"""
        executor = SchemaDriftExecutor()
        context = make_context(config={})

        with patch.object(executor, "_get_maxcompute_adapter", return_value=(None, None)):
            result = executor.execute(context)

        assert result.status == ExecutionStatus.SUCCESS
        assert result.output["skipped"] is True
        assert result.output["reason"] == "no_maxcompute_source"

    def test_success_with_drift_check_and_notify(self, app):
        """有 MaxCompute 且检测完成（含 webhook 通知）返回 SUCCESS"""
        executor = SchemaDriftExecutor()
        context = make_context(config={"webhook_url": "https://open.feishu.cn/xxx"})

        mock_report = MagicMock()
        mock_report.checked_cubes = 2
        mock_report.total_cubes = 2
        mock_report.drifts = [MagicMock(cube="c1", table="t1", kind="missing", column="col1", detail="")]
        mock_report.has_drifts = True
        mock_report.to_dict.return_value = {
            "total_cubes": 2,
            "checked_cubes": 2,
            "skipped_cubes": [],
            "drifts": [{"cube": "c1", "table": "t1", "kind": "missing", "column": "col1", "detail": ""}],
        }

        with patch.object(executor, "_get_maxcompute_adapter", return_value=(MagicMock(), "project1")):
            with patch("app.di.container.get_container") as mock_get_container:
                mock_container = MagicMock()
                mock_get_container.return_value = mock_container
                mock_cube_repo = MagicMock()
                mock_container.cube_repository.return_value = mock_cube_repo

                with patch("app.application.semantic.schema_sync_service.SchemaSyncService") as MockSyncSvc:
                    mock_sync = MockSyncSvc.return_value
                    mock_sync.check_all.return_value = mock_report

                    with patch("app.infrastructure.notification.feishu_webhook.FeishuWebhookNotifier") as MockNotifier:
                        mock_notifier = MockNotifier.return_value
                        result = executor.execute(context)

        assert result.status == ExecutionStatus.SUCCESS
        assert result.output["total_cubes"] == 2
        assert result.output["notified"] is True
        mock_notifier.send_schema_drift_report.assert_called_once()

    def test_failed_on_exception(self, app):
        """执行中异常时返回 FAILED"""
        executor = SchemaDriftExecutor()
        context = make_context(config={})

        with patch.object(executor, "_get_maxcompute_adapter", side_effect=RuntimeError("db error")):
            result = executor.execute(context)

        assert result.status == ExecutionStatus.FAILED
        assert "db error" in (result.error_message or "")

    def test_validate_config_always_valid(self):
        """SchemaDriftExecutor 配置校验始终通过（webhook_url 可选）"""
        executor = SchemaDriftExecutor()
        vr = executor.validate_config({})
        assert vr.is_valid is True


# ============================================================================
# BiDashboardPushExecutor
# ============================================================================


class TestBiDashboardPushExecutor:
    def test_success_returns_screenshot_data(self):
        """成功获取截图返回 SUCCESS"""
        executor = BiDashboardPushExecutor()
        context = make_context(config={
            "superset": {
                "base_url": "http://superset:8088",
                "dashboard_id": 1,
                "username": "admin",
                "password": "admin",
                "screenshot_width": 1920,
            }
        })

        with patch.object(executor, "_get_superset_token", return_value="token123"):
            with patch.object(executor, "_try_fetch_screenshot", return_value=(b"fake_image_bytes", "screenshot_endpoint")):
                with patch.object(executor, "_get_dashboard_info", return_value={"dashboard_title": "测试看板"}):
                    result = executor.execute(context)

        assert result.status == ExecutionStatus.SUCCESS
        assert result.output["dashboard_id"] == 1
        assert result.output["dashboard_name"] == "测试看板"
        assert result.output["screenshot_available"] is True
        assert result.output["screenshot_base64"] == base64.b64encode(b"fake_image_bytes").decode("utf-8")

    def test_screenshot_unavailable_degrades_to_link_push(self):
        """Superset 未开启截图能力时降级为链接推送，不视为失败"""
        executor = BiDashboardPushExecutor()
        context = make_context(config={
            "superset": {
                "base_url": "http://superset:8088",
                "dashboard_id": 1,
                "username": "admin",
                "password": "admin",
            }
        })

        with patch.object(executor, "_get_superset_token", return_value="token123"):
            with patch.object(executor, "_try_fetch_screenshot", return_value=(None, "需开启 THUMBNAILS")):
                with patch.object(executor, "_get_dashboard_info", return_value={"dashboard_title": "测试看板"}):
                    result = executor.execute(context)

        assert result.status == ExecutionStatus.SUCCESS
        assert result.output["screenshot_available"] is False
        assert result.output["screenshot_base64"] is None
        assert "THUMBNAILS" in result.output["screenshot_note"]
        assert result.output["dashboard_url"].endswith("/superset/dashboard/1/")

    def test_failed_on_exception(self):
        """Superset API 异常时返回 FAILED"""
        executor = BiDashboardPushExecutor()
        context = make_context(config={
            "superset": {
                "base_url": "http://superset:8088",
                "dashboard_id": 1,
                "username": "admin",
                "password": "admin",
            }
        })

        with patch.object(executor, "_get_superset_token", side_effect=Exception("login failed")):
            result = executor.execute(context)

        assert result.status == ExecutionStatus.FAILED
        assert "login failed" in (result.error_message or "")

    def test_validate_config_missing_required_fields(self):
        """缺少 superset 必填项时校验失败"""
        executor = BiDashboardPushExecutor()
        vr = executor.validate_config({"superset": {}})
        assert vr.is_valid is False
        assert "superset.base_url" in vr.errors or "base_url" in str(vr.errors)
        assert "superset.dashboard_id" in vr.errors or "dashboard_id" in str(vr.errors)
        assert "superset.username" in vr.errors or "username" in str(vr.errors)
        assert "superset.password" in vr.errors or "password" in str(vr.errors)


# ============================================================================
# DatasetCardPushExecutor
# ============================================================================


class TestDatasetCardPushExecutor:
    def test_success_returns_card_data(self, app, db_session):
        """成功查询数据集并生成卡片返回 SUCCESS"""
        from app.domain.entities import Dataset, DataSource

        executor = DatasetCardPushExecutor()
        context = make_context(config={"dataset_id": 1, "include_fields": True, "include_stats": True})

        ds = DataSource(id=1, name="ds1", source_type="mysql", connection_config={})
        db_session.add(ds)
        db_session.flush()

        dataset = Dataset(
            id=1,
            dataset_code="ds1",
            dataset_name="测试数据集",
            dataset_type="physical",
            source_id=ds.id,
            physical_table="t1",
            owner="admin",
            sync_status="synced",
        )
        db_session.add(dataset)
        db_session.commit()

        result = executor.execute(context)

        assert result.status == ExecutionStatus.SUCCESS
        assert result.output["dataset_id"] == 1
        assert result.output["dataset_name"] == "测试数据集"
        assert "feishu_card" in result.output

    def test_failed_when_dataset_not_found(self, app, db_session):
        """数据集不存在时返回 FAILED"""
        executor = DatasetCardPushExecutor()
        context = make_context(config={"dataset_id": 99999})

        result = executor.execute(context)

        assert result.status == ExecutionStatus.FAILED
        assert "不存在" in (result.error_message or "")

    def test_validate_config_missing_dataset_id(self):
        """缺少 dataset_id 时校验失败"""
        executor = DatasetCardPushExecutor()
        vr = executor.validate_config({})
        assert vr.is_valid is False
        assert "dataset_id" in vr.errors


# ============================================================================
# ExtractionNotifyExecutor
# ============================================================================


class TestExtractionNotifyExecutor:
    def test_success_on_completed_event(self):
        """extraction.completed 事件且配置通知时返回 SUCCESS"""
        executor = ExtractionNotifyExecutor()
        context = make_context(
            config={"notify_on_success": True, "notify_on_failure": True},
            extra_data={
                "event_type": "extraction.completed",
                "extraction_data": {
                    "task_id": 1,
                    "task_name": "任务1",
                    "row_count": 100,
                    "duration": "5s",
                },
            },
        )

        result = executor.execute(context)

        assert result.status == ExecutionStatus.SUCCESS
        assert result.output["notified"] is True
        assert result.output["event_type"] == "extraction.completed"

    def test_success_skip_when_notify_disabled(self):
        """配置不通知成功时跳过，仍返回 SUCCESS"""
        executor = ExtractionNotifyExecutor()
        context = make_context(
            config={"notify_on_success": False, "notify_on_failure": True},
            extra_data={
                "event_type": "extraction.completed",
                "extraction_data": {"task_id": 1},
            },
        )

        result = executor.execute(context)

        assert result.status == ExecutionStatus.SUCCESS
        assert result.output["notified"] is False
        assert "配置为不通知" in result.output.get("reason", "")

    def test_failed_on_exception(self):
        """处理异常时返回 FAILED"""
        executor = ExtractionNotifyExecutor()
        context = make_context(
            config={},
            extra_data={"event_type": "extraction.completed", "extraction_data": {}},
        )

        with patch.object(executor, "_build_notification_card", side_effect=ValueError("template error")):
            result = executor.execute(context)

        assert result.status == ExecutionStatus.FAILED
        assert "template error" in (result.error_message or "")

    def test_validate_config_warning_when_both_disabled(self):
        """成功和失败通知都禁用时产生警告"""
        executor = ExtractionNotifyExecutor()
        vr = executor.validate_config({"notify_on_success": False, "notify_on_failure": False})
        assert vr.is_valid is True
        assert len(vr.warnings) > 0


# ============================================================================
# QueryResultPushExecutor
# ============================================================================


class TestQueryResultPushExecutor:
    def test_success_returns_query_result(self, app, db_session):
        """成功执行查询返回 SUCCESS"""
        from app.domain.entities import DataSource

        executor = QueryResultPushExecutor()
        context = make_context(config={
            "datasource_id": 1,
            "sql_query": "SELECT 1 AS col1",
            "max_rows": 100,
        })

        ds = DataSource(id=1, name="ds1", source_type="mysql", connection_config={})
        db_session.add(ds)
        db_session.commit()

        mock_adapter = MagicMock()
        mock_adapter.execute_query.return_value = {
            "rows": [[1], [2]],
            "columns": ["col1"],
        }

        with patch(
            "app.executors.query_result_push_executor.DataSourceAdapterFactory.create_adapter",
            return_value=mock_adapter,
        ):
            result = executor.execute(context)

        assert result.status == ExecutionStatus.SUCCESS
        assert result.output["total_rows"] == 2
        assert result.output["columns"] == ["col1"]
        assert result.output["datasource_name"] == "ds1"

    def test_failed_when_datasource_not_found(self, app, db_session):
        """数据源不存在时返回 FAILED"""
        executor = QueryResultPushExecutor()
        context = make_context(config={"datasource_id": 99999, "sql_query": "SELECT 1"})

        result = executor.execute(context)

        assert result.status == ExecutionStatus.FAILED
        assert "不存在" in (result.error_message or "")

    def test_failed_on_query_exception(self, app, db_session):
        """查询执行异常时返回 FAILED"""
        from app.domain.entities import DataSource

        executor = QueryResultPushExecutor()
        context = make_context(config={"datasource_id": 1, "sql_query": "SELECT 1"})

        ds = DataSource(id=1, name="ds1", source_type="mysql", connection_config={})
        db_session.add(ds)
        db_session.commit()

        mock_adapter = MagicMock()
        mock_adapter.execute_query.side_effect = Exception("connection timeout")

        with patch(
            "app.executors.query_result_push_executor.DataSourceAdapterFactory.create_adapter",
            return_value=mock_adapter,
        ):
            result = executor.execute(context)

        assert result.status == ExecutionStatus.FAILED
        assert "connection timeout" in (result.error_message or "")

    def test_validate_config_missing_required_fields(self):
        """缺少 datasource_id 或 sql_query 时校验失败"""
        executor = QueryResultPushExecutor()
        vr = executor.validate_config({})
        assert vr.is_valid is False
        assert "datasource_id" in vr.errors
        assert "sql_query" in vr.errors
