"""view 命令（http-client，T1 读）：语义 View 定义。"""
from __future__ import annotations

from typing import Annotated

import typer

from cubic3_dp_cli.client import encode_segment
from cubic3_dp_cli.envelope import call_and_emit, call_list_emit


app = typer.Typer(help="语义 View 定义（只读）", no_args_is_help=True)


@app.command("list", help="列出 View 定义")
def list_views(ctx: typer.Context) -> None:
    call_list_emit(ctx, "GET", "/api/v1/semantic/views", items_key="views")


@app.command("show", help="查看 View 详情")
def show(ctx: typer.Context, name: Annotated[str, typer.Argument()]) -> None:
    call_and_emit(ctx, "GET", f"/api/v1/semantic/views/{encode_segment(name)}")


@app.command("describe", help="查看 View 详情（含 diagnostics；HTTP 侧与 show 同端点）")
def describe(ctx: typer.Context, name: Annotated[str, typer.Argument()]) -> None:
    call_and_emit(ctx, "GET", f"/api/v1/semantic/views/{encode_segment(name)}")
