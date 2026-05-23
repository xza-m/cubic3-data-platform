from __future__ import annotations

import os
import sys
from urllib.parse import quote

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

from _common import api_request, attach_api_logger, create_context, dump_debug


REQUIRED_SUMMARY_FIELDS = {
    "issue_count",
    "error_count",
    "warn_count",
    "status",
    "by_code",
    "by_source",
}

REQUIRED_ISSUE_FIELDS = {
    "id",
    "code",
    "source",
    "severity",
    "object_type",
    "object_name",
    "resource_ref",
    "message",
    "metadata",
}


def _select_cube_name(page) -> str:
    payload = api_request(page, "/api/v1/semantic/cubes?page_size=200")
    cubes = payload.get("data", {}).get("cubes") or []
    active_cubes = [item for item in cubes if item.get("name") and item.get("status") == "active"]
    candidates = active_cubes or [item for item in cubes if item.get("name")]
    if not candidates:
        raise AssertionError("当前环境没有可用于治理问题 smoke 的 Cube")
    return str(candidates[0]["name"])


def _assert_governance_payload(payload: dict, *, endpoint: str) -> int:
    data = payload.get("data")
    if not isinstance(data, dict):
        raise AssertionError(f"{endpoint} 响应缺少 data 对象: {payload}")

    summary = data.get("summary")
    if not isinstance(summary, dict):
        raise AssertionError(f"{endpoint} 响应缺少 summary 对象: {payload}")

    missing_summary_fields = REQUIRED_SUMMARY_FIELDS - set(summary.keys())
    if missing_summary_fields:
        raise AssertionError(f"{endpoint} summary 字段缺失: {sorted(missing_summary_fields)}")

    if summary["status"] not in {"ok", "warn", "error"}:
        raise AssertionError(f"{endpoint} summary.status 非法: {summary['status']}")

    for field in ("issue_count", "error_count", "warn_count"):
        if not isinstance(summary[field], int):
            raise AssertionError(f"{endpoint} summary.{field} 应为 int: {summary[field]}")

    for field in ("by_code", "by_source"):
        if not isinstance(summary[field], dict):
            raise AssertionError(f"{endpoint} summary.{field} 应为对象: {summary[field]}")

    items = data.get("items")
    if not isinstance(items, list):
        raise AssertionError(f"{endpoint} 响应缺少 items 数组: {payload}")
    if summary["issue_count"] != len(items):
        raise AssertionError(f"{endpoint} issue_count 与 items 数量不一致: {summary['issue_count']} != {len(items)}")

    for index, item in enumerate(items):
        if not isinstance(item, dict):
            raise AssertionError(f"{endpoint} items[{index}] 应为对象: {item}")
        missing_issue_fields = REQUIRED_ISSUE_FIELDS - set(item.keys())
        if missing_issue_fields:
            raise AssertionError(f"{endpoint} items[{index}] 字段缺失: {sorted(missing_issue_fields)}")
        if item["severity"] not in {"info", "warn", "error"}:
            raise AssertionError(f"{endpoint} items[{index}].severity 非法: {item['severity']}")

    return int(summary["issue_count"])


def main() -> int:
    playwright, browser, context = create_context()
    page = context.new_page()
    api_events = attach_api_logger(page)

    try:
        cube_name = _select_cube_name(page)
        scoped_endpoint = f"/api/v1/semantic/governance/issues?cube_name={quote(cube_name)}"
        scoped_payload = api_request(page, scoped_endpoint)
        scoped_issue_count = _assert_governance_payload(scoped_payload, endpoint=scoped_endpoint)

        all_endpoint = "/api/v1/semantic/governance/issues"
        all_payload = api_request(page, all_endpoint)
        all_issue_count = _assert_governance_payload(all_payload, endpoint=all_endpoint)

        if os.getenv("GOVERNANCE_SMOKE_REQUIRE_ISSUE") == "1" and scoped_issue_count == 0 and all_issue_count == 0:
            raise AssertionError("严格模式要求至少命中一个治理问题，但当前环境返回 0 个 issue")

        print(
            "PASS: 治理问题真实后端 smoke 通过 -> "
            f"cube={cube_name}, scoped_issues={scoped_issue_count}, all_issues={all_issue_count}"
        )
        return 0
    except (AssertionError, PlaywrightTimeoutError, Exception) as exc:
        screenshot_path = dump_debug(page, api_events, "governance_issues_failure.png")
        print(f"FAIL: 治理问题冒烟失败: {exc}")
        print(f"截图: {screenshot_path}")
        return 1
    finally:
        context.close()
        browser.close()
        playwright.stop()


if __name__ == "__main__":
    sys.exit(main())
