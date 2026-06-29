"""intent 命令：route / extract / answerability（L1 意图理解 + 路由 + 可回答性门控）。

- route <question>：语义路由（`semantic_router_preview_service.route`，命中实体/route_type/答否快照）。
- extract <question>：L1 结构化意图抽取（`semantic_intent_extraction_service.extract_intent`）。
  受 env 门 SEMANTIC_ROUTER_LLM_INTENT_ENABLED：关闭时返回 available=False（非错误）。
- answerability <question>：四态可回答性门控（answerable/need_clarify/out_of_coverage/out_of_scope），
  取自 route() 的 business_intent.answerability（L1 关时退化为未产出）。

可回答性/grounding 覆盖判定依赖 official active manifest 的已发布维度，故默认 --runtime-mode official。
"""
from __future__ import annotations

import click

from app.interfaces.cli.output import run

_RUNTIME_MODE = click.option(
    "--runtime-mode", default="official", show_default=True, type=click.Choice(["official", "preview"])
)


@click.group("intent")
def intent() -> None:
    """意图理解：路由 / 结构化抽取 / 可回答性门控。"""


@intent.command("route", help="自然语言问题 → 语义路由（命中实体 / route_type / 可回答性）")
@click.argument("question")
@_RUNTIME_MODE
@click.pass_obj
def intent_route(obj, question, runtime_mode) -> None:
    def body(container):
        from app.interfaces.cli.principal import principal_context_or_none

        return container.semantic_router_preview_service().route(
            question=question,
            principal_context=principal_context_or_none(obj.principal),
            runtime_mode=runtime_mode,
        )

    run(obj, body)


@intent.command("extract", help="L1 结构化意图抽取（env 门关时 available=False，非错误）")
@click.argument("question")
@click.pass_obj
def intent_extract(obj, question) -> None:
    def body(container):
        result = container.semantic_intent_extraction_service().extract_intent(
            question, principal_id=obj.principal
        )
        if result is None:
            return {
                "available": False,
                "note": "L1 未启用（env SEMANTIC_ROUTER_LLM_INTENT_ENABLED 关）或未抽出可用意图",
            }
        return {
            "available": True,
            "intent_type": getattr(result, "intent_type", None),
            "target_asset": getattr(result, "target_asset", None),
            "metrics": getattr(result, "metrics", None),
            "dimensions": getattr(result, "dimensions", None),
            "required_dimensions": getattr(result, "required_dimensions", None),
            "confidence": getattr(result, "confidence", None),
        }

    run(obj, body)


@intent.command("answerability", help="四态可回答性门控（取自 route 的 business_intent.answerability）")
@click.argument("question")
@_RUNTIME_MODE
@click.pass_obj
def intent_answerability(obj, question, runtime_mode) -> None:
    def body(container):
        from app.interfaces.cli.principal import principal_context_or_none

        route_result = container.semantic_router_preview_service().route(
            question=question,
            principal_context=principal_context_or_none(obj.principal),
            runtime_mode=runtime_mode,
        )
        business_intent = route_result.get("business_intent") or {}
        answerability = business_intent.get("answerability")
        if answerability is None:
            return {
                "state": None,
                "route_type": route_result.get("route_type"),
                "note": "未产出 answerability（需 L1 启用 + official active manifest）",
            }
        return {"route_type": route_result.get("route_type"), "answerability": answerability}

    run(obj, body)
