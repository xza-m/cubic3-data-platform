"""Codex SDK provider client。

平台通过 Codex SDK 执行后台复审 / 修复任务，不暴露底层 transport。
"""
from __future__ import annotations

import asyncio
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import inspect
import json
from pathlib import Path
from threading import Lock
from typing import Any, Callable, Mapping
from uuid import uuid4

from app.domain.agent_inference_runtime.types import (
    AgentInferenceRuntimeRequest,
    RuntimeContextRef,
)
from app.infrastructure.agent_inference_runtime.codex_client import (
    CodexSdkClientError,
    ProviderRunRef,
    ProviderThreadRef,
)


SdkFactory = Callable[[], Any]


class CodexSdkClient:
    """把 Codex SDK 调用桥接为平台现有异步 run lifecycle。"""

    _TERMINAL_STATUSES = {"succeeded", "failed", "cancelled", "timeout"}

    def __init__(
        self,
        *,
        project_root: str,
        runtime_workspace_roots: list[str],
        model: str | None = None,
        sandbox: str = "read-only",
        timeout_seconds: int = 900,
        codex_path: str | None = None,
        base_url: str | None = None,
        api_key: str | None = None,
        sdk_factory: Any | None = None,
        max_workers: int = 2,
    ) -> None:
        self._project_root = str(Path(project_root).expanduser())
        self._runtime_workspace_roots = list(runtime_workspace_roots)
        self._model = str(model or "").strip() or None
        self._sandbox = str(sandbox or "read-only").strip() or "read-only"
        self._timeout_seconds = int(timeout_seconds or 900)
        self._codex_path = str(codex_path or "").strip() or None
        self._base_url = str(base_url or "").strip() or None
        self._api_key = str(api_key or "").strip() or None
        self._sdk_factory = sdk_factory or _DefaultCodexSdkFactory(
            codex_path=self._codex_path,
            base_url=self._base_url,
            api_key=self._api_key,
        )
        self._executor = ThreadPoolExecutor(max_workers=max(1, int(max_workers or 1)))
        self._lock = Lock()
        self._runs: dict[str, _SdkRunState] = {}

    def healthcheck(self) -> dict[str, Any]:
        self._ensure_sdk_ready()
        return {
            "status": "ready",
            "provider": "codex-sdk",
            "sdk_package": _sdk_package_name(self._sdk_factory),
            "transport": "sdk",
            "project_root": self._project_root,
        }

    def capabilities(self) -> dict[str, Any]:
        self._ensure_sdk_ready()
        return {
            "provider": "codex-sdk",
            "sdk_package": _sdk_package_name(self._sdk_factory),
            "transport": "sdk",
            "actions": [
                "semantic.modeling.review_proposal",
                "semantic.modeling.repair_validation_failure",
                "semantic.modeling.audit",
            ],
            "artifacts": ["codex_final_response", "codex_thread_items"],
            "events": ["run.started", "item.completed", "run.succeeded", "run.failed"],
        }

    def ensure_thread(self, ref: RuntimeContextRef) -> ProviderThreadRef:
        return ProviderThreadRef(provider_thread_id=_logical_thread_id(ref))

    def submit_run(self, request: AgentInferenceRuntimeRequest) -> ProviderRunRef:
        self._ensure_sdk_ready()
        provider_run_id = f"codex_sdk_run_{uuid4().hex}"
        provider_thread_id = _logical_thread_id(request.runtime_context_ref)
        state = _SdkRunState(
            provider_run_id=provider_run_id,
            provider_thread_id=provider_thread_id,
            request=request,
            status="running",
            events=[_event("run.started", provider_run_id=provider_run_id)],
        )
        with self._lock:
            self._runs[provider_run_id] = state
        state.future = self._executor.submit(self._execute_run, provider_run_id)
        return ProviderRunRef(
            provider_run_id=provider_run_id,
            provider="codex-sdk",
            provider_thread_id=provider_thread_id,
        )

    def poll_run(self, provider_run_id: str) -> dict[str, Any]:
        state = self._state(provider_run_id)
        self._settle_finished_future(state)
        return {
            "provider_run_id": provider_run_id,
            "provider": "codex-sdk",
            "provider_thread_id": state.provider_thread_id,
            "status": state.status,
            "provider_status": state.status,
            "structured_output": dict(state.structured_output),
            "summary": state.summary,
            "artifacts": [dict(item) for item in state.artifacts],
            "usage": dict(state.usage),
            "error": dict(state.error) if state.error is not None else None,
        }

    def stream_events(
        self,
        provider_run_id: str,
        *,
        cursor: str | None = None,
    ) -> dict[str, Any]:
        state = self._state(provider_run_id)
        self._settle_finished_future(state)
        start = _cursor_offset(cursor)
        return {
            "events": [dict(item) for item in state.events[start:]],
            "next_cursor": str(len(state.events)),
        }

    def cancel_run(self, provider_run_id: str) -> dict[str, Any]:
        state = self._state(provider_run_id)
        with self._lock:
            if state.status not in self._TERMINAL_STATUSES:
                state.status = "cancelled"
                state.error = {
                    "code": "RUNTIME_CANCELLED",
                    "message": "Codex SDK run cancelled by platform request.",
                }
                state.events.append(_event("run.cancelled", provider_run_id=provider_run_id))
                future = state.future
                if future is not None:
                    future.cancel()
        return {"provider_run_id": provider_run_id, "status": "cancelled"}

    def collect_artifacts(self, provider_run_id: str) -> list[dict[str, Any]]:
        state = self._state(provider_run_id)
        self._settle_finished_future(state)
        return [dict(item) for item in state.artifacts]

    def _execute_run(self, provider_run_id: str) -> None:
        state = self._state(provider_run_id)
        try:
            codex = _create_sdk(self._sdk_factory)
            with _maybe_context(codex) as active_codex:
                thread = _start_thread(active_codex, self._thread_options(state.request))
                result = _run_thread(thread, _prompt_for_request(state.request))
                provider_thread_id = str(getattr(thread, "id", "") or state.provider_thread_id)
                final_response = str(getattr(result, "final_response", "") or "")
                items = _items_from_result(result)
                usage = _usage_from_result(result)
                structured_output = _structured_output(final_response)
                artifacts = _artifacts_from_result(provider_run_id, final_response, items)
            with self._lock:
                if state.status == "cancelled":
                    return
                state.provider_thread_id = provider_thread_id
                state.status = "succeeded"
                state.structured_output = structured_output
                state.summary = _summary(final_response, structured_output)
                state.usage = usage
                state.artifacts = artifacts
                state.events.extend(_events_from_items(provider_run_id, items))
                state.events.append(_event("run.succeeded", provider_run_id=provider_run_id))
        except Exception as exc:  # noqa: BLE001
            with self._lock:
                if state.status == "cancelled":
                    return
                state.status = "failed"
                state.error = _sdk_error(exc)
                state.events.append(
                    _event(
                        "run.failed",
                        provider_run_id=provider_run_id,
                        error=dict(state.error),
                    )
                )

    def _thread_options(self, request: AgentInferenceRuntimeRequest) -> dict[str, Any]:
        roots = [root for root in self._runtime_workspace_roots if root != self._project_root]
        return {
            "model": self._model,
            "sandbox_mode": self._sandbox,
            "working_directory": self._project_root,
            "additional_directories": roots or [self._project_root],
            "skip_git_repo_check": True,
            "network_access_enabled": bool(request.runtime_policy.allow_network),
            "web_search_enabled": False,
            "approval_policy": "never",
        }

    def _state(self, provider_run_id: str) -> "_SdkRunState":
        with self._lock:
            state = self._runs.get(provider_run_id)
        if state is None:
            raise CodexSdkClientError(
                "Codex SDK provider_run_id 不存在或已过期。",
                code="RUNTIME_RUN_NOT_FOUND",
                details={"provider_run_id": provider_run_id, "provider": "codex-sdk"},
                status_code=404,
            )
        return state

    def _settle_finished_future(self, state: "_SdkRunState") -> None:
        future = state.future
        if future is None or not future.done():
            return
        try:
            future.result()
        except Exception as exc:  # noqa: BLE001
            with self._lock:
                if state.status not in self._TERMINAL_STATUSES:
                    state.status = "failed"
                    state.error = _sdk_error(exc)

    def _ensure_sdk_ready(self) -> None:
        try:
            codex = _create_sdk(self._sdk_factory)
        except ModuleNotFoundError as exc:
            raise CodexSdkClientError(
                "Codex SDK 未安装，请安装 openai_codex / openai_codex_sdk 对应 SDK 包。",
                code="RUNTIME_PROVIDER_NOT_CONFIGURED",
                details={"provider": "codex-sdk", "missing": str(exc)},
                status_code=503,
            ) from exc
        except Exception as exc:
            raise CodexSdkClientError(
                "Codex SDK 初始化失败。",
                code="RUNTIME_PROVIDER_ERROR",
                details={"provider": "codex-sdk", "error": str(exc)},
            ) from exc
        close = getattr(codex, "close", None)
        if callable(close):
            close()


