from __future__ import annotations

import os
import time
from pathlib import Path

from playwright.sync_api import BrowserContext, Page, sync_playwright


BASE_URL = os.getenv("DOMAIN_SMOKE_BASE_URL", "http://127.0.0.1:3000")
AUTH_TOKEN = os.getenv("DOMAIN_SMOKE_AUTH_TOKEN", "playwright-smoke-token")
HEADLESS = os.getenv("PLAYWRIGHT_HEADLESS", "1") != "0"
ARTIFACT_DIR = Path(__file__).resolve().parent.parent / "artifacts"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)


def unique_name(prefix: str) -> str:
    return f"{prefix} {int(time.time())}"


def create_context():
    playwright = sync_playwright().start()
    browser = playwright.chromium.launch(headless=HEADLESS)
    context = browser.new_context(viewport={"width": 1440, "height": 960})
    context.add_init_script(
        script=f"window.localStorage.setItem('auth_token', {AUTH_TOKEN!r});"
    )
    return playwright, browser, context


def attach_api_logger(page: Page) -> list[str]:
    api_events: list[str] = []

    def handle_response(response):
        if "/api/v1/semantic/" in response.url or "/api/v1/data-center/" in response.url:
            try:
                body = response.text()
            except Exception:
                body = "<unavailable>"
            api_events.append(f"{response.request.method} {response.url} -> {response.status} {body[:400]}")

    page.on("response", handle_response)
    return api_events


def dump_debug(page: Page, api_events: list[str], screenshot_name: str) -> str:
    screenshot_path = ARTIFACT_DIR / screenshot_name
    try:
        page.screenshot(path=str(screenshot_path), full_page=True)
        print(f"DEBUG: url={page.url}")
        print(f"DEBUG: title={page.title()}")
        print(f"DEBUG: body={page.locator('body').inner_text(timeout=3000)[:1200]}")
        if api_events:
            print("DEBUG: api_events=")
            for item in api_events:
                print(item)
    except Exception:
        pass
    return str(screenshot_path)


def goto_semantic(page: Page, path: str) -> None:
    page.goto(f"{BASE_URL}{path}", wait_until="domcontentloaded")


def create_domain_via_ui(page: Page, domain_name: str) -> str:
    goto_semantic(page, "/semantic/canvas")
    page.get_by_role("heading", name="领域建模").wait_for(timeout=10_000)
    page.get_by_test_id("domain-create-name").fill(domain_name)
    page.get_by_test_id("domain-create-submit").click()
    page.wait_for_url("**/semantic/domains/**/canvas", timeout=15_000)
    return page.url.rstrip("/").split("/")[-2]


def first_library_cube(page: Page):
    return page.locator('[data-testid^="domain-library-cube-"]').first


def drag_library_cube_to_canvas(page: Page, index: int = 0) -> None:
    cubes = page.locator('[data-testid^="domain-library-cube-"]')
    cube = cubes.nth(index)
    cube.wait_for(timeout=10_000)
    canvas = page.get_by_test_id("domain-canvas-surface")
    cube.drag_to(canvas)


def assert_no_error_toast(page: Page, title: str) -> None:
    if page.get_by_text(title, exact=False).count() > 0:
        raise AssertionError(f"页面出现错误提示: {title}")
