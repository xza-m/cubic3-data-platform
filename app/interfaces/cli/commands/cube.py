"""cube 只读命令：list / show / describe。

口径：cube = 【定义(repo)】口径（YAML 全集，含 draft/deprecated，回答"建模里定义了什么"），
与 manifest（已发布/active）口径不同。
- list / show：纯读（list_cubes 只读仓库），零写。
- describe：详情（dims/measures 类型 + diagnostics），底层 describe_cube 会对 semantic_registry
  做一次幂等 upsert+commit（内部缓存对账，非语义变更）——故单列为 describe，show 保持零写。
"""
from __future__ import annotations

import click

from app.interfaces.cli.output import load_json_arg_or_fail, not_found, run, to_jsonable, write_run


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


# ---- P3 写域：建模草稿 / 落 YAML --------------------------------------------------

@cube.command("draft", help="从缓存列生成 cube 草稿 payload（绕 MaxCompute；只读，输出供 review/落库）")
@click.option("--source-id", required=True, type=int, help="数据源 id（cube 的 source 绑定）")
@click.option("--database", required=True, help="物理库名")
@click.option("--table", required=True, help="物理表名")
@click.option("--columns-from", required=True, help="读取缓存列的资产 table_id（data_asset_fields）")
@click.option("--schema", default=None, help="schema 名（可选）")
@click.option("--partitions", default=None, help="分区字段，逗号分隔（如 ds）")
@click.option("--name", default=None, help="cube 名（默认按表名）")
@click.option("--title", default=None, help="cube 标题")
@click.pass_obj
def cube_draft(obj, source_id, database, table, columns_from, schema, partitions, name, title) -> None:
    def body(container):
        fields = container.data_asset_service().list_fields(columns_from)
        if fields is None:
            not_found(f"未找到资产表: {columns_from}", obj.output)
        columns = [
            {
                "name": f.get("name") or f.get("column_name"),
                "type": f.get("type") or f.get("data_type"),
                "comment": f.get("comment") or f.get("description"),
            }
            for f in (fields.get("items") or [])
        ]
        parts = [p.strip() for p in (partitions or "").split(",") if p.strip()] or None
        return container.cube_modeling_service().build_cube_draft_payload(
            source_id=source_id,
            database=database,
            schema=schema,
            table=table,
            columns=columns,
            partitions=parts,
            name=name,
            title=title,
        )

    run(obj, body)


@cube.command("create", help="把 cube 草稿 payload 落为 YAML 定义（draft 态）")
@click.argument("draft")
@click.option("--dry-run", is_flag=True, help="只回显将创建的 payload，不落库")
@click.option("--yes", is_flag=True, help="确认写入")
@click.pass_obj
def cube_create(obj, draft, dry_run, yes) -> None:
    payload = load_json_arg_or_fail(draft, output=obj.output)

    def body(container):
        return to_jsonable(container.cube_modeling_service().create_cube(payload))

    write_run(obj, dry_run=dry_run, yes=yes, action=f"create cube '{payload.get('name')}'", preview=payload, fn=body)


@cube.command("update", help="更新已有 cube 定义（落 YAML，如 avg→sum 度量修正）")
@click.argument("name")
@click.argument("patch")
@click.option("--dry-run", is_flag=True, help="只回显将更新的 patch，不落库")
@click.option("--yes", is_flag=True, help="确认写入")
@click.pass_obj
def cube_update(obj, name, patch, dry_run, yes) -> None:
    payload = load_json_arg_or_fail(patch, output=obj.output)

    def body(container):
        return to_jsonable(container.cube_modeling_service().update_cube(name, payload))

    write_run(obj, dry_run=dry_run, yes=yes, action=f"update cube '{name}'", preview=payload, fn=body)
