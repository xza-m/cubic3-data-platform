"""
飞书 OAuth 认证客户端
用于飞书 SSO 登录流程：授权码 → user_access_token → 用户信息
"""
import requests
from flask import current_app
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


class FeishuAuthClient:
    """飞书 OAuth2 认证客户端"""

    BASE_URL = "https://open.feishu.cn/open-apis"

    def __init__(self):
        self.app_id = current_app.config.get("FEISHU_APP_ID") or ""
        self.app_secret = current_app.config.get("FEISHU_APP_SECRET") or ""
        self.timeout = current_app.config.get("FEISHU_TIMEOUT", 10)

    def _get_app_access_token(self) -> str:
        """获取 app_access_token（用于后续换取 user_access_token）"""
        url = f"{self.BASE_URL}/auth/v3/app_access_token/internal"
        resp = requests.post(
            url,
            json={"app_id": self.app_id, "app_secret": self.app_secret},
            timeout=self.timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") != 0:
            raise RuntimeError(f"获取 app_access_token 失败: {data.get('msg')}")
        return data["app_access_token"]

    def get_user_access_token(self, code: str) -> dict:
        """
        用授权码换取 user_access_token

        Args:
            code: 飞书 OAuth 回调中的授权码

        Returns:
            包含 access_token, open_id, name 等字段的字典
        """
        app_access_token = self._get_app_access_token()
        url = f"{self.BASE_URL}/authen/v1/oidc/access_token"
        resp = requests.post(
            url,
            headers={"Authorization": f"Bearer {app_access_token}"},
            json={"grant_type": "authorization_code", "code": code},
            timeout=self.timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") != 0:
            raise RuntimeError(f"换取 user_access_token 失败: {data.get('msg')}")
        return data["data"]

    def get_user_info(self, user_access_token: str) -> dict:
        """
        获取飞书用户信息

        Args:
            user_access_token: 用户访问令牌

        Returns:
            包含 open_id, name, en_name, avatar_url 等字段的字典
        """
        url = f"{self.BASE_URL}/authen/v1/user_info"
        resp = requests.get(
            url,
            headers={"Authorization": f"Bearer {user_access_token}"},
            timeout=self.timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") != 0:
            raise RuntimeError(f"获取用户信息失败: {data.get('msg')}")
        return data["data"]
