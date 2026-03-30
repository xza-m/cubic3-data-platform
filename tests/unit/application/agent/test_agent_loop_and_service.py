from unittest.mock import MagicMock

from app.application.agent.agent_service import AgentService
from app.application.agent.services.agent_loop_service import AgentLoopService
from app.domain.agent.entities import AgentContext, AgentRequest
from app.domain.agent.ports.llm_port import LLMResponse, ToolCall


class FakeLLM:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = []

    def chat(self, messages, tools=None, temperature=0.0):
        self.calls.append({
            "messages": messages,
            "tools": tools,
            "temperature": temperature,
        })
        return self._responses.pop(0)


def test_agent_loop_service_returns_end_turn_response_and_accumulates_usage() -> None:
    llm = FakeLLM([
        LLMResponse(
            content="最终答案",
            stop_reason="end_turn",
            usage={"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5},
        )
    ])
    service = AgentLoopService(llm)

    response = service.run(
        messages=[{"role": "system", "content": "sys"}, {"role": "user", "content": "hello"}],
        tool_defs=[],
        executor=MagicMock(),
    )

    assert response.text == "最终答案"
    assert response.usage == {"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5}


def test_agent_loop_service_executes_tool_calls_and_reports_progress() -> None:
    llm = FakeLLM([
        LLMResponse(
            content="先查 SQL",
            stop_reason="tool_use",
            tool_calls=[ToolCall(id="call_1", name="execute_sql", arguments={"sql": "select 1"})],
            usage={"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
        ),
        LLMResponse(
            content="查询完成",
            stop_reason="end_turn",
            usage={"prompt_tokens": 2, "completion_tokens": 2, "total_tokens": 4},
        ),
    ])
    executor = MagicMock()
    executor.execute.return_value = {
        "columns": ["id"],
        "data": [{"id": 1}],
    }
    progress = []
    service = AgentLoopService(llm)

    response = service.run(
        messages=[{"role": "system", "content": "sys"}, {"role": "user", "content": "hello"}],
        tool_defs=[{"name": "execute_sql"}],
        executor=executor,
        on_progress=progress.append,
    )

    assert response.text == "查询完成"
    assert response.sql == "select 1"
    assert response.columns == ["id"]
    assert response.data == [[1]]
    assert response.usage == {"prompt_tokens": 3, "completion_tokens": 3, "total_tokens": 6}
    assert [step.status for step in progress] == ["running", "completed"]
    assert progress[0].summary == "⚙️ 正在执行 SQL 查询..."
    assert progress[1].details["result_preview"]["columns"] == ["id"]
    assert llm.calls[1]["messages"][-1]["role"] == "tool"


def test_agent_loop_service_handles_raw_tool_rows_and_max_rounds() -> None:
    llm = FakeLLM([
        LLMResponse(
            content="继续",
            stop_reason="tool_use",
            tool_calls=[ToolCall(id="call_1", name="execute_sql", arguments={"sql": "select 1"})],
            usage={},
        )
    ])
    executor = MagicMock()
    executor.execute.return_value = {
        "columns": ["id"],
        "data": [[1]],
    }
    service = AgentLoopService(llm)

    response = service.run(
        messages=[{"role": "system", "content": "sys"}, {"role": "user", "content": "hello"}],
        tool_defs=[{"name": "execute_sql"}],
        executor=executor,
        max_rounds=1,
    )

    assert response.error == "max_rounds_exceeded"
    assert response.data == [[1]]
    assert AgentLoopService._step_summary("custom_tool", "running") == "🔧 正在执行 custom_tool..."
    assert AgentLoopService._truncate({"text": "x" * 600})["_truncated"] is True


def test_agent_service_handles_missing_adapter_success_path_and_exception() -> None:
    loop = MagicMock()
    prompt_builder = MagicMock()
    tool_registry = MagicMock()
    request = AgentRequest(
        message="你好",
        context=AgentContext(channel="feishu", user_id="u1"),
        history=[{"role": "assistant", "content": "old"}],
    )

    no_adapter_service = AgentService(loop, prompt_builder, tool_registry, config={})
    no_adapter_response = no_adapter_service.run(request)
    assert no_adapter_response.error == "no_adapter"

    prompt_builder.build.return_value = "system prompt"
    tool_registry.for_context.return_value = ([{"name": "execute_sql"}], MagicMock())
    loop.run.return_value = MagicMock(text="ok", error=None)
    adapter = object()

    service = AgentService(
        loop,
        prompt_builder,
        tool_registry,
        config={"agent": {"max_loop_rounds": 9}},
        default_adapter=adapter,
        default_database="dw",
    )
    response = service.run(request)

    assert response.text == "ok"
    prompt_builder.build.assert_called_once_with(request.context, schema_info=None)
    tool_registry.for_context.assert_called_once_with("feishu", adapter, database="dw")
    loop_messages = loop.run.call_args.kwargs["messages"]
    assert loop_messages[0]["role"] == "system"
    assert loop_messages[-1]["content"] == "你好"
    assert loop.run.call_args.kwargs["max_rounds"] == 9

    loop.run.side_effect = RuntimeError("boom")
    error_response = service.run(request)
    assert error_response.error == "agent_error"
    assert "boom" in error_response.text
