from __future__ import annotations

from typing import Annotated

import typer

from cubic3_dp_cli.runtime import emit_result, runtime


app = typer.Typer(help="数据源命令", no_args_is_help=True)


@app.command("list", help="列出数据源")
def list_datasources(
    ctx: typer.Context,
    source_type: Annotated[str | None, typer.Option("--source-type", help="按数据源类型筛选")] = None,
    active: Annotated[str | None, typer.Option("--active", help="按启用状态筛选：true/false")] = None,
    search: Annotated[str | None, typer.Option("--search", help="搜索关键词")] = None,
    page: Annotated[int, typer.Option("--page", min=1, help="页码")] = 1,
    page_size: Annotated[int, typer.Option("--page-size", min=1, help="每页数量")] = 20,
) -> None:
    client = runtime(ctx).client
    emit_result(
        ctx,
        client.get(
            "/api/v1/data-center/datasources",
            params={
                "source_type": source_type,
                "is_active": active,
                "search": search,
                "page": page,
                "page_size": page_size,
            },
        ),
    )
