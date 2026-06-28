"""cube 只读命令：list / show / describe。

口径：cube = 【定义(repo)】口径（YAML 全集，含 draft/deprecated，回答"建模里定义了什么"），
与 manifest（已发布/active）口径不同。
- list / show：纯读（list_cubes 只读仓库），零写。
- describe：详情（dims/measures 类型 + diagnostics），底层 describe_cube 会对 semantic_registry
  做一次幂等 upsert+commit（内部缓存对账，非语义变更）——故单列为 describe，show 保持零写。
"""
from __future__ import annotations

import click

from app.interfaces.cli.output import not_found, run


@click.group("cube")
def cube() -> None:
    """语义 Cube 定义（只读）。"""


def _svc(container):
    return container.semantic_definition_service()


@cube.command("list", help="列出已定义 Cube（含 draft，定义口径）")
@click.option("--status", default=None, help="按状态筛选（如 active/draft）")
@click.pass_obj
def cube_list(obj, status) -> None:
    def body(container):
        cubes = _svc(container).list_cubes()
        if status:
            cubes = [c for c in cubes if c.get("status") == status]
        return {"items": cubes, "total": len(cubes)}

    run(obj, body)


@cube.command("show", help="查看 Cube 摘要（零写：取自 list_cubes）")
@click.argument("name")
@click.pass_obj
def cube_show(obj, name) -> None:
    def body(container):
        for c in _svc(container).list_cubes():
            if c.get("name") == name:
                return c
        not_found(f"未找到 Cube: {name}", obj.output)

    run(obj, body)


@cube.command("describe", help="查看 Cube 详情（dims/measures 类型 + diagnostics；会同步 registry）")
@click.argument("name")
@click.pass_obj
def cube_describe(obj, name) -> None:
    def body(container):
        result = _svc(container).describe_cube(name)
        if isinstance(result, dict) and result.get("error"):
            not_found(result["error"], obj.output)
        return result

    run(obj, body)
