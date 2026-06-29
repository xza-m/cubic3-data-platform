"""chat 命令：observe（观察 DataChat 真实问数效果，纯读 AgentQueryLog）。

把 tests/eval/observe_datachat.py 的核心逻辑结构化为命令（不 print，返回 JSON）：
① 结果分布（status Counter）——闭环健康度；
② 最常被问但未建模的维度（从回答正则抽「X」维度）——驱动建模补全优先级；
③ 各类问题样例。
纯读历史落库日志，不需要 principal/runtime。AgentQueryLog 无 repository/DI provider，直查 db.session。
"""
from __future__ import annotations

import re
from collections import Counter

import click

from app.interfaces.cli.output import run

_MISSING_DIM = re.compile(r"当前建模没有「(.+?)」维度")


@click.group("chat")
def chat() -> None:
    """DataChat 观测（只读）。"""


@chat.command("observe", help="观察最近 N 条 DataChat 问数：结果分布 + 缺口维度 + 样例")
@click.option("--limit", default=200, type=int, show_default=True, help="读取最近 N 条")
@click.option("--channel", default="datachat", show_default=True, help="渠道过滤")
@click.pass_obj
def chat_observe(obj, limit, channel) -> None:
    def body(_container):
        from app.domain.entities.agent_query_log import AgentQueryLog
        from app.extensions import db

        rows = (
            db.session.query(AgentQueryLog)
            .filter(AgentQueryLog.channel == channel)
            .order_by(AgentQueryLog.id.desc())
            .limit(limit)
            .all()
        )
        if not rows:
            return {"total": 0, "status_distribution": {}, "missing_dimensions": [], "samples": {}}

        status_dist = Counter(r.status for r in rows)
        missing = Counter()
        for r in rows:
            for dim in _MISSING_DIM.findall(r.agent_response or ""):
                missing[dim] += 1

        def _samples(states, k=8):
            return [r.user_message[:80] for r in rows if r.status in states][:k]

        return {
            "total": len(rows),
            "channel": channel,
            "status_distribution": dict(status_dist.most_common()),
            "missing_dimensions": [{"dimension": d, "count": c} for d, c in missing.most_common(10)],
            "samples": {
                "out_of_coverage": _samples({"out_of_coverage"}),
                "out_of_scope": _samples({"out_of_scope"}),
                "blocked_unanswerable": _samples({"blocked", "unanswerable"}),
                "success": _samples({"success"}),
            },
        }

    run(obj, body)
