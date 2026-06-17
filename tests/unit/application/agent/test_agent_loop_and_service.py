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


def test_agent_loop_service_normalizes_structured_column_definitions() -> None:
    """适配器返回 [{'name','type'}] 结构化列定义时，AgentResponse.columns 必须归一化为列名列表。"""
    llm = FakeLLM([
        LLMResponse(
            content="先查 SQL",
            stop_reason="tool_use",
            tool_calls=[ToolCall(id="call_1", name="execute_sql", arguments={"sql": "select 1"})],
            usage={},
        ),
        LLMResponse(content="完成", stop_reason="end_turn", usage={}),
    ])
    executor = MagicMock()
    executor.execute.return_value = {
        "columns": [{"name": "ds", "type": "string"}, {"name": "total", "type": "bigint"}],
        "data": [["20260611", 437961]],
    }
    service = AgentLoopService(llm)

    response = service.run(
        messages=[{"role": "system", "content": "sys"}, {"role": "user", "content": "hello"}],
        tool_defs=[{"name": "execute_sql"}],
        executor=executor,
    )

    assert response.columns == ["ds", "total"]
    assert response.data == [["20260611", 437961]]


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


def test_agent_loop_service_blocks_execute_sql_before_semantic_attempt() -> None:
    """§4.2 通道优先级合约：语义工具可用且未尝试时，execute_sql 被硬约束拒绝。"""
    llm = FakeLLM([
        LLMResponse(
            content="直接写 SQL",
            stop_reason="tool_use",
            tool_calls=[ToolCall(id="call_1", name="execute_sql", arguments={"sql": "select 1"})],
            usage={},
        ),
        LLMResponse(content="好的我先看语义层", stop_reason="end_turn", usage={}),
    ])
    executor = MagicMock()
    service = AgentLoopService(llm)

    response = service.run(
        messages=[{"role": "system", "content": "sys"}, {"role": "user", "content": "hello"}],
        tool_defs=[{"name": "execute_sql"}, {"name": "query"}, {"name": "list_cubes"}],
        executor=executor,
    )

    executor.execute.assert_not_called()
    assert response.sql is None
    assert response.tool_trace[0]["tool"] == "execute_sql"
    assert response.tool_trace[0]["ok"] is False
    assert response.tool_trace[0]["error_code"] == "semantic_first_required"
    assert response.degradation is None


def test_agent_loop_service_records_degradation_after_semantic_failure() -> None:
    """语义 query 失败后降级 execute_sql：降级原因必须进入 evidence。"""
    llm = FakeLLM([
        LLMResponse(
            content="先语义查询",
            stop_reason="tool_use",
            tool_calls=[ToolCall(id="call_1", name="query", arguments={"dsl": {}})],
            usage={},
        ),
        LLMResponse(
            content="降级 SQL",
            stop_reason="tool_use",
            tool_calls=[ToolCall(id="call_2", name="execute_sql", arguments={"sql": "select 1"})],
            usage={},
        ),
        LLMResponse(content="完成", stop_reason="end_turn", usage={}),
    ])
    executor = MagicMock()
    executor.execute.side_effect = [
        {"error": "未找到 Cube: orders", "error_code": "cube_not_found"},
        {"columns": ["id"], "data": [[1]]},
    ]
    service = AgentLoopService(llm)

    response = service.run(
        messages=[{"role": "system", "content": "sys"}, {"role": "user", "content": "hello"}],
        tool_defs=[{"name": "execute_sql"}, {"name": "query"}],
        executor=executor,
    )

    assert response.sql == "select 1"
    assert response.degradation == {
        "from": "semantic_query",
        "to": "execute_sql",
        "reason": "cube_not_found",
        "round": 2,
    }
    assert [item["tool"] for item in response.tool_trace] == ["query", "execute_sql"]
    assert response.tool_trace_evidence()["degradation"]["reason"] == "cube_not_found"


def test_agent_loop_service_allows_execute_sql_without_semantic_tools() -> None:
    """信道没有语义工具时（如纯 SQL 信道），execute_sql 不受语义优先约束。"""
    llm = FakeLLM([
        LLMResponse(
            content="直接 SQL",
            stop_reason="tool_use",
            tool_calls=[ToolCall(id="call_1", name="execute_sql", arguments={"sql": "select 1"})],
            usage={},
        ),
        LLMResponse(content="完成", stop_reason="end_turn", usage={}),
    ])
    executor = MagicMock()
    executor.execute.return_value = {"columns": ["id"], "data": [[1]]}
    service = AgentLoopService(llm)

    response = service.run(
        messages=[{"role": "system", "content": "sys"}, {"role": "user", "content": "hello"}],
        tool_defs=[{"name": "execute_sql"}],
        executor=executor,
    )

    assert response.sql == "select 1"
    assert response.degradation is None


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
    tool_registry.for_context.assert_called_once_with(
        "feishu", adapter, database="dw", agent_context=request.context
    )
    loop_messages = loop.run.call_args.kwargs["messages"]
    assert loop_messages[0]["role"] == "system"
    assert loop_messages[-1]["content"] == "你好"
    assert loop.run.call_args.kwargs["max_rounds"] == 9

    loop.run.side_effect = RuntimeError("boom")
    error_response = service.run(request)
    assert error_response.error == "agent_error"
    assert "boom" in error_response.text
