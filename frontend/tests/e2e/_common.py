from __future__ import annotations

import json
import os
import time
from pathlib import Path
from urllib import error as urlerror
from urllib import request as urlrequest

from playwright.sync_api import BrowserContext, Page, sync_playwright


BASE_URL = os.getenv("DOMAIN_SMOKE_BASE_URL", "http://127.0.0.1:3100")
HEADLESS = os.getenv("PLAYWRIGHT_HEADLESS", "1") != "0"
ARTIFACT_DIR = Path(__file__).resolve().parent.parent / "artifacts"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
_AUTH_TOKEN_CACHE: str | None = None


def _extract_token(payload: dict) -> str | None:
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    return payload.get("access_token") or payload.get("token") or data.get("access_token") or data.get("token")


def resolve_auth_token() -> str:
    """获取真实 JWT，避免有状态 smoke 使用占位 token 命中后端鉴权失败。"""

    global _AUTH_TOKEN_CACHE
    if _AUTH_TOKEN_CACHE:
        return _AUTH_TOKEN_CACHE

    explicit = os.getenv("DOMAIN_SMOKE_AUTH_TOKEN")
    if explicit:
        _AUTH_TOKEN_CACHE = explicit
        return explicit

    username = os.getenv("DOMAIN_SMOKE_USERNAME") or os.getenv("ADMIN_USERNAME") or "admin"
    password = os.getenv("DOMAIN_SMOKE_PASSWORD") or os.getenv("ADMIN_PASSWORD") or "admin123"
    body = json.dumps({"username": username, "password": password}).encode("utf-8")
    req = urlrequest.Request(
        f"{BASE_URL}/api/v1/auth/login",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlrequest.urlopen(req, timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urlerror.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise AssertionError(
            "获取语义 smoke JWT 失败：请检查 DOMAIN_SMOKE_USERNAME / DOMAIN_SMOKE_PASSWORD "
            f"或显式设置 DOMAIN_SMOKE_AUTH_TOKEN。HTTP {exc.code}: {detail}"
        ) from exc
    except Exception as exc:
        raise AssertionError(
            "获取语义 smoke JWT 失败：请确认前端 dev server 代理到可用后端，"
            "或显式设置 DOMAIN_SMOKE_AUTH_TOKEN"
        ) from exc

    token = _extract_token(payload)
    if not token:
        raise AssertionError(f"登录成功但响应缺少 token: {payload}")
    _AUTH_TOKEN_CACHE = token
    return token


def unique_name(prefix: str) -> str:
    return f"{prefix} {int(time.time())}"


def create_context():
    auth_token = resolve_auth_token()
    playwright = sync_playwright().start()
    browser = playwright.chromium.launch(headless=HEADLESS)
    context = browser.new_context(viewport={"width": 1440, "height": 960})
    context.add_init_script(
        script=(
            f"window.sessionStorage.setItem('v2.access_token', {auth_token!r});"
            f"window.localStorage.setItem('auth_token', {auth_token!r});"
        )
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


def api_request(page: Page, path: str, *, method: str = "GET", data: dict | None = None) -> dict:
    auth_token = resolve_auth_token()
    response = page.request.fetch(
        f"{BASE_URL}{path}",
        method=method,
        data=data,
        headers={
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json",
        },
    )
    payload = response.json()
    if not response.ok:
        raise AssertionError(f"请求 {path} 失败: {payload}")
    return payload


def create_domain_via_ui(page: Page, domain_name: str) -> str:
    payload = api_request(
        page,
        "/api/v1/semantic/domains",
        method="POST",
        data={
            "name": domain_name,
            "catalog_code": "default",
        },
    )
    domain = payload.get("data") or {}
    domain_id = domain.get("id") or domain.get("code")
    if not domain_id:
        raise AssertionError(f"创建领域成功，但响应缺少领域标识: {payload}")

    goto_semantic(page, f"/semantic/domains/{domain_id}")
    page.get_by_test_id("domain-canvas-page").wait_for(timeout=15_000)
    return str(domain_id)


def select_first_schema_table(page: Page) -> None:
    table_locator = page.locator('[data-testid^="schema-node-table-"]')
    schema_locator = page.locator('[data-testid^="schema-node-schema-"]')
    database_locator = page.locator('[data-testid^="schema-node-database-"]')

    if table_locator.count() == 0:
        if schema_locator.count() == 0:
            database_locator.first.wait_for(timeout=15_000)
            database_locator.first.click()

        if table_locator.count() == 0:
            schema_locator.first.wait_for(timeout=15_000)
            schema_locator.first.click()

    table_locator.first.wait_for(timeout=15_000)
    table_locator.first.click()


def first_library_cube(page: Page):
    return page.locator('[data-testid^="domain-library-cube-"]').first


def drag_library_cube_to_canvas(page: Page, index: int = 0) -> None:
    cubes = page.locator('[data-testid^="domain-library-cube-"]')
    cube = cubes.nth(index)
    cube.wait_for(timeout=10_000)
    canvas = page.get_by_test_id("domain-canvas-surface")
    canvas.wait_for(timeout=10_000)
    data_transfer = page.evaluate_handle("() => new DataTransfer()")
    cube.dispatch_event("dragstart", {"dataTransfer": data_transfer})
    canvas.dispatch_event("dragover", {"dataTransfer": data_transfer})
    canvas.dispatch_event("drop", {"dataTransfer": data_transfer})


def assert_no_error_toast(page: Page, title: str) -> None:
    if page.get_by_text(title, exact=False).count() > 0:
        raise AssertionError(f"页面出现错误提示: {title}")
