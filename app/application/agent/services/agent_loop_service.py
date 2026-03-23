"""
Agent Loop 核心推理引擎

实现 LLM ↔ Tool 循环：
1. 发送 messages + tools 给 LLM
2. LLM 返回 tool_use → 执行工具 → 将结果追加到 messages → 回到步骤 1
3. LLM 返回 end_turn → 结束循环，返回 AgentResponse
"""
from __future__ import annotations

import json
import time
from typing import Any, Callable

from app.domain.agent.entities import AgentResponse, AgentStep
from app.domain.agent.ports.llm_port import ILLMPort, LLMResponse
from app.application.agent.services.tool_registry import ToolExecutor
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class AgentLoopService:
    """Agent Loop 核心引擎"""

    def __init__(self, llm: ILLMPort):
        self._llm = llm

    def run(
        self,
        messages: list[dict[str, Any]],
        tool_defs: list[dict[str, Any]],
        executor: ToolExecutor,
        max_rounds: int = 15,
        on_progress: Callable[[AgentStep], None] | None = None,
    ) -> AgentResponse:
        """
        执行 Agent Loop

        Args:
            messages: 初始消息列表（含 system + user）
            tool_defs: 可用工具定义
            executor: 工具执行器（已绑定数据源）
            max_rounds: 最大循环轮次
            on_progress: 进度回调

        Returns:
            AgentResponse
        """
        accumulated_usage: dict[str, int] = {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
        }
        last_sql: str | None = None
        last_data: list[list[Any]] | None = None
        last_columns: list[str] | None = None

        for round_idx in range(max_rounds):
            logger.info(
                "Agent Loop 轮次",
                round=round_idx + 1,
                max=max_rounds,
                tool_count=len(tool_defs) if tool_defs else 0,
                tool_names=[t["name"] for t in tool_defs] if tool_defs else [],
            )

            llm_response: LLMResponse = self._llm.chat(
                messages=messages,
                tools=tool_defs if tool_defs else None,
                temperature=0.0,
            )

            self._accumulate_usage(accumulated_usage, llm_response.usage)

            logger.info(
                "LLM 响应",
                round=round_idx + 1,
                stop_reason=llm_response.stop_reason,
                has_content=bool(llm_response.content),
                content_preview=llm_response.content[:200] if llm_response.content else None,
                tool_calls=[tc.name for tc in llm_response.tool_calls] if llm_response.tool_calls else [],
            )

            if llm_response.stop_reason == "end_turn":
                return AgentResponse(
                    text=llm_response.content or "",
                    sql=last_sql,
                    data=last_data,
                    columns=last_columns,
                    usage=accumulated_usage,
                )

            # tool_use: 执行所有工具调用
            assistant_msg: dict[str, Any] = {"role": "assistant", "content": llm_response.content}
            if llm_response.tool_calls:
                assistant_msg["tool_calls"] = [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.name,
                            "arguments": json.dumps(tc.arguments, ensure_ascii=False),
                        },
                    }
                    for tc in llm_response.tool_calls
                ]
            messages.append(assistant_msg)

            for tc in llm_response.tool_calls:
                logger.info(
                    "工具调用",
                    round=round_idx + 1,
                    tool=tc.name,
                    arguments=tc.arguments,
                )

                if on_progress:
                    on_progress(AgentStep(
                        tool_name=tc.name,
                        status="running",
                        summary=self._step_summary(tc.name, "running"),
                    ))

                result = executor.execute(tc.name, tc.arguments)

                logger.info(
                    "工具结果",
                    round=round_idx + 1,
                    tool=tc.name,
                    result_preview=self._truncate(result),
                )

                # 提取 SQL 查询结果供最终响应使用
                if tc.name == "execute_sql":
                    last_sql = tc.arguments.get("sql")
                    if "error" not in result:
                        last_columns = result.get("columns", [])
                        raw_data = result.get("data", [])
                        if raw_data and isinstance(raw_data[0], dict):
                            last_data = [
                                [row.get(c) for c in last_columns]
                                for row in raw_data
                            ]
                        else:
                            last_data = raw_data

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(result, ensure_ascii=False, default=str),
                })

                if on_progress:
                    on_progress(AgentStep(
                        tool_name=tc.name,
                        status="completed",
                        summary=self._step_summary(tc.name, "completed"),
                        details={"result_preview": self._truncate(result)},
                    ))

        logger.warning("Agent Loop 达到最大轮次", max_rounds=max_rounds)
        return AgentResponse(
            text="抱歉，推理轮次已达上限，未能得到最终结果。请尝试简化问题后重试。",
            sql=last_sql,
            data=last_data,
            columns=last_columns,
            error="max_rounds_exceeded",
            usage=accumulated_usage,
        )

    @staticmethod
    def _accumulate_usage(total: dict[str, int], delta: dict[str, Any]) -> None:
        for key in ("prompt_tokens", "completion_tokens", "total_tokens"):
            total[key] = total.get(key, 0) + delta.get(key, 0)

    @staticmethod
    def _step_summary(tool_name: str, status: str) -> str:
        summaries = {
            "read_knowledge": ("📖 正在检索数仓知识文档...", "📖 知识文档加载完成"),
            "search_knowledge": ("🔍 正在搜索知识库...", "🔍 知识库搜索完成"),
            "list_tables": ("🗂️ 正在查询可用数据表...", "🗂️ 数据表列表获取完成"),
            "describe_table": ("🗂️ 正在查询表结构...", "🗂️ 表结构获取完成"),
            "execute_sql": ("⚙️ 正在执行 SQL 查询...", "⚙️ SQL 查询执行完成"),
            "list_cubes": ("📊 正在获取语义层 Cube 列表...", "📊 Cube 列表获取完成"),
            "describe_cube": ("📊 正在查看 Cube 详情...", "📊 Cube 详情加载完成"),
            "query": ("📊 正在通过语义层查询数据...", "📊 语义层查询完成"),
        }
        pair = summaries.get(tool_name, (f"🔧 正在执行 {tool_name}...", f"🔧 {tool_name} 执行完成"))
        return pair[0] if status == "running" else pair[1]

    @staticmethod
    def _truncate(result: dict[str, Any], max_len: int = 500) -> dict[str, Any]:
        """截断工具结果摘要，避免回调传输过大数据"""
        s = json.dumps(result, ensure_ascii=False, default=str)
        if len(s) <= max_len:
            return result
        return {"_truncated": True, "preview": s[:max_len] + "..."}
