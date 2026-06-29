"""intent 命令（http-client，T1 问数调试）：route / extract / answerability。

extract、answerability 是对 route 响应的客户端投影（与 semctl 同口径，含 official manifest grounding）。
"""
from __future__ import annotations

from typing import Annotated

import typer

from cubic3_dp_cli.envelope import call_and_emit, call_project_emit


app = typer.Typer(help="问数调试：语义路由 / 意图 / 可回答性（不出数）", no_args_is_help=True)

_ROUTE = "/api/v1/semantic-router/route"
_RuntimeMode = Annotated[str, typer.Option("--runtime-mode", help="official|preview（默认 official）")]


@app.command("route", help="语义路由：命中实体/route_type/answerability")
def route(ctx: typer.Context, question: Annotated[str, typer.Argument()], runtime_mode: _RuntimeMode = "official") -> None:
    call_and_emit(ctx, "POST", _ROUTE, json_body={"question": question, "runtime_mode": runtime_mode})


@app.command("extract", help="L1 意图理解产物（grounded，取自 route）")
def extract(ctx: typer.Context, question: Annotated[str, typer.Argument()], runtime_mode: _RuntimeMode = "official") -> None:
    def _project(data: dict) -> dict:
        bi = data.get("business_intent") or {}
        return {
            "route_type": data.get("route_type"),
            "intent_understanding": bi.get("intent_understanding"),
            "matched_entities": bi.get("matched_entities"),
            "answerability": bi.get("answerability"),
        }

    call_project_emit(ctx, "POST", _ROUTE, json_body={"question": question, "runtime_mode": runtime_mode}, project=_project)


@app.command("answerability", help="可回答性门控（answerable/out_of_coverage/...）")
def answerability(ctx: typer.Context, question: Annotated[str, typer.Argument()], runtime_mode: _RuntimeMode = "official") -> None:
    def _project(data: dict) -> dict:
        bi = data.get("business_intent") or {}
        return {"route_type": data.get("route_type"), "answerability": bi.get("answerability")}

    call_project_emit(ctx, "POST", _ROUTE, json_body={"question": question, "runtime_mode": runtime_mode}, project=_project)
