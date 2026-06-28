"""L1 意图理解 + 可回答性门控 的真实 LLM 离线 eval（Phase 8.3 上线门）。

容器内运行：docker exec <backend> python tests/eval/run_intent_eval.py
前置：.env 配真实 LLM（DeepSeek）；active manifest 有已发布答题 cube。
本脚本临时把 L1 置 enabled（不改 env、不持久化），跑 golden 集，按类报准确率 + 误判，
作为是否置 SEMANTIC_ROUTER_LLM_INTENT_ENABLED=true 的判据。LLM 非确定，建议跑 2-3 次看稳定性。
"""
from __future__ import annotations

import json
import logging
import os
import sys

logging.disable(logging.CRITICAL)

from app import create_app  # noqa: E402
from app.application.semantic_router.intent_understanding import IntentUnderstandingService  # noqa: E402


def _judge(case: dict, state: str | None, route_type: str | None, missing: list) -> tuple[bool, str]:
    cat = case["cat"]
    got = f"state={state} route={route_type}" + (f" miss={missing}" if missing else "")
    if cat == "answerable":
        return state == "answerable", got
    if cat == "coverage_gap":
        ok = state == "out_of_coverage"
        # bonus：缺口维度是否点到（包含期望词即可，宽松）
        if ok and case.get("expect_missing"):
            ok = any(case["expect_missing"] in str(m) or str(m) in case["expect_missing"] for m in (missing or []))
        return ok, got
    if cat == "out_of_scope":
        # 诚实弃答：判 out_of_scope，或没路由到 cube（blocked）——都算正确，不能 answerable 出数
        return state == "out_of_scope" or route_type == "blocked", got
    if cat == "knowledge":
        return route_type == "knowledge", got
    return False, got


def main() -> int:
    here = os.path.dirname(os.path.abspath(__file__))
    golden = json.load(open(os.path.join(here, "intent_answerability_golden.json"), encoding="utf-8"))["cases"]

    app = create_app()
    with app.app_context():
        c = app.container
        router = c.semantic_router_preview_service()
        router._intent_extraction_service = IntentUnderstandingService(
            c.agent_inference_runtime_service(), enabled=True
        )

        by_cat: dict[str, list[int]] = {}
        misses: list[str] = []
        for case in golden:
            try:
                r = router.route(question=case["q"], runtime_mode="official")
                bi = r.get("business_intent", {}) or {}
                ans = bi.get("answerability") or {}
                state, rt, missing = ans.get("state"), bi.get("route_type"), ans.get("missing_dimensions") or []
            except Exception as exc:  # noqa: BLE001
                state, rt, missing = f"ERR:{type(exc).__name__}", None, []
            ok, got = _judge(case, state, rt, missing)
            by_cat.setdefault(case["cat"], [0, 0])
            by_cat[case["cat"]][1] += 1
            if ok:
                by_cat[case["cat"]][0] += 1
            else:
                misses.append(f"  [{case['cat']}] 「{case['q']}」 期望 {case.get('expect_state') or case.get('expect_intent_type')} 实得 {got}")

        print("\n===== L1 意图理解 + 可回答性门控 eval =====")
        total_ok = total = 0
        for cat, (ok, n) in sorted(by_cat.items()):
            total_ok += ok
            total += n
            print(f"  {cat:13s}: {ok}/{n}  ({ok / n * 100:.0f}%)")
        print(f"  {'OVERALL':13s}: {total_ok}/{total}  ({total_ok / total * 100:.0f}%)")
        if misses:
            print("\n--- 误判明细 ---")
            print("\n".join(misses))
        print()
        return 0


if __name__ == "__main__":
    sys.exit(main())
