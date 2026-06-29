"""与 semctl 对齐的 envelope 输出 + 退出码映射。

T1 命令统一用 call_and_emit：原样输出后端的 `{code,message,data,trace_id}` envelope，
并按 semctl（app/interfaces/cli/output.py）口径映射退出码，使 http-client 与 in-process
两路对 agent 呈现同一契约。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import typer

from cubic3_dp_cli.output import emit
from cubic3_dp_cli.runtime import runtime


def emit_local_only(ctx, command: str) -> None:
    """写域命令在 http-client 不提供：输出 local_only 指引 envelope + 退出码 2。

    写共享语义资产/live manifest 的信任边界是『能 exec 进部署』，不对远程 token 开放；
    这类命令只在本地引擎 semctl 提供。
    """
    emit(
        {
            "code": -1,
            "message": (
                f"'{command}' 是写域命令（写共享语义定义/live manifest），http-client(cubic3-dp) 不提供。"
                f"请用本地引擎在部署环境内执行：python -m app.interfaces.cli {command} ...（需 exec 进后端容器）"
            ),
            "data": {"local_only": True, "command": command, "engine": "semctl"},
            "trace_id": None,
        },
        output=runtime(ctx).output,
    )
    raise typer.Exit(EXIT_USAGE)


def parse_json_arg(value: str) -> Any:
    """解析 JSON 入参：'@file' 读文件 / '-' 读 stdin / 否则当内联 JSON（与 semctl load_json_arg 同口径）。

    读取与解析都在 try 内：@缺失文件/读 stdin 失败的 OSError 也转 BadParameter（usage exit 2）。
    """
    try:
        if value == "-":
            text = sys.stdin.read()
        elif value.startswith("@"):
            text = Path(value[1:]).read_text(encoding="utf-8")
        else:
            text = value
        return json.loads(text)
    except (json.JSONDecodeError, OSError) as exc:
        raise typer.BadParameter(f"JSON 解析失败: {exc}")  # → usage exit 2

# 退出码（与 semctl 对齐）
EXIT_OK = 0
EXIT_ERROR = 1
EXIT_USAGE = 2
EXIT_NOT_FOUND = 4
EXIT_NOT_READY = 5


def call_and_emit(
    ctx: typer.Context,
    method: str,
    path: str,
    *,
    params: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
    not_ready: bool = False,
) -> None:
    """调用 API → 原样输出完整 envelope → 按 semctl 口径置退出码。

    not_ready=True（如 manifest）：data.ok=false → exit 5（runtime 未就绪）。
    HTTP 404 → exit 4；其余失败（code!=0 或 status>=400）→ exit 1。
    """
    rt = runtime(ctx)
    payload, status = rt.client.call(method, path, params=params, json_body=json_body)
    emit(payload, output=rt.output)

    if status == 404:
        raise typer.Exit(EXIT_NOT_FOUND)
    if not_ready and isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, dict) and data.get("ok") is False:
            raise typer.Exit(EXIT_NOT_READY)
    code = payload.get("code") if isinstance(payload, dict) else None
    if status >= 400 or code not in (0, None):
        raise typer.Exit(EXIT_ERROR)


def _extract_list(data: Any, items_key: str | None) -> tuple[list, int]:
    if isinstance(data, list):
        return data, len(data)
    if isinstance(data, dict):
        if items_key and isinstance(data.get(items_key), list):
            lst = data[items_key]
        else:  # 自动取第一个 list 值字段（HTTP _build_list_payload 用 entity 名作 key）
            lst = next((v for v in data.values() if isinstance(v, list)), [])
        total = data.get("total")
        return lst, (total if isinstance(total, int) else len(lst))
    return [], 0


def call_list_emit(ctx, method, path, *, params=None, items_key: str | None = None) -> None:
    """列表命令：把后端 `{<entity>:[...],page,total}` 归一为 semctl 的 `{items,total}` 后输出。

    不动后端端点（UI 仍用原 payload），仅在 CLI 侧归一，使两路 list 输出同形。
    """
    rt = runtime(ctx)
    payload, status = rt.client.call(method, path, params=params)
    code = payload.get("code") if isinstance(payload, dict) else None
    if status >= 400 or code not in (0, None):
        emit(payload, output=rt.output)
        raise typer.Exit(EXIT_NOT_FOUND if status == 404 else EXIT_ERROR)
    items, total = _extract_list(payload.get("data") if isinstance(payload, dict) else None, items_key)
    emit(
        {"code": 0, "message": "success", "data": {"items": items, "total": total}, "trace_id": (payload or {}).get("trace_id")},
        output=rt.output,
    )


def call_project_emit(ctx, method, path, *, params=None, json_body=None, project) -> None:
    """调用成功后对 data 做投影、重包 envelope 输出（供 intent extract/answerability 投影 route 响应）。"""
    rt = runtime(ctx)
    payload, status = rt.client.call(method, path, params=params, json_body=json_body)
    code = payload.get("code") if isinstance(payload, dict) else None
    if status >= 400 or code not in (0, None):
        emit(payload, output=rt.output)  # 失败原样透传
        raise typer.Exit(EXIT_NOT_FOUND if status == 404 else EXIT_ERROR)
    data = payload.get("data") if isinstance(payload, dict) else None
    emit(
        {"code": 0, "message": "success", "data": project(data or {}), "trace_id": (payload or {}).get("trace_id")},
        output=rt.output,
    )
