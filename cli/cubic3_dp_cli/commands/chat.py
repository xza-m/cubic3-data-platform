"""chat 命令（http-client，T1 读）：observe DataChat 问数效果。"""
from __future__ import annotations

from typing import Annotated

import typer

from cubic3_dp_cli.envelope import call_and_emit


app = typer.Typer(help="DataChat 观测（只读）", no_args_is_help=True)


@app.command("observe", help="观察最近 N 条 DataChat 问数：结果分布 + 缺口维度 + 样例")
def observe(
    ctx: typer.Context,
    limit: Annotated[int, typer.Option("--limit", help="读取最近 N 条")] = 200,
    channel: Annotated[str, typer.Option("--channel", help="渠道过滤")] = "datachat",
) -> None:
    call_and_emit(ctx, "GET", "/api/v1/conversations/datachat/observe", params={"limit": limit, "channel": channel})
