"""view 只读命令：list / show。

底层：container.semantic_definition_service()。View 是语义层逻辑视图（可发布成 virtual dataset）。
list_views(public_only) 返回 List[ViewDefinition]（pydantic）；describe_view(name) 返回 dict。
发布/校验（view publish/validate）涉及写或需构造 ViewDefinition，留后续增量。
"""
from __future__ import annotations

import click

from app.interfaces.cli.output import not_found, run, to_jsonable


@click.group("view")
def view() -> None:
    """语义 View 定义（只读）。"""


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


@view.command("show", help="查看 View 详情")
@click.argument("name")
@click.option("--include-private", is_flag=True, help="含非公开字段")
@click.pass_obj
def view_show(obj, name, include_private) -> None:
    def body(container):
        result = _svc(container).describe_view(name, include_private=include_private)
        if result is None or (isinstance(result, dict) and result.get("error")):
            not_found(f"未找到 View: {name}", obj.output)
        return result

    run(obj, body)
