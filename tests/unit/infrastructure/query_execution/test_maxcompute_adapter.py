from types import SimpleNamespace

import pytest

from app.infrastructure.query_execution.adapters.maxcompute_adapter import (
    DataSourceWarehouseExecutionAdapter,
    WarehouseExecutionError,
    classify_warehouse_error,
)


def test_classify_warehouse_error_marks_transient_errors_retryable():
    classification = classify_warehouse_error(RuntimeError("connection timeout from MaxCompute"))

    assert classification.code == "WAREHOUSE_TRANSIENT_ERROR"
    assert classification.retryable is True
    assert classification.category == "transient"


def test_classify_warehouse_error_marks_permission_errors_non_retryable():
    classification = classify_warehouse_error(RuntimeError("Permission denied: no privilege"))

    assert classification.code == "WAREHOUSE_PERMISSION_DENIED"
    assert classification.retryable is False
    assert classification.category == "permission"


def test_warehouse_execution_error_exposes_code_and_retryable_flag():
    classification = classify_warehouse_error(RuntimeError("syntax error near from"))
    error = WarehouseExecutionError("syntax error near from", classification=classification)

    assert error.code == "WAREHOUSE_SQL_SYNTAX_ERROR"
    assert error.retryable is False


def test_datasource_warehouse_adapter_uses_platform_datasource_config(monkeypatch):
    class _DatasourceRepository:
        def find_by_id(self, source_id):
            assert source_id == 1
            return SimpleNamespace(source_type="maxcompute", connection_config={"project": "dw"})

    class _DatasourceAdapter:
        def execute_query(self, sql):
            assert sql == "SELECT 1"
            return {"columns": ["ok"], "rows": [{"ok": 1}]}

    monkeypatch.setattr(
        "app.infrastructure.query_execution.adapters.maxcompute_adapter.AdapterFactory.create_adapter",
        lambda source_type, config: _DatasourceAdapter(),
    )
    adapter = DataSourceWarehouseExecutionAdapter(datasource_repository=_DatasourceRepository())

    engine_query_id = adapter.submit(source_id=1, sql="SELECT 1")

    assert adapter.get_status(engine_query_id) == "SUCCEEDED"
    assert adapter.fetch_result(engine_query_id)["rows"] == [{"ok": 1}]


def test_datasource_warehouse_adapter_wraps_engine_errors(monkeypatch):
    class _DatasourceRepository:
        def find_by_id(self, source_id):
            return SimpleNamespace(source_type="maxcompute", connection_config={})

    class _DatasourceAdapter:
        def execute_query(self, sql):
            raise RuntimeError("Permission denied: no privilege")

    monkeypatch.setattr(
        "app.infrastructure.query_execution.adapters.maxcompute_adapter.AdapterFactory.create_adapter",
        lambda source_type, config: _DatasourceAdapter(),
    )
    adapter = DataSourceWarehouseExecutionAdapter(datasource_repository=_DatasourceRepository())

    with pytest.raises(WarehouseExecutionError) as info:
        adapter.submit(source_id=1, sql="SELECT 1")

    assert info.value.code == "WAREHOUSE_PERMISSION_DENIED"
    assert info.value.retryable is False
