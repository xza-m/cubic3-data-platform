"""
OpenAI 兼容 LLM 适配器

覆盖所有 OpenAI Chat Completions API 兼容的提供商：
- OpenAI (GPT-4o / GPT-4o-mini)
- 通义千问 Qwen (DashScope compatible mode)
- DeepSeek
- 月之暗面 Moonshot
"""
from __future__ import annotations

import json
from typing import Any

from openai import OpenAI, APIError, APIConnectionError, APITimeoutError

from app.domain.agent.ports.llm_port import ILLMPort, LLMResponse, ToolCall
from app.infrastructure.adapters.llm.base_llm_adapter import BaseLLMAdapter
from app.shared.utils.logger import get_logger
from app.shared.exceptions import ApplicationException

logger = get_logger(__name__)


class OpenAICompatibleAdapter(BaseLLMAdapter):
    """
    OpenAI Chat Completions API 兼容适配器

    使用 openai Python SDK，自动支持 tool_use（function calling）。
    """

    def __init__(
        self,
        api_key: str,
        api_base: str = "https://api.openai.com/v1",
        model: str = "gpt-4o-mini",
        timeout: int = 60,
    ):
        super().__init__(api_key=api_key, api_base=api_base, model=model, timeout=timeout)
        self._client = OpenAI(
            api_key=api_key,
            base_url=api_base,
            timeout=timeout,
        )

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        temperature: float = 0.0,
    ) -> LLMResponse:
        kwargs: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
        }

        if tools:
            kwargs["tools"] = [
                {"type": "function", "function": t} for t in tools
            ]
            kwargs["tool_choice"] = "auto"

        try:
            response = self._client.chat.completions.create(**kwargs)
        except APITimeoutError as e:
            logger.error("LLM 请求超时", model=self.model, error=str(e))
            raise ApplicationException(f"LLM 请求超时 ({self.timeout}s)")
        except APIConnectionError as e:
            logger.error("LLM 连接失败", model=self.model, error=str(e))
            raise ApplicationException(f"LLM 连接失败: {e}")
        except APIError as e:
            logger.error("LLM API 错误", model=self.model, status=e.status_code, error=str(e))
            raise ApplicationException(f"LLM API 错误 ({e.status_code}): {e.message}")

        choice = response.choices[0]
        message = choice.message

        tool_calls: list[ToolCall] = []
        if message.tool_calls:
            for tc in message.tool_calls:
                try:
                    arguments = json.loads(tc.function.arguments) if tc.function.arguments else {}
                except json.JSONDecodeError:
                    arguments = {"raw": tc.function.arguments}

                tool_calls.append(ToolCall(
                    id=tc.id,
                    name=tc.function.name,
                    arguments=arguments,
                ))

        stop_reason = "tool_use" if tool_calls else "end_turn"

        usage = {}
        if response.usage:
            usage = {
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens,
            }

        return LLMResponse(
            content=message.content,
            tool_calls=tool_calls,
            stop_reason=stop_reason,
            usage=usage,
        )
