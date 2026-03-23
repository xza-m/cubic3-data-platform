import time
import json
import hashlib
import logging
from typing import Dict
from urllib.parse import urlparse
import requests
from flask import current_app


logger = logging.getLogger(__name__)


class SupersetClient:
    def __init__(self):
        self.base_url = current_app.config["SUPERSET_BASE_URL"]
        self.username = current_app.config.get("SUPERSET_USERNAME")
        self.password = current_app.config.get("SUPERSET_PASSWORD")
        self.jwt = current_app.config.get("SUPERSET_JWT")
        self.session = requests.Session()
        self._access_token = None
        self._csrf_token = None
        # 截图/缩放默认参数
        self.viewport_width = int(current_app.config.get("SUPERSET_VIEWPORT_WIDTH", 1920))
        self.viewport_height = int(current_app.config.get("SUPERSET_VIEWPORT_HEIGHT", 1080))
        self.dashboard_url_template = current_app.config.get("SUPERSET_DASHBOARD_URL_TEMPLATE") or ""
        parsed = urlparse(self.base_url)
        self._base_path = parsed.path.rstrip("/")  # 供 screenshot url_path 推断使用
        self.screenshot_max_wait = int(current_app.config.get("SUPERSET_SCREENSHOT_MAX_WAIT", 60))
        self.screenshot_poll_interval = float(
            current_app.config.get("SUPERSET_SCREENSHOT_POLL_INTERVAL", 3.0)
        )

    def _auth_header(self) -> Dict[str, str]:
        if self.jwt:
            return {"Authorization": f"Bearer {self.jwt}"}
        if self._access_token:
            return {"Authorization": f"Bearer {self._access_token}"}
        if self.username and self.password:
            self._login()
            return {"Authorization": f"Bearer {self._access_token}"}
        return {}

    def _csrf_header(self) -> Dict[str, str]:
        """
        获取 CSRF token（仅登录模式需要）。Superset 开启 CSRF 校验时，
        cache_dashboard_screenshot 需要携带 X-CSRFToken。
        """
        if self.jwt:
            return {}
        if self._csrf_token:
            return {"X-CSRFToken": self._csrf_token}
        # 确保已登录拿到 access_token
        self._auth_header()
        url = f"{self.base_url}/api/v1/security/csrf_token/"
        resp = self.session.get(url, headers=self._auth_header(), timeout=10)
        resp.raise_for_status()
        data = resp.json() or {}
        token = data.get("result")
        if token:
            self._csrf_token = token
            return {"X-CSRFToken": token}
        return {}

    def _login(self) -> None:
        login_url = f"{self.base_url}/api/v1/security/login"
        payload = {
            "provider": "db",
            "username": self.username,
            "password": self.password,
            "refresh": True,
        }
        resp = self.session.post(login_url, json=payload, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        self._access_token = data.get("access_token")

    def _build_screenshot_digest(self, payload: Dict) -> str:
        """按照官方约定对 q 参数做 md5 生成 digest，用于缓存命中"""
        return hashlib.md5(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()

    def _dashboard_url_path(self, dashboard_id: str) -> str:
        """
        返回截图用的唯一 url_path，优先使用模板，其次基于 base_path 的标准路径。
        不再尝试多候选/legacy 路径，避免重复降级。
        """
        if self.dashboard_url_template:
            try:
                return self.dashboard_url_template.format(id=dashboard_id, pk=dashboard_id)
            except Exception:
                pass
        if self._base_path:
            return f"{self._base_path}/superset/dashboard/{dashboard_id}/"
        return f"/superset/dashboard/{dashboard_id}/"

    def _get_screenshot_cache_key(self, dashboard_id: str, payload: Dict, timeout: int):
        """调用 cache_dashboard_screenshot 获取 cache_key"""
        url = f"{self.base_url}/api/v1/dashboard/{dashboard_id}/cache_dashboard_screenshot"
        headers = {**self._auth_header(), **self._csrf_header()}
        resp = self.session.post(url, headers=headers, json=payload, timeout=timeout)
        try:
            resp.raise_for_status()
        except requests.HTTPError as e:
            # 将响应体附加到异常，便于排查 400 等错误
            body = resp.text if resp is not None else ""
            logger.error(
                "cache_dashboard_screenshot failed: status=%s body=%s payload=%s",
                resp.status_code if resp is not None else "unknown",
                body[:1000],
                payload,
            )
            raise requests.HTTPError(f"{e} body={body}", response=resp) from e
        data = resp.json() or {}
        cache_key = data.get("cache_key") or data.get("key")
        if not cache_key:
            raise RuntimeError("cache_dashboard_screenshot 返回为空")
        return cache_key

    def _fetch_screenshot_by_cache_key(self, dashboard_id: str, cache_key: str, timeout: int, attempt: int):
        """根据 cache_key 拉取截图; 202/404 视为未就绪，返回 None 重试"""
        url = f"{self.base_url}/api/v1/dashboard/{dashboard_id}/screenshot/{cache_key}/"
        resp = self.session.get(
            url,
            headers=self._auth_header(),
            timeout=timeout,
        )
        if resp.status_code == 200:
            return resp.content
        if resp.status_code in (202, 404):
            # 未就绪，调用方重试
            return None
        # 其他错误直接抛出，便于暴露权限/参数问题
        logger.error(
            "fetch_screenshot failed: status=%s body=%s cache_key=%s attempt=%s",
            resp.status_code,
            resp.text[:1000],
            cache_key,
            attempt,
        )
        resp.raise_for_status()

    def get_dashboard_screenshot(
        self,
        dashboard_id: str,
        timeout: int = 20,
        retries: int = 3,
        backoff: float = 1.5,
        force: bool = True,
    ) -> bytes:
        """
        使用官方推荐流程：cache_dashboard_screenshot -> 根据 cache_key 轮询 /screenshot/{cache_key}
        无 legacy 降级。
        """
        url_path = self._dashboard_url_path(dashboard_id)
        payload = {}

        # 若携带 url_path/window_size 导致 400，再回退到最小 payload（与脚本一致）
        cache_key = None
        last_exc = None
        try:
            logger.info("superset cache attempt with full payload url_path=%s", url_path)
            cache_key = self._get_screenshot_cache_key(dashboard_id, payload, timeout)
        except requests.HTTPError as http_exc:
            last_exc = http_exc
            if http_exc.response is not None and http_exc.response.status_code == 400:
                cache_key = self._get_screenshot_cache_key(dashboard_id, payload, timeout)
                last_exc = None
        if cache_key is None and last_exc:
            raise last_exc

        # 轮询等待截图就绪：遵循最大等待时间与轮询间隔，可通过环境变量调整
        last_exc = None
        deadline = time.monotonic() + self.screenshot_max_wait
        attempt = 0
        while True:
            try:
                content = self._fetch_screenshot_by_cache_key(dashboard_id, cache_key, timeout, attempt)
                if content is not None:
                    return content
            except Exception as exc:
                last_exc = exc
            attempt += 1
            if time.monotonic() >= deadline:
                break
            time.sleep(self.screenshot_poll_interval)

        if last_exc:
            raise last_exc
        raise RuntimeError("Superset screenshot not ready after retries")

    def get_dashboard_title(self, dashboard_id: str) -> str:
        """
        获取 dashboard 标题，便于用于消息标题。
        """
        url = f"{self.base_url}/api/v1/dashboard/{dashboard_id}"
        resp = self.session.get(url, headers=self._auth_header(), timeout=10)
        resp.raise_for_status()
        data = resp.json() or {}
        result = data.get("result") or {}
        # Superset 常见字段 dashboard_title/title
        title = result.get("dashboard_title") or result.get("title")
        if not title:
            raise RuntimeError(f"Dashboard title not found for id {dashboard_id}")
        return title
