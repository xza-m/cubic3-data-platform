"""release 命令（http-client，T1 读）：发布读。

rollback 是 T3 消费级写（改 live manifest，@require_admin），留 in-process semctl。
"""
from __future__ import annotations

from typing import Annotated

import typer

from cubic3_dp_cli.client import encode_segment
from cubic3_dp_cli.envelope import call_and_emit, call_list_emit


app = typer.Typer(help="语义发布（只读；回滚走 semctl）", no_args_is_help=True)


@app.command("list", help="列出语义发布")
def list_releases(
    ctx: typer.Context,
    namespace: Annotated[str, typer.Option("--namespace")] = "default",
    status: Annotated[str | None, typer.Option("--status")] = None,
    limit: Annotated[int, typer.Option("--limit")] = 50,
    offset: Annotated[int, typer.Option("--offset")] = 0,
) -> None:
    call_list_emit(ctx, "GET", "/api/v1/semantic/releases", params={
        "namespace": namespace, "status": status, "limit": limit, "offset": offset,
    }, items_key="items")


@app.command("show", help="查看单个发布详情")
def show(ctx: typer.Context, release_id: Annotated[str, typer.Argument()]) -> None:
    call_and_emit(ctx, "GET", f"/api/v1/semantic/releases/{encode_segment(release_id)}")
