from __future__ import annotations

import sys
import time

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

from _common import attach_api_logger, create_context, dump_debug, goto_semantic, unique_name, select_first_schema_table


def main() -> int:
    playwright, browser, context = create_context()
    page = context.new_page()
    api_events = attach_api_logger(page)
    cube_name = f"playwright_cube_{int(time.time() * 1000)}"
    cube_title = unique_name("Playwright Cube 草稿")

    try:
        goto_semantic(page, "/semantic/workbench")
        page.get_by_role("heading", name="语义工作台").wait_for(timeout=10_000)
        page.get_by_text("AI 辅助建模", exact=True).first.wait_for(timeout=10_000)
        page.get_by_text("最近草稿", exact=True).wait_for(timeout=10_000)
        page.get_by_text("最近发布", exact=True).wait_for(timeout=10_000)

        generate_draft_button = page.get_by_test_id("cube-generate-draft")
        save_draft_button = page.get_by_test_id("cube-banner-save-draft")
        generate_draft_button.wait_for(timeout=10_000)

        select_first_schema_table(page)
        generate_draft_button.click()
        page.get_by_text("Cube 草稿已生成", exact=True).first.wait_for(timeout=15_000)
        save_draft_button.wait_for(timeout=10_000)
        page.get_by_test_id("cube-draft-name").fill(cube_name)
        title_input = page.get_by_test_id("cube-draft-title")
        title_input.fill(cube_title)
        save_draft_button.click()
        page.wait_for_url(f"**/semantic/workbench?cube={cube_name}&tab=modeling", timeout=15_000)
        page.get_by_test_id("devtools-tab-modeling").wait_for(timeout=10_000)
        page.get_by_role("link", name="发布").wait_for(timeout=10_000)
        page.get_by_text(cube_title, exact=True).wait_for(timeout=10_000)
        page.get_by_text("草稿", exact=True).first.wait_for(timeout=10_000)
        print(f"PASS: 已从语义工作台完成 Cube 草稿创建 -> {cube_title}")
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
