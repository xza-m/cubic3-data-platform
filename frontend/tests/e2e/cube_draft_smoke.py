from __future__ import annotations

import sys

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

from _common import (
    attach_api_logger,
    create_context,
    dump_debug,
    goto_semantic,
    select_first_schema_table,
    unique_name,
)


def main() -> int:
    playwright, browser, context = create_context()
    page = context.new_page()
    api_events = attach_api_logger(page)
    cube_title = unique_name("Playwright Cube 草稿")

    try:
        goto_semantic(page, "/semantic/cubes/new")
        page.get_by_role("heading", name="新建 Cube").wait_for(timeout=10_000)
        select_first_schema_table(page)
        page.get_by_test_id("cube-generate-draft").click()
        page.get_by_text("Cube 草稿已生成", exact=False).wait_for(timeout=15_000)
        title_input = page.get_by_test_id("cube-draft-title")
        title_input.fill(cube_title)
        page.get_by_test_id("cube-save-draft").click()
        page.wait_for_url("**/semantic/cubes/**", timeout=15_000)
        page.get_by_role("heading", name=cube_title).wait_for(timeout=10_000)
        page.get_by_text("草稿", exact=True).first.wait_for(timeout=10_000)
        print(f"PASS: 已生成并保存 Cube 草稿 -> {cube_title}")
        return 0
    except (AssertionError, PlaywrightTimeoutError, Exception) as exc:
        screenshot_path = dump_debug(page, api_events, "cube_draft_failure.png")
        print(f"FAIL: Cube 草稿冒烟失败: {exc}")
        print(f"截图: {screenshot_path}")
        return 1
    finally:
        context.close()
        browser.close()
        playwright.stop()
