"""
executors 模块均匀度补充测试
"""
from unittest.mock import MagicMock, patch

from app.domain.app_center.execution_context import ExecutionContext, ExecutionStatus, TriggerType
from app.executors.extraction_notify_executor import ExtractionNotifyExecutor
from app.executors.query_result_push_executor import QueryResultPushExecutor
from app.executors.schema_drift_executor import SchemaDriftExecutor


def make_context(config=None, extra_data=None, instance_name="uniformity_executor"):
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


class TestExtractionNotifyExecutorUniformity:
    def test_execute_skips_when_task_id_not_match(self):
        executor = ExtractionNotifyExecutor()
        context = make_context(
            config={"notify_on_failure": True, "extraction_task_id": 8},
            extra_data={
                "event_type": "extraction.failed",
                "extraction_data": {"task_id": 9, "task_name": "任务A"},
            },
        )

        result = executor.execute(context)

        assert result.status == ExecutionStatus.SUCCESS
        assert result.output["notified"] is False
        assert result.output["reason"] == "任务 ID 不匹配"

    def test_execute_failure_event_uses_failure_template_and_card_note(self):
        executor = ExtractionNotifyExecutor()
        context = make_context(
            config={"notify_on_failure": True},
            extra_data={
                "event_type": "extraction.failed",
                "extraction_data": {
                    "task_id": 2,
                    "task_name": "夜间同步",
                    "error": "磁盘不足",
                    "dataset_name": "用户明细",
                    "file_path": "/tmp/a.csv",
                    "started_at": "2026-03-25 00:00:00",
                },
            },
        )

        result = executor.execute(context)

        assert result.status == ExecutionStatus.SUCCESS
        assert result.output["event_type"] == "extraction.failed"
        assert "磁盘不足" in result.output["text_message"]
        assert result.output["feishu_card"]["header"]["template"] == "red"
        assert result.output["feishu_card"]["elements"][-1]["tag"] == "note"

    def test_helper_methods_expose_schema_and_event_support(self):
        executor = ExtractionNotifyExecutor()
        schema = executor.get_config_schema()

        assert schema["properties"]["notify_on_success"]["default"] is True
        assert executor.supports_event_trigger() is True
        assert executor.get_supported_events() == ["extraction.completed", "extraction.failed"]


class TestQueryResultPushExecutorUniformity:
    def test_execute_text_format_and_unknown_format_fallback(self, app, db_session):
        from app.domain.entities import DataSource

        datasource = DataSource(
            id=1,
            name="warehouse",
            source_type="mysql",
            connection_config={"host": "localhost"},
        )
        db_session.add(datasource)
        db_session.commit()

        adapter = MagicMock()
        adapter.execute_query.return_value = {
            "rows": [[1, "Alice"], [2, None]],
            "columns": ["id", "name"],
        }

        text_executor = QueryResultPushExecutor()
        text_context = make_context(
            config={"datasource_id": 1, "sql_query": "select 1", "format": "text", "max_rows": 5}
        )
        with patch("app.executors.query_result_push_executor.DataSourceAdapterFactory.create_adapter", return_value=adapter):
            text_result = text_executor.execute(text_context)

        fallback_executor = QueryResultPushExecutor()
        fallback_context = make_context(
            config={"datasource_id": 1, "sql_query": "select 1", "format": "markdown", "max_rows": 1}
        )
        with patch("app.executors.query_result_push_executor.DataSourceAdapterFactory.create_adapter", return_value=adapter):
            fallback_result = fallback_executor.execute(fallback_context)

        assert text_result.status == ExecutionStatus.SUCCESS
        assert "[1] id=1, name=Alice" in text_result.output["formatted_result"]
        assert fallback_result.status == ExecutionStatus.SUCCESS
        assert "| id | name |" in fallback_result.output["formatted_result"]
        assert "结果已截断" in fallback_result.output["formatted_result"]

    def test_validate_schema_and_helper_formatters_cover_empty_paths(self):
        executor = QueryResultPushExecutor()

        validation = executor.validate_config({"datasource_id": 1, "sql_query": "select 1", "max_rows": 2001})
        schema = executor.get_config_schema()

        assert "max_rows" in validation.warnings
        assert schema["required"] == ["datasource_id", "sql_query"]
        assert executor._format_as_table(["id"], []) == "_无数据_"
        assert executor._format_as_text(["id"], []) == "无数据"
        assert executor._format_as_json(["id"], []) == "[]"


class TestSchemaDriftExecutorUniformity:
    def test_execute_drift_without_webhook_marks_notified_false(self, app):
        executor = SchemaDriftExecutor()
        context = make_context(config={})

        mock_report = MagicMock()
        mock_report.checked_cubes = 1
        mock_report.total_cubes = 1
        mock_report.drifts = [{"cube": "c1"}]
        mock_report.has_drifts = True
        mock_report.to_dict.return_value = {
            "total_cubes": 1,
            "checked_cubes": 1,
            "skipped_cubes": [],
            "drifts": [{"cube": "c1"}],
        }

        with patch.object(executor, "_get_maxcompute_adapter", return_value=(MagicMock(), "analytics")):
            with patch("app.di.container.get_container") as mock_get_container:
                mock_container = MagicMock()
                mock_get_container.return_value = mock_container
                mock_container.cube_repository.return_value = MagicMock()
                with patch("app.application.semantic.schema_sync_service.SchemaSyncService") as mock_sync_service:
                    mock_sync_service.return_value.check_all.return_value = mock_report
                    result = executor.execute(context)

        assert result.status == ExecutionStatus.SUCCESS
        assert result.output["notified"] is False

    def test_get_config_schema_and_get_maxcompute_adapter_paths(self):
        executor = SchemaDriftExecutor()
        schema = executor.get_config_schema()
        assert schema["properties"]["webhook_url"]["format"] == "uri"

        source = MagicMock(source_type="maxcompute", connection_config={"project": "dw"})
        query = MagicMock()
        query.filter.return_value = query
        query.order_by.return_value = query
        query.first.return_value = source

        with patch("app.executors.schema_drift_executor.db.session.query", return_value=query):
            with patch("app.infrastructure.adapters.datasources.factory.AdapterFactory.create_adapter", return_value="adapter") as mock_create:
                adapter, database = executor._get_maxcompute_adapter()

        assert adapter == "adapter"
        assert database == "dw"
        mock_create.assert_called_once_with("maxcompute", {"project": "dw"})

    def test_get_maxcompute_adapter_returns_none_on_missing_source_or_error(self):
        executor = SchemaDriftExecutor()
        query = MagicMock()
        query.filter.return_value = query
        query.order_by.return_value = query
        query.first.return_value = None

        with patch("app.executors.schema_drift_executor.db.session.query", return_value=query):
            assert executor._get_maxcompute_adapter() == (None, None)

        with patch("app.executors.schema_drift_executor.db.session.query", side_effect=RuntimeError("boom")):
            assert executor._get_maxcompute_adapter() == (None, None)
