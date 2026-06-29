"""asset 命令（http-client，T1 读）：数据资产物理表（读 PG 缓存，绕 MaxCompute）。"""
from __future__ import annotations

from typing import Annotated

import typer

from cubic3_dp_cli.client import encode_segment
from cubic3_dp_cli.envelope import call_and_emit


app = typer.Typer(help="数据资产物理表（只读）", no_args_is_help=True)


@app.command("list", help="列出数据资产物理表（缓存态）")
def list_assets(
    ctx: typer.Context,
    keyword: Annotated[str | None, typer.Option("--keyword", "-k")] = None,
    source_id: Annotated[str | None, typer.Option("--source-id")] = None,
    database: Annotated[str | None, typer.Option("--database")] = None,
    schema: Annotated[str | None, typer.Option("--schema")] = None,
    page: Annotated[int, typer.Option("--page")] = 1,
    page_size: Annotated[int, typer.Option("--page-size")] = 20,
) -> None:
    call_and_emit(ctx, "GET", "/api/v1/semantic/assets/tables", params={
        "keyword": keyword, "source_id": source_id, "database": database, "schema": schema,
        "page": page, "page_size": page_size,
    })


@app.command("show", help="查看资产表详情")
def show(ctx: typer.Context, table_id: Annotated[str, typer.Argument()]) -> None:
    call_and_emit(ctx, "GET", f"/api/v1/semantic/assets/tables/{encode_segment(table_id)}")


@app.command("fields", help="列出资产表字段（缓存态）")
def fields(ctx: typer.Context, table_id: Annotated[str, typer.Argument()]) -> None:
    call_and_emit(ctx, "GET", f"/api/v1/semantic/assets/tables/{encode_segment(table_id)}/fields")


@app.command("evidence", help="构建资产证据包")
def evidence(ctx: typer.Context, table_id: Annotated[str, typer.Argument()]) -> None:
    call_and_emit(ctx, "GET", f"/api/v1/semantic/assets/tables/{encode_segment(table_id)}/evidence")
