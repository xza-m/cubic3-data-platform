"""datasource 命令（http-client，T1 读）：与 semctl datasource 同词汇。"""
from __future__ import annotations

from typing import Annotated

import typer

from cubic3_dp_cli.envelope import call_and_emit, call_list_emit


app = typer.Typer(help="数据源（只读）", no_args_is_help=True)


@app.command("list", help="列出数据源")
def list_datasources(
    ctx: typer.Context,
    source_type: Annotated[str | None, typer.Option("--source-type")] = None,
    is_active: Annotated[str | None, typer.Option("--is-active", help="true/false")] = None,
    search: Annotated[str | None, typer.Option("--search")] = None,
    page: Annotated[int, typer.Option("--page")] = 1,
    page_size: Annotated[int, typer.Option("--page-size")] = 20,
) -> None:
    call_list_emit(ctx, "GET", "/api/v1/data-center/datasources", params={
        "source_type": source_type, "is_active": is_active, "search": search, "page": page, "page_size": page_size,
    }, items_key="items")  # data-center 蓝图走平台 success() 约定，键为 items


@app.command("show", help="查看单个数据源（脱敏）")
def show(ctx: typer.Context, datasource_id: Annotated[int, typer.Argument()]) -> None:
    call_and_emit(ctx, "GET", f"/api/v1/data-center/datasources/{datasource_id}")
