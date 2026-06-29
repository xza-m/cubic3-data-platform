"""ontology 只读命令：<kind> list / show，覆盖 7 类本体读域。

底层：container.ontology_definition_service()（pydantic 实体经 model_dump 输出，已是纯 dict）。
主键差异：glossary 主键是 canonical_name，其余（object/property/metric/relation/action/policy）是 name。
list_* 返回 {items, total}；get_* 命中返回 dict、未命中返回 None → not-found。
"""
from __future__ import annotations

import click

from app.interfaces.cli.output import load_json_arg_or_fail, not_found, run, to_jsonable, write_run

# kind -> (list_method, get_method, 主键展示名, save_method, entity_type)
# entity_type 是 publish_entity/entity_status 用的复数形态（_entity_repo_and_dump 映射，glossary 例外）
_KINDS = {
    "object": ("list_objects", "get_object", "name", "save_object", "objects"),
    "property": ("list_properties", "get_property", "name", "save_property", "properties"),
    "metric": ("list_metrics", "get_metric", "name", "save_metric", "metrics"),
    "glossary": ("list_glossary", "get_glossary", "canonical_name", "save_glossary", "glossary"),
    "relation": ("list_relations", "get_relation", "name", "save_relation", "relations"),
    "action": ("list_actions", "get_action", "name", "save_action", "actions"),
    "policy": ("list_policies", "get_policy", "name", "save_policy", "policies"),
}


@click.group("ontology")
def ontology() -> None:
    """本体资产（object/property/metric/glossary/relation/action/policy）。"""


def _make_kind_group(kind: str, list_method: str, get_method: str, key_name: str, save_method: str, entity_type: str) -> click.Group:
    group = click.Group(kind, help=f"{kind} 本体（list/show 只读；upsert/publish 写）")

    @group.command("list", help=f"列出 {kind}")
    @click.pass_obj
    def _list(obj) -> None:
        def body(container):
            return getattr(container.ontology_definition_service(), list_method)()

        run(obj, body)

    @group.command("show", help=f"查看单个 {kind}（主键：{key_name}）")
    @click.argument(key_name)
    @click.pass_obj
    def _show(obj, **kwargs) -> None:
        key_value = kwargs[key_name]

        def body(container):
            result = getattr(container.ontology_definition_service(), get_method)(key_value)
            if result is None:
                not_found(f"未找到 {kind}: {key_value}", obj.output)
            return result

        run(obj, body)

    @group.command("upsert", help=f"新建/覆盖 {kind}（⚠ 全量覆盖无 PATCH，先 show 取现有再改）")
    @click.argument("payload")
    @click.option("--dry-run", is_flag=True)
    @click.option("--yes", is_flag=True)
    @click.pass_obj
    def _upsert(obj, payload, dry_run, yes) -> None:
        data = load_json_arg_or_fail(payload, output=obj.output)

        def body(container):
            return to_jsonable(getattr(container.ontology_definition_service(), save_method)(data))

        write_run(obj, dry_run=dry_run, yes=yes, action=f"upsert {kind}（全量覆盖）", preview=data, fn=body)

    @group.command("publish", help=f"发布 {kind}（draft→active，门控：归属对象须 active 等）")
    @click.argument(key_name)
    @click.option("--dry-run", is_flag=True)
    @click.option("--yes", is_flag=True)
    @click.pass_obj
    def _publish(obj, dry_run, yes, **kwargs) -> None:
        key_value = kwargs[key_name]

        def body(container):
            return to_jsonable(container.ontology_definition_service().publish_entity(entity_type, key_value))

        write_run(
            obj, dry_run=dry_run, yes=yes, action=f"publish {kind} '{key_value}'",
            preview={"entity_type": entity_type, "entity_name": key_value}, fn=body,
        )

    @group.command("status", help=f"查 {kind} 状态（draft/active/...，只读）")
    @click.argument(key_name)
    @click.pass_obj
    def _status(obj, **kwargs) -> None:
        key_value = kwargs[key_name]

        def body(container):
            status = container.ontology_definition_service().entity_status(entity_type, key_value)
            if status is None:
                not_found(f"未找到 {kind}: {key_value}", obj.output)
            return {"entity_type": kind, "entity_name": key_value, "status": status}

        run(obj, body)

    return group


for _kind, (_lm, _gm, _key, _sm, _et) in _KINDS.items():
    ontology.add_command(_make_kind_group(_kind, _lm, _gm, _key, _sm, _et))