class CodexSdkClientRegistry:
    """按管理配置缓存 SDK client，保证 submit 后 poll 能找到后台任务。"""

    def __init__(self) -> None:
        self._lock = Lock()
        self._clients: dict[tuple[Any, ...], CodexSdkClient] = {}

    def client_for_config(self, config: Mapping[str, Any]) -> CodexSdkClient:
        client_config = _client_config(config)
        key = tuple(sorted((item_key, _hashable_config_value(value)) for item_key, value in client_config.items()))
        with self._lock:
            client = self._clients.get(key)
            if client is None:
                client = CodexSdkClient(**client_config)
                self._clients[key] = client
            return client


class _SdkRunState:
    def __init__(
        self,
        *,
        provider_run_id: str,
        provider_thread_id: str,
        request: AgentInferenceRuntimeRequest,
        status: str,
        events: list[dict[str, Any]],
    ) -> None:
        self.provider_run_id = provider_run_id
        self.provider_thread_id = provider_thread_id
        self.request = request
        self.status = status
        self.events = events
        self.future: Future | None = None
        self.structured_output: dict[str, Any] = {}
        self.summary = ""
        self.artifacts: list[dict[str, Any]] = []
        self.usage: dict[str, Any] = {}
        self.error: dict[str, Any] | None = None


