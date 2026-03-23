from __future__ import annotations

import sys
import time

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

from _common import (
    assert_no_error_toast,
    attach_api_logger,
    create_context,
    create_domain_via_ui,
    drag_library_cube_to_canvas,
    dump_debug,
    unique_name,
)


def main() -> int:
    playwright, browser, context = create_context()
    page = context.new_page()
    api_events = attach_api_logger(page)
    domain_name = unique_name("Playwright 领域发布")

    try:
        create_domain_via_ui(page, domain_name)
        page.get_by_role("heading", name="领域建模").wait_for(timeout=10_000)
        cubes = page.locator('[data-testid^="domain-library-cube-"]')
        cube_count = cubes.count()
        if cube_count == 0:
            raise AssertionError("当前领域画布没有可用的 active Cube")

        used_indexes: set[int] = set()
        drag_index = int(time.time()) % cube_count
        used_indexes.add(drag_index)
        drag_library_cube_to_canvas(page, drag_index)

        published = False
        for _ in range(min(3, cube_count)):
            page.get_by_test_id("publish-domain-button").click()
            try:
                page.get_by_text("领域 YAML 发布成功", exact=True).first.wait_for(timeout=8_000)
                published = True
                break
            except PlaywrightTimeoutError:
                duplicate_toast = page.get_by_text("结构完全重复", exact=False).first
                if duplicate_toast.count() == 0:
                    raise

                next_index = next((idx for idx in range(cube_count) if idx not in used_indexes), None)
                if next_index is None:
                    raise AssertionError("领域发布因重复结构被拦截，且没有更多 Cube 可用于生成唯一结构")

                used_indexes.add(next_index)
                drag_library_cube_to_canvas(page, next_index)

        if not published:
            raise AssertionError("领域发布未成功完成")

        page.get_by_text("active", exact=True).first.wait_for(timeout=10_000)
        assert_no_error_toast(page, "发布失败")
        print(f"PASS: 已发布领域并激活 -> {domain_name}")
        return 0
    except (AssertionError, PlaywrightTimeoutError, Exception) as exc:
        screenshot_path = dump_debug(page, api_events, "domain_publish_failure.png")
        print(f"FAIL: 领域发布冒烟失败: {exc}")
        print(f"截图: {screenshot_path}")
        return 1
    finally:
        context.close()
        browser.close()
        playwright.stop()


if __name__ == "__main__":
    sys.exit(main())
