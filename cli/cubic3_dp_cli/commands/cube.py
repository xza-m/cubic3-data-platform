"""cube 命令（http-client，T1 读）：cube 定义口径。

create/update/draft 是 T3 写域，留 in-process semctl（远程不提供，避免无门控写共享定义）。
"""
from __future__ import annotations

from typing import Annotated

import typer

from cubic3_dp_cli.client import encode_segment
from cubic3_dp_cli.envelope import call_and_emit, call_list_emit


app = typer.Typer(help="语义 Cube 定义（只读；建模写走 semctl）", no_args_is_help=True)


@app.command("list", help="列出已定义 Cube")
def list_cubes(ctx: typer.Context) -> None:
    call_list_emit(ctx, "GET", "/api/v1/semantic/cubes", items_key="cubes")


@app.command("show", help="查看 Cube（含 dims/measures/diagnostics）")
def show(ctx: typer.Context, name: Annotated[str, typer.Argument()]) -> None:
    call_and_emit(ctx, "GET", f"/api/v1/semantic/cubes/{encode_segment(name)}")


@app.command("describe", help="查看 Cube 详情（同 show，含 diagnostics）")
def describe(ctx: typer.Context, name: Annotated[str, typer.Argument()]) -> None:
    call_and_emit(ctx, "GET", f"/api/v1/semantic/cubes/{encode_segment(name)}")
