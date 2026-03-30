from __future__ import annotations

import sys

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from _common import (
    assert_no_error_toast,
    attach_api_logger,
    create_context,
    create_domain_via_ui,
    dump_debug,
    unique_name,
)


def main() -> int:
    playwright, browser, context = create_context()
    page = context.new_page()
    api_events = attach_api_logger(page)
    domain_name = unique_name("Playwright 领域草稿")

    try:
        create_domain_via_ui(page, domain_name)
        page.wait_for_url("**/semantic/domains/**", timeout=15_000)
        page.get_by_test_id("domain-canvas-page").wait_for(timeout=10_000)
        page.get_by_text("Cube 资源库", exact=True).wait_for(timeout=10_000)
        page.get_by_text("Join 配置", exact=True).wait_for(timeout=10_000)
        page.get_by_text(domain_name, exact=False).first.wait_for(timeout=10_000)
        assert_no_error_toast(page, "创建领域失败")

        print(f"PASS: 已创建领域草稿并跳转画布 -> {domain_name}")
        return 0
    except (AssertionError, PlaywrightTimeoutError, Exception) as exc:
        screenshot_path = dump_debug(page, api_events, "domain_creation_failure.png")
        print(f"FAIL: 领域草稿创建冒烟失败: {exc}")
        print(f"截图: {screenshot_path}")
        return 1
    finally:
        context.close()
        browser.close()
        playwright.stop()


if __name__ == "__main__":
    sys.exit(main())
