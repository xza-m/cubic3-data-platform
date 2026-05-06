from __future__ import annotations

import sys
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

from _common import (
    api_request,
    assert_no_error_toast,
    attach_api_logger,
    create_context,
    create_domain_via_ui,
    dump_debug,
    resolve_auth_token,
    unique_name,
)


def main() -> int:
    playwright, browser, context = create_context()
    page = context.new_page()
    api_events = attach_api_logger(page)
    domain_name = unique_name("Playwright 领域发布")

    try:
        domain_id = create_domain_via_ui(page, domain_name)
        page.get_by_test_id("domain-canvas-page").wait_for(timeout=10_000)
        page.get_by_text("资产画布", exact=True).wait_for(timeout=10_000)

        cube_payload = api_request(page, "/api/v1/semantic/cubes?page_size=200")
        cubes = [
            item.get("name")
            for item in cube_payload.get("data", {}).get("cubes", [])
            if item.get("name") and item.get("status") == "active"
        ]
        if not cubes:
            raise AssertionError("当前环境没有可用于领域发布的活跃 Cube")

        payload = None
        last_message = ""
        auth_token = resolve_auth_token()
        for count in range(1, len(cubes) + 1):
            response = page.request.fetch(
                f"{page.url.split('/semantic/', 1)[0]}/api/v1/semantic/domains/{domain_id}/publish",
                method="POST",
                data={"cubes": cubes[:count]},
                headers={
                    "Authorization": f"Bearer {auth_token}",
                    "Content-Type": "application/json",
                },
            )
            payload = response.json()
            if response.ok and payload.get("data", {}).get("status") == "active":
                break
            last_message = str(payload.get("message") or payload.get("error") or response.status)
            if "资产范围" not in last_message:
                raise AssertionError(f"领域发布返回异常: {last_message}")
        else:
            raise AssertionError(f"领域发布因资产范围重复被拦截，且没有更多 Cube 可用于生成唯一范围: {last_message}")

        page.reload(wait_until="domcontentloaded")
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
