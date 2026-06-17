from __future__ import annotations

from typing import Annotated, Any

import typer

from cubic3_dp_cli.client import encode_segment
from cubic3_dp_cli.runtime import emit_result, load_json_payload, require_yes, runtime


app = typer.Typer(help="语义中心命令", no_args_is_help=True)
assets_app = typer.Typer(help="数据资产底座命令", no_args_is_help=True)
app.add_typer(assets_app, name="assets")


@app.command("health", help="检查语义 Runtime 健康状态")
def health(ctx: typer.Context) -> None:
    emit_result(ctx, runtime(ctx).client.get("/api/v1/semantic/health"))


@app.command("plan", help="生成 Agent-first 语义规划")
def plan(
    ctx: typer.Context,
    question: Annotated[str, typer.Argument(help="自然语言问题")],
) -> None:
    emit_result(
        ctx,
        runtime(ctx).client.post("/api/v1/agent/semantic/plan", json_body={"question": question}),
    )


@app.command("execute", help="提交受治理的 Agent-first 查询")
def execute(
    ctx: typer.Context,
    question: Annotated[str, typer.Argument(help="自然语言问题")],
    idempotency_key: Annotated[str | None, typer.Option("--idempotency-key", help="幂等键")] = None,
    yes: Annotated[bool, typer.Option("--yes", help="确认提交真实执行请求")] = False,
) -> None:
    require_yes(yes, "semantic execute 会提交受治理查询到 gateway")
    body: dict[str, Any] = {"question": question}
    if idempotency_key:
        body["idempotency_key"] = idempotency_key
    emit_result(ctx, runtime(ctx).client.post("/api/v1/agent/semantic/execute", json_body=body))


@assets_app.command("radar", help="查看数据资产雷达摘要")
def assets_radar(ctx: typer.Context) -> None:
    emit_result(ctx, runtime(ctx).client.get("/api/v1/semantic/assets/radar"))


@assets_app.command("list", help="列出数据资产物理表")
def assets_list(
    ctx: typer.Context,
    keyword: Annotated[str | None, typer.Option("--keyword", help="搜索关键词")] = None,
    source_id: Annotated[str | None, typer.Option("--source-id", help="来源数据源 ID 或外部来源标识")] = None,
    database: Annotated[str | None, typer.Option("--database", help="物理库 / 项目名")] = None,
    schema: Annotated[str | None, typer.Option("--schema", help="物理 schema")] = None,
    sync_status: Annotated[str | None, typer.Option("--sync-status", help="同步状态")] = None,
    lifecycle_status: Annotated[str | None, typer.Option("--lifecycle-status", help="生命周期状态")] = None,
    page: Annotated[int, typer.Option("--page", min=1, help="页码")] = 1,
    page_size: Annotated[int, typer.Option("--page-size", min=1, help="每页数量")] = 20,
) -> None:
    emit_result(
        ctx,
        runtime(ctx).client.get(
            "/api/v1/semantic/assets/tables",
            params={
                "keyword": keyword,
                "source_id": source_id,
                "database": database,
                "schema": schema,
                "sync_status": sync_status,
                "lifecycle_status": lifecycle_status,
                "page": page,
                "page_size": page_size,
            },
        ),
    )


@assets_app.command("fields", help="列出物理表字段")
def assets_fields(
    ctx: typer.Context,
    table_id: Annotated[str, typer.Argument(help="数据资产表 ID")],
) -> None:
    emit_result(
        ctx,
        runtime(ctx).client.get(f"/api/v1/semantic/assets/tables/{encode_segment(table_id)}/fields"),
    )


@assets_app.command("evidence", help="获取物理表建模证据包")
def assets_evidence(
    ctx: typer.Context,
    table_id: Annotated[str, typer.Argument(help="数据资产表 ID")],
) -> None:
    emit_result(
        ctx,
        runtime(ctx).client.get(f"/api/v1/semantic/assets/tables/{encode_segment(table_id)}/evidence"),
    )


@assets_app.command("sync-runs", help="列出元数据同步批次")
def assets_sync_runs(
    ctx: typer.Context,
    limit: Annotated[int, typer.Option("--limit", min=1, help="返回批次数量")] = 50,
) -> None:
    emit_result(
        ctx,
        runtime(ctx).client.get("/api/v1/semantic/assets/sync-runs", params={"limit": limit}),
    )


@assets_app.command("sync", help="从 JSON payload 创建元数据同步批次")
def assets_sync(
    ctx: typer.Context,
    payload: Annotated[str, typer.Argument(help="JSON 文件路径，或 '-' 表示从 stdin 读取")],
    yes: Annotated[bool, typer.Option("--yes", help="确认写入数据资产底座")] = False,
) -> None:
    require_yes(yes, "semantic assets sync 会写入数据资产底座")
    emit_result(
        ctx,
        runtime(ctx).client.post("/api/v1/semantic/assets/sync-runs", json_body=load_json_payload(payload)),
    )
