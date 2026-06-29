"""intent 命令：route / extract / answerability（L1 意图理解 + 路由 + 可回答性门控）。

- route <question>：语义路由（`semantic_router_preview_service.route`，命中实体/route_type/答否快照）。
- extract <question>：L1 意图理解产物（confidence/grounded/candidates），**取自 route()**——与真实
  问数管线同源（已注入 official active manifest 的候选词表做 grounding）。不裸调 extract_intent：
  裸调会丢 candidate_assets 白名单 → LLM 被迫"从空集选" → 槽位系统性返空，误导调试。
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


@intent.command("extract", help="L1 意图理解产物（grounded，取自 route，与真实管线同源）")
@click.argument("question")
@_RUNTIME_MODE
@click.pass_obj
def intent_extract(obj, question, runtime_mode) -> None:
    def body(container):
        from app.interfaces.cli.principal import principal_context_or_none

        route_result = container.semantic_router_preview_service().route(
            question=question,
            principal_context=principal_context_or_none(obj.principal),
            runtime_mode=runtime_mode,
        )
        business_intent = route_result.get("business_intent") or {}
        return {
            "route_type": route_result.get("route_type"),
            "intent_understanding": business_intent.get("intent_understanding"),
            "matched_entities": business_intent.get("matched_entities"),
            "answerability": business_intent.get("answerability"),
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
