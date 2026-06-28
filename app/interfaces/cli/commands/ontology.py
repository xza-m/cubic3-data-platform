"""ontology 只读命令：<kind> list / show，覆盖 7 类本体读域。

底层：container.ontology_definition_service()（pydantic 实体经 model_dump 输出，已是纯 dict）。
主键差异：glossary 主键是 canonical_name，其余（object/property/metric/relation/action/policy）是 name。
list_* 返回 {items, total}；get_* 命中返回 dict、未命中返回 None → not-found。
"""
from __future__ import annotations

import click

from app.interfaces.cli.output import not_found, run

# kind -> (list_method, get_method, 主键展示名)
_KINDS = {
    "object": ("list_objects", "get_object", "name"),
    "property": ("list_properties", "get_property", "name"),
    "metric": ("list_metrics", "get_metric", "name"),
    "glossary": ("list_glossary", "get_glossary", "canonical_name"),
    "relation": ("list_relations", "get_relation", "name"),
    "action": ("list_actions", "get_action", "name"),
    "policy": ("list_policies", "get_policy", "name"),
}


@click.group("ontology")
def ontology() -> None:
    """本体资产（object/property/metric/glossary/relation/action/policy，只读）。"""


def _make_kind_group(kind: str, list_method: str, get_method: str, key_name: str) -> click.Group:
    group = click.Group(kind, help=f"{kind} 本体（只读）")

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

    return group


for _kind, (_lm, _gm, _key) in _KINDS.items():
    ontology.add_command(_make_kind_group(_kind, _lm, _gm, _key))
