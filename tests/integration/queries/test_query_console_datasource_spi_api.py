from __future__ import annotations

import pytest


class _StubExecuteHandler:
    def __init__(self):
        self.commands = []

    def handle(self, command):
        self.commands.append(command)
        return {
            "columns": [{"name": "ok", "type": "int"}],
            "data": [{"ok": 1}],
            "row_count": 1,
            "execution_time_ms": 3,
            "status": "success",
        }


class _StubContainer:
    def __init__(self, handler):
        self._handler = handler

    def execute_query_handler(self):
        return self._handler


def test_query_console_execute_uses_datasource_adapter_spi_when_gateway_is_configured(client, app, monkeypatch):
    app.config["QUERY_GATEWAY_PLATFORM_SERVICE_TOKEN"] = "platform-secret"
    handler = _StubExecuteHandler()
    monkeypatch.setattr("app.interfaces.api.v1.queries.get_app_container", lambda: _StubContainer(handler))
    monkeypatch.setattr(
        "app.interfaces.api.v1.queries._execute_via_gateway",
        lambda _schema: pytest.fail("查询工作台必须走 DataSource Adapter SPI，不能调用 dw-query-gateway"),
        raising=False,
    )

    response = client.post(
        "/api/v1/queries/execute",
        json={"source_id": 1, "sql_query": "select 1 as ok", "limit": 10},
    )

    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert payload["data"][0]["ok"] == 1
    assert len(handler.commands) == 1
    assert handler.commands[0].source_id == 1
    assert handler.commands[0].sql_query == "select 1 as ok"
