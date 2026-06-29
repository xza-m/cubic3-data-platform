"""chat 命令：observe（观察 DataChat 真实问数效果，纯读 AgentQueryLog）。

聚合逻辑下沉到 app/application/conversation/datachat_observe.py（单一真源，与 HTTP 端点共用）：
① 结果分布；② 最常被问但未建模的维度；③ 各类样例。纯读历史落库日志，不需要 principal/runtime。
"""
from __future__ import annotations

import click

from app.interfaces.cli.output import run


@click.group("chat")
def chat() -> None:
    """DataChat 观测（只读）。"""


@chat.command("observe", help="观察最近 N 条 DataChat 问数：结果分布 + 缺口维度 + 样例")
@click.option("--limit", default=200, type=int, show_default=True, help="读取最近 N 条")
@click.option("--channel", default="datachat", show_default=True, help="渠道过滤")
@click.pass_obj
def chat_observe(obj, limit, channel) -> None:
    def body(_container):
        from app.application.conversation.datachat_observe import observe_datachat
        from app.extensions import db

        return observe_datachat(db.session, limit=limit, channel=channel)

    run(obj, body)
