"""OpenAI-compatible Agent 推理 Runtime 适配器。"""
from __future__ import annotations

import json
import os
from typing import Any, Callable, Mapping
from uuid import uuid4

from openai import APIConnectionError, APIError, APITimeoutError, OpenAI

from app.application.agent_inference_runtime.errors import AgentInferenceRuntimeError
from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    AgentInferenceRuntimeResult,
)


class OpenAICompatibleRuntimeAdapter:
    """使用 OpenAI Chat Completions 兼容协议执行同步 Agent 推理。"""

    runtime_name = "openai_compatible"

    def __init__(
        self,
        *,
        api_key: str | None = None,
        api_base: str | None = None,
        model: str | None = None,
        timeout: int | float | str | None = None,
        config_provider: Callable[[], Mapping[str, Any]] | None = None,
    ) -> None:
        self._api_key = api_key if api_key is not None else os.getenv("AGENT_OPENAI_API_KEY")
        self._api_base = api_base if api_base is not None else os.getenv("AGENT_OPENAI_BASE_URL")
        self._model = model or os.getenv("AGENT_OPENAI_MODEL") or "gpt-4o-mini"
        timeout_value = timeout if timeout is not None else os.getenv("AGENT_OPENAI_TIMEOUT_SECONDS")
        self._timeout = _parse_timeout_seconds(timeout_value)
        self._config_provider = config_provider

    @property
    def is_configured(self) -> bool:
        config = self._current_config()
        return bool(_as_bool(config.get("enabled", True)) and config.get("api_key") and config.get("model"))

    def can_handle(self, request: AgentInferenceRuntimeRequest) -> bool:
        return (
            request.preferred_runtime in {None, self.runtime_name}
            and request.execution_mode == "sync"
        )

    def invoke(self, request: AgentInferenceRuntimeRequest) -> AgentInferenceRuntimeResult:
        config = self._current_config()
        if not _as_bool(config.get("enabled", True)) or not config.get("api_key"):
            raise AgentInferenceRuntimeError(
                "未配置 AGENT_OPENAI_API_KEY，无法运行 OpenAI-compatible runtime。",
                code="RUNTIME_NOT_CONFIGURED",
                details={"runtime_name": self.runtime_name},
            )

        client_kwargs: dict[str, Any] = {
            "api_key": config["api_key"],
            "timeout": config["timeout"],
        }
        if config.get("api_base"):
            client_kwargs["base_url"] = config["api_base"]

        try:
            client = OpenAI(**client_kwargs)
            completion = client.chat.completions.create(
                model=config["model"],
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "你是 Cubic3 数据平台的 Agent Runtime。"
                            "请严格返回符合目标 output_schema 的 JSON 对象。"
                        ),
                    },
                    {
                        "role": "user",
                        "content": _serialize_payload(
                            {
                                "action": request.action,
                                "input": request.input,
                                "context_pack": request.context_pack,
                                "output_schema": request.output_schema,
                            }
                        ),
                    },
                ],
                response_format={"type": "json_object"},
                temperature=0,
            )
        except APITimeoutError as exc:
            raise AgentInferenceRuntimeError(
                "OpenAI-compatible runtime 调用超时。",
                code="RUNTIME_TIMEOUT",
                details={"runtime_name": self.runtime_name},
            ) from exc
        except (APIConnectionError, APIError) as exc:
            raise AgentInferenceRuntimeError(
                "OpenAI-compatible runtime provider 调用失败。",
                code="RUNTIME_PROVIDER_ERROR",
                details={"runtime_name": self.runtime_name},
            ) from exc
        except Exception as exc:
            raise AgentInferenceRuntimeError(
                "OpenAI-compatible runtime provider 调用失败。",
                code="RUNTIME_PROVIDER_ERROR",
                details={"runtime_name": self.runtime_name},
            ) from exc

        content = completion.choices[0].message.content
        try:
            structured_output = json.loads(content or "")
        except json.JSONDecodeError as exc:
            raise AgentInferenceRuntimeError(
                "OpenAI-compatible runtime 返回了非 JSON 内容。",
                code="RUNTIME_INVALID_OUTPUT",
                details={"runtime_name": self.runtime_name},
            ) from exc

        if not isinstance(structured_output, dict):
            raise AgentInferenceRuntimeError(
                "OpenAI-compatible runtime 返回的 JSON 不是对象。",
                code="RUNTIME_INVALID_OUTPUT",
                details={"runtime_name": self.runtime_name},
            )

        return AgentInferenceRuntimeResult(
            run_id=f"run_{uuid4().hex}",
            status="succeeded",
            runtime_name=self.runtime_name,
            action=request.action,
            structured_output=structured_output,
            artifacts=[],
            usage=self._usage_dict(getattr(completion, "usage", None)),
            trace=[{"event_type": "run.succeeded", "seq": 1, "runtime_name": self.runtime_name}],
            error=None,
        )

    def _current_config(self) -> dict[str, Any]:
        if self._config_provider is None:
            return {
                "enabled": True,
                "api_key": self._api_key or "",
                "api_base": self._api_base or "",
                "model": self._model,
                "timeout": self._timeout,
            }
        raw_config = dict(self._config_provider() or {})
        return {
            "enabled": _as_bool(raw_config.get("enabled", True)),
            "api_key": str(raw_config.get("api_key") or "").strip(),
            "api_base": str(raw_config.get("api_base") or "").strip(),
            "model": str(raw_config.get("model") or self._model or "").strip(),
            "timeout": _parse_timeout_seconds(raw_config.get("timeout", self._timeout)),
        }

    def _usage_dict(self, usage: Any) -> dict[str, Any]:
        if usage is None:
            return {}
        if hasattr(usage, "model_dump"):
            return usage.model_dump()
        if isinstance(usage, dict):
            return dict(usage)
        return {
            key: getattr(usage, key)
            for key in ("prompt_tokens", "completion_tokens", "total_tokens")
            if hasattr(usage, key)
        }


def _parse_timeout_seconds(value: int | float | str | None) -> float:
    if value is None:
        return 60.0
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise AgentInferenceRuntimeError(
            "AGENT_OPENAI_TIMEOUT_SECONDS 配置非法。",
            code="RUNTIME_CONFIG_INVALID",
            details={"runtime_name": OpenAICompatibleRuntimeAdapter.runtime_name},
        ) from exc


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _serialize_payload(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, default=str)