class _DefaultCodexSdkFactory:
    def __init__(
        self,
        *,
        codex_path: str | None = None,
        base_url: str | None = None,
        api_key: str | None = None,
    ) -> None:
        self.codex_path = codex_path
        self.base_url = base_url
        self.api_key = api_key
        self.package_name = ""

    def create(self) -> Any:
        module, package_name = _import_codex_sdk()
        self.package_name = package_name
        options = _sdk_options(
            package_name=package_name,
            codex_path=self.codex_path,
            base_url=self.base_url,
            api_key=self.api_key,
        )
        try:
            return module.Codex(options) if options else module.Codex()
        except TypeError:
            return module.Codex()


def _client_config(config: Mapping[str, Any]) -> dict[str, Any]:
    provider_extra = config.get("provider_extra")
    if not isinstance(provider_extra, dict):
        provider_extra = {}
    project_root = str(config.get("project_root") or ".")
    runtime_workspace_roots = _workspace_roots(config, project_root)
    return {
        "project_root": project_root,
        "runtime_workspace_roots": runtime_workspace_roots,
        "model": str(provider_extra.get("model") or config.get("model") or "").strip() or None,
        "sandbox": str(provider_extra.get("sandbox") or config.get("sandbox") or "read-only"),
        "timeout_seconds": _positive_int(
            provider_extra.get("timeout_seconds", config.get("timeout_seconds")),
            default=900,
        ),
        "codex_path": str(provider_extra.get("codex_path") or config.get("codex_path") or "").strip() or None,
        "base_url": str(provider_extra.get("base_url") or config.get("base_url") or "").strip() or None,
        "api_key": str(provider_extra.get("api_key") or config.get("api_key") or "").strip() or None,
        "max_workers": _positive_int(
            provider_extra.get("max_concurrency", config.get("max_concurrency")),
            default=2,
        ),
    }


