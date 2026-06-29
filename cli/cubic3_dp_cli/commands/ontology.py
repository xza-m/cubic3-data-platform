"""ontology 命令（http-client，T1 读）：<kind> list/show/status。

写域（upsert/publish）不在 http，留 semctl（无门控写共享本体定义有风险）。
status 投影 show 响应的 .status（零新端点）。
"""
from __future__ import annotations

from typing import Annotated

import typer

from cubic3_dp_cli.client import encode_segment
from cubic3_dp_cli.envelope import call_and_emit, call_list_emit, call_project_emit, emit_local_only


app = typer.Typer(help="本体资产（只读；写走 semctl）", no_args_is_help=True)

# kind -> (HTTP 复数路径, 主键展示名)
_KINDS = {
    "object": ("objects", "name"),
    "property": ("properties", "name"),
    "metric": ("metrics", "name"),
    "glossary": ("glossary", "canonical_name"),
    "relation": ("relations", "name"),
    "action": ("actions", "name"),
    "policy": ("policies", "name"),
}


def _make_kind(kind: str, plural: str, key_label: str) -> typer.Typer:
    sub = typer.Typer(help=f"{kind} 本体（只读）", no_args_is_help=True)

    @sub.command("list", help=f"列出 {kind}")
    def _list(ctx: typer.Context) -> None:
        # 后端 ontology list 直接返回裸 list（success(data=[...])），_extract_list 短路归一，无需 items_key
        call_list_emit(ctx, "GET", f"/api/v1/ontology/{plural}")

    @sub.command("show", help=f"查看单个 {kind}（主键：{key_label}）")
    def _show(ctx: typer.Context, key: Annotated[str, typer.Argument(help="主键 name（glossary 为 canonical_name）")]) -> None:
        call_and_emit(ctx, "GET", f"/api/v1/ontology/{plural}/{encode_segment(key)}")

    @sub.command("status", help=f"查 {kind} 状态（draft/active；投影 show.status）")
    def _status(ctx: typer.Context, key: Annotated[str, typer.Argument(help="主键 name（glossary 为 canonical_name）")]) -> None:
        call_project_emit(
            ctx, "GET", f"/api/v1/ontology/{plural}/{encode_segment(key)}",
            project=lambda d: {"entity_type": kind, "name": key, "status": (d or {}).get("status")},
        )

    @sub.command("upsert", help=f"[local-only] 写 {kind}（走 semctl）")
    def _upsert(ctx: typer.Context) -> None:
        emit_local_only(ctx, f"ontology {kind} upsert")

    @sub.command("publish", help=f"[local-only] 发布 {kind} draft→active（走 semctl）")
    def _publish(ctx: typer.Context) -> None:
        emit_local_only(ctx, f"ontology {kind} publish")

    return sub


for _kind, (_plural, _key) in _KINDS.items():
    app.add_typer(_make_kind(_kind, _plural, _key), name=_kind)
