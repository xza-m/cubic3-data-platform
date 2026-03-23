"""
Anomaly Monitor Executor 单元测试

测试异常数据监控执行器：成功/失败、配置校验、告警构建
"""
import pytest
from unittest.mock import MagicMock, patch

from app.domain.app_center.execution_context import (
    ExecutionContext,
    ExecutionStatus,
    TriggerType,
)
from app.executors.anomaly_monitor_executor import AnomalyMonitorExecutor
from app.domain.entities import DataSource


def make_context(config=None, instance_name="test_instance"):
    """构建执行上下文"""
    context = ExecutionContext(
        execution_id=1,
        instance_id=1,
        app_code="anomaly_monitor",
        instance_name=instance_name,
        config=config or {},
        trigger_type=TriggerType.MANUAL,
        triggered_by="user1",
        extra_data={},
    )
    context.instance = MagicMock()
    context.instance.name = instance_name
    return context


# ============================================================================
# execute
# ============================================================================


class TestAnomalyMonitorExecutorExecute:
    def test_success_no_anomaly(self, app, db_session):
        """指标未超阈值时返回 SUCCESS，triggered=False"""
        ds = DataSource(id=1, name="ds1", source_type="mysql", connection_config={})
        db_session.add(ds)
        db_session.commit()

        executor = AnomalyMonitorExecutor()
        context = make_context(config={
            "datasource_id": 1,
            "sql_query": "SELECT 10",
            "threshold": {"operator": ">", "value": 100},
        })

        mock_adapter = MagicMock()
        mock_adapter.execute_query.return_value = {"rows": [[10]], "columns": ["metric"]}

        with patch(
            "app.executors.anomaly_monitor_executor.DataSourceAdapterFactory.create_adapter",
            return_value=mock_adapter,
        ):
            result = executor.execute(context)

        assert result.status == ExecutionStatus.SUCCESS
        assert result.output["triggered"] is False
        assert result.output["metric_value"] == 10
        assert result.output["threshold_value"] == 100

    def test_success_anomaly_triggered(self, app, db_session):
        """指标超阈值时触发告警"""
        ds = DataSource(id=1, name="ds1", source_type="mysql", connection_config={})
        db_session.add(ds)
        db_session.commit()

        executor = AnomalyMonitorExecutor()
        context = make_context(config={
            "datasource_id": 1,
            "sql_query": "SELECT 150",
            "threshold": {"operator": ">", "value": 100},
        })

        mock_adapter = MagicMock()
        mock_adapter.execute_query.return_value = {"rows": [[150]], "columns": ["metric"]}

        with patch(
            "app.executors.anomaly_monitor_executor.DataSourceAdapterFactory.create_adapter",
            return_value=mock_adapter,
        ):
            result = executor.execute(context)

        assert result.status == ExecutionStatus.SUCCESS
        assert result.output["triggered"] is True
        assert result.output["is_anomaly"] is True
        assert "feishu_card" in result.output
        assert "text_message" in result.output

    def test_success_empty_result_skips(self, app, db_session):
        """查询结果为空时跳过监控"""
        ds = DataSource(id=1, name="ds1", source_type="mysql", connection_config={})
        db_session.add(ds)
        db_session.commit()

        executor = AnomalyMonitorExecutor()
        context = make_context(config={
            "datasource_id": 1,
            "sql_query": "SELECT 1",
            "threshold": {"operator": ">", "value": 0},
        })

        mock_adapter = MagicMock()
        mock_adapter.execute_query.return_value = {"rows": [], "columns": []}

        with patch(
            "app.executors.anomaly_monitor_executor.DataSourceAdapterFactory.create_adapter",
            return_value=mock_adapter,
        ):
            result = executor.execute(context)

        assert result.status == ExecutionStatus.SUCCESS
        assert result.output["triggered"] is False
        assert "查询结果为空" in result.output["reason"]

    def test_failed_datasource_not_found(self, app, db_session):
        """数据源不存在时返回 FAILED"""
        executor = AnomalyMonitorExecutor()
        context = make_context(config={
            "datasource_id": 99999,
            "sql_query": "SELECT 1",
            "threshold": {"operator": ">", "value": 0},
        })

        result = executor.execute(context)

        assert result.status == ExecutionStatus.FAILED
        assert "不存在" in (result.error_message or "")

    def test_failed_unsupported_operator(self, app, db_session):
        """不支持的运算符时返回 FAILED"""
        ds = DataSource(id=1, name="ds1", source_type="mysql", connection_config={})
        db_session.add(ds)
        db_session.commit()

        executor = AnomalyMonitorExecutor()
        context = make_context(config={
            "datasource_id": 1,
            "sql_query": "SELECT 1",
            "threshold": {"operator": "??", "value": 0},
        })

        mock_adapter = MagicMock()
        mock_adapter.execute_query.return_value = {"rows": [[1]], "columns": ["x"]}

        with patch(
            "app.executors.anomaly_monitor_executor.DataSourceAdapterFactory.create_adapter",
            return_value=mock_adapter,
        ):
            result = executor.execute(context)

        assert result.status == ExecutionStatus.FAILED
        assert "不支持的运算符" in (result.error_message or "")

    def test_failed_query_exception(self, app, db_session):
        """查询异常时返回 FAILED"""
        ds = DataSource(id=1, name="ds1", source_type="mysql", connection_config={})
        db_session.add(ds)
        db_session.commit()

        executor = AnomalyMonitorExecutor()
        context = make_context(config={
            "datasource_id": 1,
            "sql_query": "SELECT 1",
            "threshold": {"operator": ">", "value": 0},
        })

        mock_adapter = MagicMock()
        mock_adapter.execute_query.side_effect = Exception("Connection timeout")

        with patch(
            "app.executors.anomaly_monitor_executor.DataSourceAdapterFactory.create_adapter",
            return_value=mock_adapter,
        ):
            result = executor.execute(context)

        assert result.status == ExecutionStatus.FAILED
        assert "Connection timeout" in (result.error_message or "")

    def test_alert_template_rendered(self, app, db_session):
        """自定义告警模板被正确渲染"""
        ds = DataSource(id=1, name="ds1", source_type="mysql", connection_config={})
        db_session.add(ds)
        db_session.commit()

        executor = AnomalyMonitorExecutor()
        context = make_context(config={
            "datasource_id": 1,
            "sql_query": "SELECT 200",
            "threshold": {"operator": ">", "value": 100},
            "alert_template": "指标 {{value}} 超过 {{threshold}}",
        })

        mock_adapter = MagicMock()
        mock_adapter.execute_query.return_value = {"rows": [[200]], "columns": ["m"]}

        with patch(
            "app.executors.anomaly_monitor_executor.DataSourceAdapterFactory.create_adapter",
            return_value=mock_adapter,
        ):
            result = executor.execute(context)

        assert result.status == ExecutionStatus.SUCCESS
        assert result.output["triggered"] is True
        card = result.output["feishu_card"]
        assert "200" in str(card["elements"])
        assert "100" in str(card["elements"])


