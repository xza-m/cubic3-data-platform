from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any

import typer

from cubic3_dp_cli.client import Cubic3DpClient, Cubic3DpError
from cubic3_dp_cli.config import CliConfigStore
from cubic3_dp_cli.output import emit


@dataclass
class RuntimeContext:
    client: Cubic3DpClient
    output: str
    config_store: CliConfigStore
    profile: str
    base_url: str
    timeout: float
    auth_source: str
    access_token: str | None = None
    refresh_token: str | None = None
    access_expires_at: str | None = None
    refresh_expires_at: str | None = None
    api_key: str | None = None


class OutputFormat(str, Enum):
    json = "json"
    table = "table"


def runtime(ctx: typer.Context) -> RuntimeContext:
    root_ctx = ctx.find_root()
    if not isinstance(root_ctx.obj, RuntimeContext):
        raise Cubic3DpError("CLI 上下文初始化失败")
    return root_ctx.obj


def emit_result(ctx: typer.Context, data: Any) -> None:
    emit(data, output=runtime(ctx).output)


def require_yes(confirmed: bool, action: str) -> None:
    if confirmed:
        return
    raise Cubic3DpError(f"{action}，请添加 --yes 确认。", exit_code=2)


def load_json_payload(path: str) -> dict[str, Any]:
    if path == "-":
        raw = sys.stdin.read()
    else:
        raw = Path(path).read_text(encoding="utf-8")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise Cubic3DpError(f"JSON payload 解析失败: {exc}") from exc
    if not isinstance(payload, dict):
        raise Cubic3DpError("JSON payload 必须是 object")
    return payload
