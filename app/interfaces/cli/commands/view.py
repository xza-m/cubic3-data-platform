"""view 命令：list / show（零写）/ describe（含 diagnostics，会同步 registry）。

list/show 走 list_views（零写）；describe 走 describe_view —— 注意它会 _sync_view_registry
（definition_hash/last_loaded_at 的 upsert+commit，幂等元数据对账、非语义变更），故单列、不标"只读"。
与 cube show（零写）/ describe（同步 registry）的拆分同构。
"""
from __future__ import annotations

import click

from app.interfaces.cli.output import not_found, run, to_jsonable


@click.group("view")
def view() -> None:
    """语义 View 定义（list/show 零写；describe 会同步 registry）。"""


def _svc(container):
    return container.semantic_definition_service()


@view.command("list", help="列出 View 定义")
@click.option("--include-private", is_flag=True, help="含非公开 View")
@click.pass_obj
def view_list(obj, include_private) -> None:
    def body(container):
        views = _svc(container).list_views(public_only=not include_private)
        items = [to_jsonable(v) for v in (views or [])]
        return {"items": items, "total": len(items)}

    run(obj, body)


@view.command("show", help="查看 View 摘要（零写：取自 list_views）")
@click.argument("name")
@click.option("--include-private", is_flag=True, help="含非公开 View")
@click.pass_obj
def view_show(obj, name, include_private) -> None:
    def body(container):
        for v in (_svc(container).list_views(public_only=not include_private) or []):
            if getattr(v, "name", None) == name:
                return to_jsonable(v)
        not_found(f"未找到 View: {name}", obj.output)

    run(obj, body)


@view.command("describe", help="查看 View 详情（diagnostics/publish_summary；会同步 registry）")
@click.argument("name")
@click.option("--include-private", is_flag=True, help="含非公开字段")
@click.pass_obj
def view_describe(obj, name, include_private) -> None:
    def body(container):
        result = _svc(container).describe_view(name, include_private=include_private)
        if result is None:
            not_found(f"未找到 View: {name}", obj.output)
        if isinstance(result, dict) and result.get("error"):
            not_found(str(result["error"]), obj.output)  # 透传服务端原因（如"未公开暴露"，提示加 --include-private）
        return result

    run(obj, body)