def _hashable_config_value(value: Any) -> Any:
    if isinstance(value, list):
        return tuple(_hashable_config_value(item) for item in value)
    if isinstance(value, dict):
        return tuple(sorted((key, _hashable_config_value(item)) for key, item in value.items()))
    return value


def _workspace_roots(
    config: Mapping[str, Any],
    project_root: str,
) -> list[str]:
    raw_roots = config.get("runtime_workspace_roots")
    if raw_roots is None:
        roots = [project_root]
    elif isinstance(raw_roots, (list, tuple, set)):
        roots = [str(root) for root in raw_roots if str(root).strip()]
    else:
        roots = [item.strip() for item in str(raw_roots).split(",") if item.strip()]
    if project_root not in roots:
        roots.insert(0, project_root)
    return roots


def _positive_int(value: Any, *, default: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default


def _create_sdk(factory: Any) -> Any:
    if hasattr(factory, "create") and callable(factory.create):
        return factory.create()
    if callable(factory):
        return factory()
    raise TypeError("Codex SDK factory is not callable")


def _sdk_package_name(factory: Any) -> str:
    package_name = str(getattr(factory, "package_name", "") or "").strip()
    return package_name or "openai_codex"


def _import_codex_sdk() -> tuple[Any, str]:
    try:
        import openai_codex as module  # type: ignore[import-not-found]

        return module, "openai_codex"
    except ModuleNotFoundError:
        import openai_codex_sdk as module  # type: ignore[import-not-found]

        return module, "openai_codex_sdk"


def _sdk_options(
    *,
    package_name: str,
    codex_path: str | None,
    base_url: str | None,
    api_key: str | None,
) -> dict[str, Any]:
    options: dict[str, Any] = {}
    if package_name == "openai_codex_sdk":
        if codex_path:
            options["codex_path_override"] = codex_path
        if base_url:
            options["base_url"] = base_url
        if api_key:
            options["api_key"] = api_key
    return options


class _maybe_context:
    def __init__(self, value: Any) -> None:
        self._value = value

    def __enter__(self) -> Any:
        enter = getattr(self._value, "__enter__", None)
        if callable(enter):
            return enter()
        return self._value

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> Any:
        exit_method = getattr(self._value, "__exit__", None)
        if callable(exit_method):
            return exit_method(exc_type, exc, tb)
        close = getattr(self._value, "close", None)
        if callable(close):
            close()
        return None


def _start_thread(codex: Any, options: dict[str, Any]) -> Any:
    clean_options = {key: value for key, value in options.items() if value is not None}
    if hasattr(codex, "start_thread"):
        return codex.start_thread(clean_options)
    if hasattr(codex, "thread_start"):
        sandbox = clean_options.get("sandbox_mode")
        sandbox_value = _official_sandbox_value(codex, sandbox)
        return codex.thread_start(
            model=clean_options.get("model"),
            sandbox=sandbox_value,
        )
    raise TypeError("Codex SDK object does not expose start_thread/thread_start")


def _official_sandbox_value(codex: Any, sandbox: str | None) -> Any:
    module = inspect.getmodule(codex.__class__)
    sandbox_cls = getattr(module, "Sandbox", None) if module is not None else None
    if sandbox_cls is None:
        return sandbox
    if sandbox == "workspace-write":
        return getattr(sandbox_cls, "workspace_write", sandbox)
    if sandbox == "danger-full-access":
        return getattr(sandbox_cls, "full_access", sandbox)
    return getattr(sandbox_cls, "read_only", sandbox)


def _run_thread(thread: Any, prompt: str) -> Any:
    result = thread.run(prompt)
    if inspect.isawaitable(result):
        return asyncio.run(result)
    return result


def _prompt_for_request(request: AgentInferenceRuntimeRequest) -> str:
    payload = {
        "app": request.app_id,
        "action": request.action,
        "principal": request.principal_id,
        "input": dict(request.input),
        "context": dict(request.context_pack),
        "runtime_context": asdict(request.runtime_context_ref),
        "output_schema": request.output_schema,
    }
    return (
        "你是 Cubic3 数据平台的 Codex SDK 后台复审 worker。\n"
        "只读分析输入，不发布语义资产，不修改生产状态，不执行破坏性操作。\n"
        "请返回一个 JSON 对象；若无法完全结构化，也必须给出 summary 字段。\n\n"
        f"{json.dumps(payload, ensure_ascii=False, sort_keys=True)}"
    )


def _structured_output(final_response: str) -> dict[str, Any]:
    parsed = _parse_json_object(final_response)
    if parsed is not None:
        return parsed
    return {"summary": final_response.strip()}


def _parse_json_object(value: str) -> dict[str, Any] | None:
    text = value.strip()
    if not text:
        return {}
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:].strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return None
    return dict(parsed) if isinstance(parsed, dict) else None


