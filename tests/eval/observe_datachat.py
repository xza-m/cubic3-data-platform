"""观察线上 DataChat 真实问数效果（Phase 8.3 上线后）。

容器内运行：docker exec <backend> python tests/eval/observe_datachat.py [N]
读最近 N 条 datachat AgentQueryLog，输出：
  ① 结果分布（success / out_of_coverage / out_of_scope / blocked / unanswerable / error）——闭环健康度；
  ② 最常被问但没建的维度（从 out_of_coverage 回答里抽「X」维度）——直接驱动建模补全优先级；
  ③ 各类问题样例——补 golden 集 / 发现 L1 漏判。
纯读，不改任何数据。
"""
from __future__ import annotations

import logging
import re
import sys
from collections import Counter

logging.disable(logging.CRITICAL)

from app import create_app  # noqa: E402


def main() -> int:
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 200
    app = create_app()
    with app.app_context():
        from app.extensions import db
        from app.domain.entities.agent_query_log import AgentQueryLog

        rows = (
            db.session.query(AgentQueryLog)
            .filter(AgentQueryLog.channel == "datachat")
            .order_by(AgentQueryLog.id.desc())
            .limit(n)
            .all()
        )
        if not rows:
            print("（暂无 datachat 问数记录）")
            return 0

        print(f"\n===== DataChat 线上观察（最近 {len(rows)} 条）=====")

        # ① 结果分布
        dist = Counter(r.status for r in rows)
        print("\n① 结果分布：")
        for st, c in dist.most_common():
            print(f"   {st:16s}: {c:4d}  ({c / len(rows) * 100:.0f}%)")

        # ② 最常被问但没建的维度（驱动建模优先级）
        # 从回答文本里抽"当前建模没有「X」维度"——对历史数据(status 笼统 unanswerable)也鲁棒。
        miss = Counter()
        for r in rows:
            for m in re.findall(r"当前建模没有「(.+?)」维度", r.agent_response or ""):
                miss[m] += 1
        if miss:
            print("\n② 最常被问但未建模的维度（建模补全优先级）：")
            for dim, c in miss.most_common(10):
                print(f"   「{dim}」 × {c}")
        else:
            print("\n② 暂无覆盖缺口记录（或 L1 未开/未命中）")

        # ③ 各类问题样例
        def _sample(status_set, label, k=8):
            qs = [r.user_message for r in rows if r.status in status_set][:k]
            if qs:
                print(f"\n③ {label}（样例 {len(qs)}）：")
                for q in qs:
                    print(f"   - {q[:50]}")

        _sample({"out_of_coverage"}, "覆盖缺口：用户想要但没建（→ 考虑补建模）")
        _sample({"out_of_scope"}, "库外：不在语义层（→ 确认是否该接入）")
        _sample({"blocked", "unanswerable"}, "答不出/未命中（→ 看是 L1 漏判还是真没口径，补 golden）")
        _sample({"success"}, "成功出数")
        print()
        return 0


if __name__ == "__main__":
    sys.exit(main())
