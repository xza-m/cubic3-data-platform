"""DataChat 问数观测读逻辑（单一真源，供 semctl chat observe 与 HTTP 端点共用）。

读 AgentQueryLog（无 repository/DI provider，直查传入的 SQLAlchemy session）：
① 结果分布（status Counter）；② 最常被问但未建模的维度（回答正则抽「X」维度）；③ 各类样例。
纯读历史落库日志，不改任何状态，不需要 principal/runtime。
"""
from __future__ import annotations

import re
from collections import Counter
from typing import Any, Dict

_MISSING_DIM = re.compile(r"当前建模没有「(.+?)」维度")


def observe_datachat(session, *, limit: int = 200, channel: str = "datachat") -> Dict[str, Any]:
    from app.domain.entities.agent_query_log import AgentQueryLog

    rows = (
        session.query(AgentQueryLog)
        .filter(AgentQueryLog.channel == channel)
        .order_by(AgentQueryLog.id.desc())
        .limit(limit)
        .all()
    )
    if not rows:
        return {"total": 0, "channel": channel, "status_distribution": {}, "missing_dimensions": [], "samples": {}}

    status_dist = Counter(r.status for r in rows)
    missing: Counter = Counter()
    for row in rows:
        for dim in _MISSING_DIM.findall(row.agent_response or ""):
            missing[dim] += 1

    def _samples(states: set, k: int = 8) -> list:
        return [row.user_message[:80] for row in rows if row.status in states][:k]

    return {
        "total": len(rows),
        "channel": channel,
        "status_distribution": dict(status_dist.most_common()),
        "missing_dimensions": [{"dimension": dim, "count": count} for dim, count in missing.most_common(10)],
        "samples": {
            "out_of_coverage": _samples({"out_of_coverage"}),
            "out_of_scope": _samples({"out_of_scope"}),
            "blocked_unanswerable": _samples({"blocked", "unanswerable"}),
            "success": _samples({"success"}),
        },
    }
