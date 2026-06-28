"""asset 只读命令：list / show / fields / evidence。

底层：container.data_asset_service()（读 PG 的 data_asset_tables/fields/snapshots，
不触 adapter / MaxCompute live）。这是 agent 绕开 MaxCompute live 的事实底座。
list/show/fields 返回已是纯 dict；evidence 返回 EvidenceBundle（有 .to_dict()）。
按 id 的三个方法返回 None 表示 table 不存在 → not-found。
"""
from __future__ import annotations

import click

from app.interfaces.cli.output import not_found, run


@click.group("asset")
def asset() -> None:
    """数据资产物理表（只读，缓存优先）。"""


@asset.command("list", help="列出数据资产物理表（缓存态）")
@click.option("--keyword", "-k", default="", help="关键词")
@click.option("--source-id", default=None, type=int, help="数据源 id")
@click.option("--database", default=None, help="库名")
@click.option("--schema", default=None, help="schema 名")
@click.option("--sync-status", default=None, help="同步状态")
@click.option("--lifecycle-status", default=None, help="生命周期状态")
@click.option("--page", default=1, type=int, show_default=True)
@click.option("--page-size", default=20, type=int, show_default=True)
@click.pass_obj
def asset_list(obj, keyword, source_id, database, schema, sync_status, lifecycle_status, page, page_size) -> None:
    def body(container):
        return container.data_asset_service().list_tables(
            keyword=keyword or "",
            source_id=source_id,
            database=database,
            schema=schema,
            sync_status=sync_status,
            lifecycle_status=lifecycle_status,
            page=page,
            page_size=page_size,
        )

    run(obj, body)


@asset.command("show", help="查看资产表详情")
@click.argument("table_id")
@click.pass_obj
def asset_show(obj, table_id) -> None:
    def body(container):
        result = container.data_asset_service().get_table(table_id)
        if result is None:
            not_found(f"未找到资产表: {table_id}", obj.output)
        return result

    run(obj, body)


@asset.command("fields", help="列出资产表字段（缓存态）")
@click.argument("table_id")
@click.pass_obj
def asset_fields(obj, table_id) -> None:
    def body(container):
        result = container.data_asset_service().list_fields(table_id)
        if result is None:
            not_found(f"未找到资产表: {table_id}", obj.output)
        return result

    run(obj, body)


@asset.command("evidence", help="构建资产证据包（schema 快照 + profile + lineage 等）")
@click.argument("table_id")
@click.pass_obj
def asset_evidence(obj, table_id) -> None:
    def body(container):
        result = container.data_asset_service().build_table_evidence(table_id)
        if result is None:
            not_found(f"未找到资产表: {table_id}", obj.output)
        return result.to_dict() if hasattr(result, "to_dict") else result

    run(obj, body)
