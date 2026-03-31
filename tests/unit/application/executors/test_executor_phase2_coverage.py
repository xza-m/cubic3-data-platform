"""
Phase 2 执行器覆盖率补充测试
"""
import base64
from unittest.mock import MagicMock, patch

import pytest

from app.domain.app_center.execution_context import ExecutionContext, ExecutionStatus, TriggerType
from app.executors.anomaly_monitor_executor import AnomalyMonitorExecutor
from app.executors.bi_dashboard_push_executor import BiDashboardPushExecutor
from app.executors.data_agent_executor import DataAgentExecutor
from app.executors.query_result_push_executor import QueryResultPushExecutor
from app.executors.report_push_executor import ReportPushExecutor
from app.executors.table_cache_refresh_executor import TableCacheRefreshExecutor


def make_context(config=None, extra_data=None, instance_name="phase2_executor"):
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
    context.instance = MagicMock()
    context.instance.name = instance_name
    return context


class TestReportPushExecutor:
    def test_execute_uses_adapter_factory_contract_and_formats_output(self, app, db_session):
        from app.domain.entities import DataSource

        executor = ReportPushExecutor()
        context = make_context(config={
            "datasource_id": 1,
            "sql_query": "SELECT 1, 'Alice'",
            "report_type": "weekly",
        })

        datasource = DataSource(
            id=1,
            name="warehouse",
            source_type="mysql",
            connection_config={"host": "localhost", "database": "analytics"},
        )
        db_session.add(datasource)
        db_session.commit()

        adapter = MagicMock()
        adapter.execute_query.return_value = {
            "rows": [[1, "Alice"], [2, None]],
            "columns": ["id", "name"],
        }

        with patch("app.executors.report_push_executor.DataSourceAdapterFactory.create_adapter", return_value=adapter) as mock_create:
            result = executor.execute(context)

        assert result.status == ExecutionStatus.SUCCESS
        assert result.output["report_type_name"] == "周报"
        assert result.output["row_count"] == 2
        assert "| id | name |" in result.output["table_markdown"]
        assert "warehouse" == result.output["datasource_name"]
        mock_create.assert_called_once_with("mysql", {"host": "localhost", "database": "analytics"})

    def test_execute_empty_rows_uses_no_data_placeholder(self, app, db_session):
        from app.domain.entities import DataSource

        executor = ReportPushExecutor()
        context = make_context(config={"datasource_id": 1, "sql_query": "SELECT 1"})

        datasource = DataSource(
            id=1,
            name="warehouse",
            source_type="mysql",
            connection_config={"host": "localhost"},
        )
        db_session.add(datasource)
        db_session.commit()

        adapter = MagicMock()
        adapter.execute_query.return_value = {"rows": [], "columns": ["id"]}

        with patch("app.executors.report_push_executor.DataSourceAdapterFactory.create_adapter", return_value=adapter):
            result = executor.execute(context)

        assert result.status == ExecutionStatus.SUCCESS
        assert result.output["table_markdown"] == "_暂无数据_"

    def test_validate_config_and_helpers_cover_remaining_paths(self):
        executor = ReportPushExecutor()

        validation = executor.validate_config({})
        assert validation.is_valid is False
        assert "datasource_id" in validation.errors
        assert "sql_query" in validation.errors

        table = executor._format_as_markdown_table(["id"], [[idx] for idx in range(101)])
        assert "仅显示前 100 行" in table
        assert executor._format_as_markdown_table([], []) == "_无数据_"
        assert executor._get_report_type_name("adhoc") == "adhoc"


class TestTableCacheRefreshExecutor:
    def test_execute_success_collects_before_after_stats(self):
        executor = TableCacheRefreshExecutor()
        context = make_context()
        cache_service = MagicMock()
        cache_service.get_cache_stats.side_effect = [
            {"total_caches": 3, "expired_caches": 1},
            {"total_caches": 3, "expired_caches": 0},
        ]
        cache_service.refresh_expired_caches.return_value = 1
        container = MagicMock()
        container.table_cache_service.return_value = cache_service

        with patch("app.di.container.get_container", return_value=container):
            result = executor.execute(context)

        assert result.status == ExecutionStatus.SUCCESS
        assert result.output["refreshed_count"] == 1
        assert result.output["stats_before"]["expired_caches"] == 1
        assert result.output["stats_after"]["expired_caches"] == 0

    def test_execute_failure_returns_failed_result(self):
        executor = TableCacheRefreshExecutor()
        context = make_context()

        with patch("app.di.container.get_container", side_effect=RuntimeError("container unavailable")):
            result = executor.execute(context)

        assert result.status == ExecutionStatus.FAILED
        assert "container unavailable" in (result.error_message or "")

    def test_validate_and_schema(self):
        executor = TableCacheRefreshExecutor()
        assert executor.validate_config({}).is_valid is True
        assert executor.get_config_schema() == {"type": "object", "properties": {}}


