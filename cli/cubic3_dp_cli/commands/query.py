"""query 命令（http-client，T1 编译/规划预览，不出数）。"""
from __future__ import annotations

from typing import Annotated

import typer

from cubic3_dp_cli.envelope import call_and_emit, parse_json_arg


app = typer.Typer(help="语义编译 / 规划预览（preview-only，不出数）", no_args_is_help=True)

_RuntimeMode = Annotated[str, typer.Option("--runtime-mode", help="official|preview（默认 official）")]


@app.command("compile", help="QueryDSL → SQL（纯编译）")
def compile_dsl(
    ctx: typer.Context,
    dsl: Annotated[str, typer.Argument(help="QueryDSL JSON（内联 / @file / -）")],
) -> None:
    call_and_emit(ctx, "POST", "/api/v1/semantic/compile", json_body=parse_json_arg(dsl))


@app.command("plan", help="NL → 语义规划（多步 planning_steps）")
def plan(ctx: typer.Context, question: Annotated[str, typer.Argument()], runtime_mode: _RuntimeMode = "official") -> None:
    call_and_emit(ctx, "POST", "/api/v1/semantic-router/plan", json_body={"question": question, "runtime_mode": runtime_mode})


@app.command("explain", help="NL → 编译预览 SQL（preview-only，不碰 gateway）")
def explain(ctx: typer.Context, question: Annotated[str, typer.Argument()], runtime_mode: _RuntimeMode = "official") -> None:
    call_and_emit(
        ctx, "POST", "/api/v1/semantic-router/execute-plan-preview",
        json_body={"question": question, "runtime_mode": runtime_mode},
    )