# ============================================================================
# validate_config
# ============================================================================


class TestAnomalyMonitorValidateConfig:
    def test_valid_config(self):
        """完整配置校验通过"""
        executor = AnomalyMonitorExecutor()
        vr = executor.validate_config({
            "datasource_id": 1,
            "sql_query": "SELECT 1",
            "threshold": {"operator": ">", "value": 0},
        })
        assert vr.is_valid is True

    def test_missing_datasource_id(self):
        """缺少 datasource_id"""
        executor = AnomalyMonitorExecutor()
        vr = executor.validate_config({
            "sql_query": "SELECT 1",
            "threshold": {"operator": ">", "value": 0},
        })
        assert vr.is_valid is False
        assert "datasource_id" in vr.errors

    def test_missing_sql_query(self):
        """缺少 sql_query"""
        executor = AnomalyMonitorExecutor()
        vr = executor.validate_config({
            "datasource_id": 1,
            "threshold": {"operator": ">", "value": 0},
        })
        assert vr.is_valid is False
        assert "sql_query" in vr.errors

    def test_missing_threshold_operator(self):
        """缺少 threshold.operator"""
        executor = AnomalyMonitorExecutor()
        vr = executor.validate_config({
            "datasource_id": 1,
            "sql_query": "SELECT 1",
            "threshold": {"value": 0},
        })
        assert vr.is_valid is False
        assert "threshold.operator" in vr.errors

    def test_missing_threshold_value(self):
        """缺少 threshold.value"""
        executor = AnomalyMonitorExecutor()
        vr = executor.validate_config({
            "datasource_id": 1,
            "sql_query": "SELECT 1",
            "threshold": {"operator": ">"},
        })
        assert vr.is_valid is False
        assert "threshold.value" in vr.errors


# ============================================================================
# get_config_schema
# ============================================================================


class TestAnomalyMonitorConfigSchema:
    def test_returns_json_schema(self):
        """返回有效的 JSON Schema"""
        executor = AnomalyMonitorExecutor()
        schema = executor.get_config_schema()
        assert schema["type"] == "object"
        assert "datasource_id" in schema["required"]
        assert "sql_query" in schema["required"]
        assert "threshold" in schema["required"]
        assert "properties" in schema