class TestDataAgentExecutor:
    def test_execute_returns_ready_payload(self):
        executor = DataAgentExecutor()
        result = executor.execute(make_context())

        assert result.status == ExecutionStatus.SUCCESS
        assert result.output["status"] == "agent_ready"

    def test_validate_config_covers_missing_not_found_warning_and_rounds(self, app, db_session):
        from app.domain.entities import DataSource

        executor = DataAgentExecutor()
        missing = executor.validate_config({})
        assert missing.is_valid is False
        assert "knowledge.datasource_id" in missing.errors

        not_found = executor.validate_config({"knowledge": {"datasource_id": 999}})
        assert "knowledge.datasource_id" in not_found.errors

        datasource = DataSource(
            id=1,
            name="mysql_ds",
            source_type="mysql",
            connection_config={"host": "localhost"},
        )
        db_session.add(datasource)
        db_session.commit()

        warning = executor.validate_config({
            "knowledge": {"datasource_id": 1},
            "agent": {"max_loop_rounds": 99},
        })
        assert "knowledge.datasource_id" in warning.warnings
        assert "agent.max_loop_rounds" in warning.errors

    def test_get_config_schema_reads_builtin_seed_definition(self):
        executor = DataAgentExecutor()
        fake_definitions = [
            {"code": "other", "config_schema": {"type": "object", "title": "other"}},
            {"code": "data_agent", "config_schema": {"type": "object", "title": "agent"}},
        ]

        with patch("app.infrastructure.seed.BUILTIN_APP_DEFINITIONS", fake_definitions):
            assert executor.get_config_schema() == {"type": "object", "title": "agent"}


class TestQueryAndAnomalyExecutors:
    def test_query_result_executor_uses_adapter_factory_contract(self, app, db_session):
        from app.domain.entities import DataSource

        executor = QueryResultPushExecutor()
        context = make_context(config={
            "datasource_id": 1,
            "sql_query": "SELECT 1 AS id",
            "format": "json",
            "max_rows": 1,
        })

        datasource = DataSource(
            id=1,
            name="warehouse",
            source_type="postgresql",
            connection_config={"host": "localhost", "database": "analytics"},
        )
        db_session.add(datasource)
        db_session.commit()

        adapter = MagicMock()
        adapter.execute_query.return_value = {"rows": [[1], [2]], "columns": ["id"]}

        with patch("app.executors.query_result_push_executor.DataSourceAdapterFactory.create_adapter", return_value=adapter) as mock_create:
            result = executor.execute(context)

        assert result.status == ExecutionStatus.SUCCESS
        assert result.output["is_truncated"] is True
        assert '"id": 1' in result.output["formatted_result"]
        mock_create.assert_called_once_with("postgresql", {"host": "localhost", "database": "analytics"})

    def test_anomaly_monitor_executor_uses_adapter_factory_contract(self, app, db_session):
        from app.domain.entities import DataSource

        executor = AnomalyMonitorExecutor()
        context = make_context(config={
            "datasource_id": 1,
            "sql_query": "SELECT 5",
            "threshold": {"operator": ">", "value": 3},
        })

        datasource = DataSource(
            id=1,
            name="warehouse",
            source_type="clickhouse",
            connection_config={"host": "localhost"},
        )
        db_session.add(datasource)
        db_session.commit()

        adapter = MagicMock()
        adapter.execute_query.return_value = {"rows": [[5]]}

        with patch("app.executors.anomaly_monitor_executor.DataSourceAdapterFactory.create_adapter", return_value=adapter) as mock_create:
            result = executor.execute(context)

        assert result.status == ExecutionStatus.SUCCESS
        assert result.output["triggered"] is True
        assert result.output["metric_value"] == 5
        mock_create.assert_called_once_with("clickhouse", {"host": "localhost"})


class TestBiDashboardPushExecutorHelpers:
    def test_helper_methods_cover_render_token_screenshot_and_dashboard_info(self):
        executor = BiDashboardPushExecutor()
        rendered = executor._render_message("销售看板", "http://superset/dashboard/1", {})
        assert "销售看板" in rendered

        login_resp = MagicMock(status_code=200)
        login_resp.json.return_value = {"access_token": "token_123"}
        with patch("app.executors.bi_dashboard_push_executor.requests.post", return_value=login_resp):
            assert executor._get_superset_token("http://superset", "admin", "admin") == "token_123"

        failed_login = MagicMock(status_code=500)
        failed_login.json.return_value = {}
        with patch("app.executors.bi_dashboard_push_executor.requests.post", return_value=failed_login):
            with pytest.raises(Exception, match="Superset 登录失败"):
                executor._get_superset_token("http://superset", "admin", "admin")

        screenshot_resp = MagicMock(status_code=200)
        screenshot_resp.json.side_effect = [
            {"task_id": "task_1"},
            {"status": "success", "image": base64.b64encode(b"image_bytes").decode("utf-8")},
        ]
        with patch("app.executors.bi_dashboard_push_executor.requests.post", return_value=screenshot_resp):
            with patch("app.executors.bi_dashboard_push_executor.requests.get", return_value=screenshot_resp):
                with patch("app.executors.bi_dashboard_push_executor.time.sleep"):
                    assert executor._request_screenshot("http://superset", 1, "token", timeout=1) == b"image_bytes"

        failed_status = MagicMock(status_code=200)
        failed_status.json.side_effect = [{"task_id": "task_2"}, {"status": "failed", "error": "boom"}]
        with patch("app.executors.bi_dashboard_push_executor.requests.post", return_value=failed_status):
            with patch("app.executors.bi_dashboard_push_executor.requests.get", return_value=failed_status):
                with patch("app.executors.bi_dashboard_push_executor.time.sleep"):
                    with pytest.raises(Exception, match="Superset 截图失败"):
                        executor._request_screenshot("http://superset", 1, "token", timeout=1)

        info_resp = MagicMock(status_code=200)
        info_resp.json.return_value = {"result": {"dashboard_title": "销售看板"}}
        with patch("app.executors.bi_dashboard_push_executor.requests.get", return_value=info_resp):
            assert executor._get_dashboard_info("http://superset", 1, "token") == {"dashboard_title": "销售看板"}