def _summary(final_response: str, structured_output: Mapping[str, Any]) -> str:
    raw_summary = structured_output.get("summary") or structured_output.get("message")
    if isinstance(raw_summary, str) and raw_summary.strip():
        return raw_summary.strip()
    return final_response.strip()[:240]


def _items_from_result(result: Any) -> list[dict[str, Any]]:
    raw_items = getattr(result, "items", []) or []
    items: list[dict[str, Any]] = []
    for item in raw_items:
        if isinstance(item, dict):
            items.append(dict(item))
        elif hasattr(item, "model_dump"):
            items.append(dict(item.model_dump(mode="json")))
        else:
            items.append({"type": item.__class__.__name__, "value": str(item)})
    return items


def _usage_from_result(result: Any) -> dict[str, Any]:
    usage = getattr(result, "usage", None)
    if usage is None:
        return {}
    if isinstance(usage, dict):
        return dict(usage)
    if hasattr(usage, "model_dump"):
        return dict(usage.model_dump(mode="json"))
    return {"raw": str(usage)}


def _events_from_items(provider_run_id: str, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        _event("item.completed", provider_run_id=provider_run_id, item=dict(item))
        for item in items
    ]


def _artifacts_from_result(
    provider_run_id: str,
    final_response: str,
    items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    response_bytes = final_response.encode("utf-8")
    items_json = json.dumps(items, ensure_ascii=False, sort_keys=True)
    items_bytes = items_json.encode("utf-8")
    return [
        {
            "artifact_id": f"{provider_run_id}_final_response",
            "artifact_type": "codex_final_response",
            "title": "Codex SDK 最终输出",
            "summary": final_response[:240],
            "mime_type": "text/plain",
            "size_bytes": len(response_bytes),
            "sha256": hashlib.sha256(response_bytes).hexdigest(),
            "content": final_response,
        },
        {
            "artifact_id": f"{provider_run_id}_thread_items",
            "artifact_type": "codex_thread_items",
            "title": "Codex SDK 事件条目",
            "summary": f"{len(items)} 个 Codex SDK item。",
            "mime_type": "application/json",
            "size_bytes": len(items_bytes),
            "sha256": hashlib.sha256(items_bytes).hexdigest(),
            "content": items,
        },
    ]


def _event(event_type: str, **payload: Any) -> dict[str, Any]:
    return {
        "event_type": event_type,
        "ts": datetime.now(timezone.utc).isoformat(),
        **payload,
    }


def _cursor_offset(cursor: str | None) -> int:
    if cursor is None:
        return 0
    try:
        return max(0, int(cursor))
    except (TypeError, ValueError):
        return 0


def _logical_thread_id(ref: RuntimeContextRef) -> str:
    return f"{ref.project_id}:{ref.session_id}:{ref.thread_id}"


def _sdk_error(exc: Exception) -> dict[str, Any]:
    if isinstance(exc, CodexSdkClientError):
        return {"code": exc.code, "message": str(exc), **dict(exc.details)}
    return {
        "code": "RUNTIME_PROVIDER_ERROR",
        "message": str(exc),
        "provider": "codex-sdk",
    }
