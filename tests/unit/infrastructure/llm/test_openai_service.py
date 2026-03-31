from unittest.mock import MagicMock

import pytest
import requests

from app.infrastructure.llm.openai_service import OpenAIService
from app.shared.exceptions import ApplicationException


def test_chat_completion_builds_payload_and_returns_content(monkeypatch: pytest.MonkeyPatch) -> None:
    captured = {}

    def _post(url, headers, json, timeout):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        captured["timeout"] = timeout
        return MagicMock(
            status_code=200,
            json=lambda: {
                "choices": [{"message": {"content": "你好"}}],
                "usage": {"total_tokens": 10},
            },
        )

    monkeypatch.setattr("app.infrastructure.llm.openai_service.requests.post", _post)
    service = OpenAIService("sk-demo", api_base="https://api.openai.com/v1/", model="gpt-test", timeout=12)

    result = service.chat_completion(
        [{"role": "user", "content": "hello"}],
        temperature=0.2,
        max_tokens=256,
    )

    assert result == {"content": "你好", "usage": {"total_tokens": 10}}
    assert captured["url"] == "https://api.openai.com/v1/chat/completions"
    assert captured["headers"]["Authorization"] == "Bearer sk-demo"
    assert captured["json"]["model"] == "gpt-test"
    assert captured["json"]["max_tokens"] == 256
    assert captured["timeout"] == 12


def test_chat_completion_adds_openrouter_headers(monkeypatch: pytest.MonkeyPatch) -> None:
    captured_headers = {}

    def _post(url, headers, json, timeout):
        captured_headers.update(headers)
        return MagicMock(
            status_code=200,
            json=lambda: {
                "choices": [{"message": {"content": "ok"}}],
                "usage": {},
            },
        )

    monkeypatch.setattr("app.infrastructure.llm.openai_service.requests.post", _post)
    service = OpenAIService("sk-demo", api_base="https://openrouter.ai/api/v1")

    service.chat_completion(
        [{"role": "user", "content": "hello"}],
        site_url="https://demo.example.com",
        site_name="CUBIC3",
    )

    assert captured_headers["HTTP-Referer"] == "https://demo.example.com"
    assert captured_headers["X-Title"] == "CUBIC3"


def test_chat_completion_raises_application_exception_on_http_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.infrastructure.llm.openai_service.requests.post",
        lambda *args, **kwargs: MagicMock(status_code=500, text="server error"),
    )
    service = OpenAIService("sk-demo")

    with pytest.raises(ApplicationException, match="LLM API 调用失败"):
        service.chat_completion([{"role": "user", "content": "hello"}])


def test_chat_completion_raises_application_exception_on_request_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    def _raise(*args, **kwargs):
        raise requests.RequestException("timeout")

    monkeypatch.setattr("app.infrastructure.llm.openai_service.requests.post", _raise)
    service = OpenAIService("sk-demo")

    with pytest.raises(ApplicationException, match="LLM API 连接失败"):
        service.chat_completion([{"role": "user", "content": "hello"}])


def test_generate_sql_parses_json_response(monkeypatch: pytest.MonkeyPatch) -> None:
    service = OpenAIService("sk-demo")
    monkeypatch.setattr(
        service,
        "chat_completion",
        lambda **kwargs: {
            "content": '{"sql":"SELECT 1","explanation":"ok","visualization":{"type":"number"}}',
            "usage": {"prompt_tokens": 1},
        },
    )

    result = service.generate_sql(
        "统计订单数",
        {
            "table_name": "orders",
            "source_type": "postgresql",
            "fields": [{"physical_name": "id", "data_type": "bigint", "description": "订单 ID"}],
        },
    )

    assert result == {
        "sql": "SELECT 1",
        "explanation": "ok",
        "visualization_suggestion": {"type": "number"},
        "usage": {"prompt_tokens": 1},
    }


def test_generate_sql_extracts_sql_from_markdown_code_block(monkeypatch: pytest.MonkeyPatch) -> None:
    service = OpenAIService("sk-demo")
    monkeypatch.setattr(
        service,
        "chat_completion",
        lambda **kwargs: {
            "content": "```sql\nSELECT * FROM demo\n```",
            "usage": {"prompt_tokens": 2},
        },
    )

    result = service.generate_sql("列出数据", {"table_name": "demo", "source_type": "postgresql", "fields": []})

    assert result["sql"] == "SELECT * FROM demo"
    assert result["explanation"] == "SQL 已生成"
    assert result["visualization_suggestion"] == {"type": "table"}


def test_generate_sql_raises_when_json_content_is_invalid(monkeypatch: pytest.MonkeyPatch) -> None:
    service = OpenAIService("sk-demo")
    monkeypatch.setattr(
        service,
        "chat_completion",
        lambda **kwargs: {
            "content": "{invalid json",
            "usage": {},
        },
    )

    with pytest.raises(ApplicationException, match="解析 LLM 响应失败"):
        service.generate_sql("列出数据", {"table_name": "demo", "source_type": "postgresql", "fields": []})


def test_prompt_helpers_and_extract_sql_text_cover_fallback_paths() -> None:
    service = OpenAIService("sk-demo")

    system_prompt = service._build_sql_system_prompt()
    user_prompt = service._build_sql_user_prompt(
        "按城市统计",
        {
            "table_name": "city_orders",
            "source_type": "clickhouse",
            "fields": [
                {"physical_name": "city", "data_type": "string", "description": "城市"},
                {"physical_name": "order_cnt", "data_type": "bigint"},
            ],
        },
    )
    extracted = service._extract_sql_from_text("SELECT city, count(*) FROM city_orders")

    assert "专业的数据分析助手" in system_prompt
    assert "表名：city_orders" in user_prompt
    assert "数据库类型：clickhouse" in user_prompt
    assert extracted == {
        "sql": "SELECT city, count(*) FROM city_orders",
        "explanation": "SQL 已生成",
        "visualization": {"type": "table"},
    }
