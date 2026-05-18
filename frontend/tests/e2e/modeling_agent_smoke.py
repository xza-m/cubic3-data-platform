from __future__ import annotations

import os
import sys
import time
from typing import Any

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

from _common import api_request, attach_api_logger, create_context, dump_debug, goto_semantic


def _resolve_source(page) -> dict[str, str]:
    source_id = os.getenv("SEMANTIC_MODELING_SMOKE_SOURCE_ID", "").strip()
    database = os.getenv("SEMANTIC_MODELING_SMOKE_DATABASE", "").strip()
    schema = os.getenv("SEMANTIC_MODELING_SMOKE_SCHEMA", "").strip()
    table = os.getenv("SEMANTIC_MODELING_SMOKE_TABLE", "dwd_interaction_comment_reports_df").strip()

    if source_id and database and table:
        return {"source_id": source_id, "database": database, "schema": schema, "table": table}

    payload = api_request(page, "/api/v1/data-center/datasources?is_active=true&page_size=100")
    items = (payload.get("data") or {}).get("items") or []
    source = _pick_datasource(items)
    if not source:
        raise AssertionError("当前环境没有可用于建模助手 smoke 的 active 数据源")

    config = source.get("connection_config") or source.get("extra_config") or {}
    resolved_database = database or str(
        config.get("project") or config.get("database") or os.getenv("MAXCOMPUTE_PROJECT") or ""
    ).strip()
    resolved_source_id = source_id or str(source.get("id") or "")
    if not resolved_source_id or not resolved_database or not table:
        raise AssertionError(
            "建模助手 smoke 缺少 source_id/database/table；"
            "可通过 SEMANTIC_MODELING_SMOKE_SOURCE_ID、"
            "SEMANTIC_MODELING_SMOKE_DATABASE、SEMANTIC_MODELING_SMOKE_TABLE 显式指定"
        )
    return {
        "source_id": resolved_source_id,
        "database": resolved_database,
        "schema": schema,
        "table": table,
    }


def _pick_datasource(items: list[dict[str, Any]]) -> dict[str, Any] | None:
    active_items = [item for item in items if item.get("is_active", True)]
    for item in active_items:
        if str(item.get("source_type") or "").lower() == "maxcompute":
            return item
    return active_items[0] if active_items else None


def _wait_for_spec_text(page, expected: str) -> str:
    editor = page.get_by_label("SemanticModelingAgentSpec")
    editor.wait_for(timeout=10_000)
    for _ in range(40):
        value = editor.input_value()
        if expected in value:
            return value
        time.sleep(0.25)
    raise AssertionError(f"SemanticModelingAgentSpec 未生成预期内容: {expected}")


def main() -> int:
    playwright, browser, context = create_context()
    page = context.new_page()
    api_events = attach_api_logger(page)

    try:
        source = _resolve_source(page)
        goto_semantic(page, "/semantic/modeling-agent/new")
        page.get_by_role("heading", name="建模助手 Agent").wait_for(timeout=10_000)

        page.get_by_label("数据源 ID").fill(source["source_id"])
        page.get_by_label("数据库").fill(source["database"])
        if source["schema"]:
            page.get_by_label("Schema").fill(source["schema"])
        page.get_by_label("事实表").fill(source["table"])
        page.get_by_label("业务主题").fill("学生评论")
        page.get_by_label("使用场景").fill("运营只读问数\n学生评论分析")
        page.get_by_label("默认角色").fill("data_agent_test, ops_readonly")

        page.get_by_role("button", name="生成 Spec").click()
        _wait_for_spec_text(page, '"spec_version": "v1"')
        _wait_for_spec_text(page, '"official_agent_consumes_spec": false')

        page.get_by_role("button", name="生成草稿").click()
        page.locator("pre", has_text='"ontology"').first.wait_for(timeout=15_000)
        page.locator("pre", has_text='"cube"').first.wait_for(timeout=15_000)

        page.get_by_role("button", name="校验").click()
        page.get_by_text('"status": "ready"', exact=False).wait_for(timeout=15_000)

        page.get_by_role("button", name="保存草稿").click()
        page.locator("pre", has_text='"assets"').first.wait_for(timeout=15_000)
        page.locator("pre", has_text='"published": false').first.wait_for(timeout=15_000)

        print(f"PASS: 已完成建模助手 Agent smoke -> {source['database']}.{source['table']}")
        return 0
    except (AssertionError, PlaywrightTimeoutError, Exception) as exc:
        screenshot_path = dump_debug(page, api_events, "modeling_agent_failure.png")
        print(f"FAIL: 建模助手 Agent 冒烟失败: {exc}")
        print(f"截图: {screenshot_path}")
        return 1
    finally:
        context.close()
        browser.close()
        playwright.stop()


if __name__ == "__main__":
    sys.exit(main())
