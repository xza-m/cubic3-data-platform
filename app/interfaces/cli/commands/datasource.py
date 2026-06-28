"""datasource 只读命令：list / show。

底层：container.list_datasources_handler() / get_datasource_handler()（DB 元数据，不触 adapter）。
items 是 DataSource 领域实体，需 .to_dict(mask_sensitive=True) 序列化（脱敏连接配置）。
"""
from __future__ import annotations

import click

from app.interfaces.cli.output import not_found, parse_optional_bool, run


@click.group("datasource")
def datasource() -> None:
    """数据源（只读）。"""


def _ser(entity):
    return entity.to_dict(mask_sensitive=True) if hasattr(entity, "to_dict") else entity


@datasource.command("list", help="列出数据源")
@click.option("--source-type", default=None, help="按类型筛选（maxcompute/clickhouse/postgresql/mysql）")
@click.option("--is-active", default=None, help="按启用状态筛选：true/false")
@click.option("--search", default=None, help="搜索关键词")
@click.option("--page", default=1, type=int, show_default=True)
@click.option("--page-size", default=20, type=int, show_default=True)
@click.pass_obj
def ds_list(obj, source_type, is_active, search, page, page_size) -> None:
    def body(container):
        from app.application.datasource.queries.list_datasources import ListDatasourcesQuery

        result = container.list_datasources_handler().handle(
            ListDatasourcesQuery(
                source_type=source_type,
                is_active=parse_optional_bool(is_active),
                search=search,
                page=page,
                page_size=page_size,
            )
        )
        result["items"] = [_ser(i) for i in result.get("items", [])]
        return result

    run(obj, body)


@datasource.command("show", help="查看单个数据源详情（连接配置脱敏）")
@click.argument("datasource_id", type=int)
@click.pass_obj
def ds_show(obj, datasource_id) -> None:
    def body(container):
        from app.application.datasource.queries.get_datasource import GetDatasourceQuery

        entity = container.get_datasource_handler().handle(GetDatasourceQuery(datasource_id=datasource_id))
        if entity is None:
            not_found(f"未找到数据源: {datasource_id}", obj.output)
        return _ser(entity)

    run(obj, body)
