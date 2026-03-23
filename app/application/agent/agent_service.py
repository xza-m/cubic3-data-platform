"""
AgentService — DataAgent 统一入口

所有信道（飞书、DataChat）的请求最终汇聚到此处。
负责编排 PromptBuilder → AgentLoop → AgentResponse 的完整流程。
"""
from __future__ import annotations

from typing import Any, Callable

from app.domain.agent.entities import AgentRequest, AgentResponse, AgentStep
from app.domain.agent.ports.llm_port import ILLMPort
from app.application.agent.services.agent_loop_service import AgentLoopService
from app.application.agent.services.prompt_builder import PromptBuilder
from app.application.agent.services.tool_registry import ToolRegistry
from app.infrastructure.adapters.datasources.base_adapter import DataSourceAdapter
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class AgentService:
    """
    DataAgent 统一服务入口

    持有：
    - AgentLoopService（推理循环引擎）
    - PromptBuilder（按信道构建 System Prompt）
    - ToolRegistry（工具注册中心）
    - AppInstance.config（运行时配置）
    - default_adapter（飞书信道的 MaxCompute 适配器）
    """

    def __init__(
        self,
        loop: AgentLoopService,
        prompt_builder: PromptBuilder,
        tool_registry: ToolRegistry,
        config: dict[str, Any],
        default_adapter: DataSourceAdapter | None = None,
        default_database: str | None = None,
    ):
        self._loop = loop
        self._prompt_builder = prompt_builder
        self._tool_registry = tool_registry
        self._config = config
        self._default_adapter = default_adapter
        self._default_database = default_database

    def run(
        self,
        request: AgentRequest,
        on_progress: Callable[[AgentStep], None] | None = None,
        adapter: DataSourceAdapter | None = None,
        schema_info: dict[str, Any] | None = None,
    ) -> AgentResponse:
        """
        执行 Agent 请求

        Args:
            request: 统一请求体
            on_progress: 进度回调（飞书信道用于更新卡片）
            adapter: 数据源适配器（DataChat 信道传入，飞书信道使用默认）
            schema_info: 数据集 schema（仅 DataChat 信道需要）

        Returns:
            AgentResponse
        """
        logger.info(
            "AgentService.run",
            channel=request.context.channel,
            user_id=request.context.user_id or request.context.open_id,
        )

        try:
            ds_adapter = adapter or self._default_adapter
            if not ds_adapter:
                return AgentResponse(
                    text="Agent 尚未配置数据源，请联系管理员。",
                    error="no_adapter",
                )

            system_prompt = self._prompt_builder.build(
                request.context,
                schema_info=schema_info,
            )

            tool_defs, executor = self._tool_registry.for_context(
                request.context.channel,
                ds_adapter,
                database=self._default_database,
            )

            messages: list[dict[str, Any]] = [
                {"role": "system", "content": system_prompt},
            ]
            if request.history:
                messages.extend(request.history)
            messages.append({"role": "user", "content": request.message})

            agent_params = self._config.get("agent", {})
            max_rounds = agent_params.get("max_loop_rounds", 15)

            return self._loop.run(
                messages=messages,
                tool_defs=tool_defs,
                executor=executor,
                max_rounds=max_rounds,
                on_progress=on_progress,
            )

        except Exception as e:
            logger.error("AgentService 执行异常", error=str(e), exc_info=True)
            return AgentResponse(
                text=f"Agent 处理异常: {str(e)}",
                error="agent_error",
            )
