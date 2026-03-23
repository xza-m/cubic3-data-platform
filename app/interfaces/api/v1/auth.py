"""
认证 API v1
提供管理员密码登录、飞书 SSO 登录、当前用户信息查询
"""
import logging
from urllib.parse import urlencode

from flask import Blueprint, current_app, redirect, request
from app.interfaces.api.middleware.auth import generate_token, require_auth
from app.shared.response import success, bad_request, error
from app.shared.exceptions import AuthenticationError

bp = Blueprint("auth_api_v1", __name__, url_prefix="/api/v1/auth")
logger = logging.getLogger(__name__)


@bp.post("/login")
def login():
    """管理员密码登录"""
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return bad_request("用户名和密码不能为空")

    admin_username = current_app.config.get("ADMIN_USERNAME")
    admin_password = current_app.config.get("ADMIN_PASSWORD")

    if not admin_username or not admin_password:
        return error("管理员账号未配置，请联系系统管理员", status=500)

    if username != admin_username or password != admin_password:
        return error("用户名或密码错误", status=401)

    token = generate_token(
        user_id=username,
        user_name=username,
        roles=["admin"],
        expiry_hours=current_app.config.get("JWT_EXPIRATION_HOURS", 24),
    )
    return success({"token": token}, message="登录成功")


@bp.get("/feishu/authorize")
def feishu_authorize():
    """重定向到飞书 OAuth 授权页"""
    app_id = current_app.config.get("FEISHU_APP_ID")
    if not app_id:
        return error("飞书应用未配置", status=500)

    app_base_url = current_app.config.get("APP_BASE_URL", "http://localhost:5000")
    redirect_uri = f"{app_base_url}/api/v1/auth/feishu/callback"

    authorize_url = "https://open.feishu.cn/open-apis/authen/v1/authorize?" + urlencode({
        "app_id": app_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "state": "feishu_sso",
    })
    return redirect(authorize_url)


@bp.get("/feishu/callback")
def feishu_callback():
    """飞书 OAuth 回调：用 code 换 token，获取用户信息，生成 JWT 后重定向到前端"""
    code = request.args.get("code")
    if not code:
        return _redirect_to_login(error="缺少授权码")

    try:
        from app.infrastructure.adapters.feishu.auth_client import FeishuAuthClient

        client = FeishuAuthClient()

        # code → user_access_token
        token_data = client.get_user_access_token(code)
        user_access_token = token_data.get("access_token")

        # user_access_token → 用户信息
        user_info = client.get_user_info(user_access_token)
        open_id = user_info.get("open_id", "")
        name = user_info.get("name") or user_info.get("en_name") or open_id

        # 根据管理员名单确定角色
        admin_ids_str = current_app.config.get("FEISHU_ADMIN_OPEN_IDS", "")
        admin_ids = {s.strip() for s in admin_ids_str.split(",") if s.strip()}
        roles = ["admin"] if open_id in admin_ids else ["user"]

        jwt_token = generate_token(
            user_id=open_id,
            user_name=name,
            roles=roles,
            expiry_hours=current_app.config.get("JWT_EXPIRATION_HOURS", 24),
        )

        return _redirect_to_login(token=jwt_token)

    except Exception as e:
        logger.exception("飞书 SSO 登录失败")
        return _redirect_to_login(error=f"飞书登录失败: {str(e)}")


@bp.get("/me")
@require_auth
def me():
    """获取当前登录用户信息"""
    from flask import g
    return success({
        "user_id": g.user_id,
        "user_name": g.user_name,
        "roles": g.user_roles,
    })


def _redirect_to_login(token: str = None, error: str = None) -> object:
    """构造重定向到前端登录页的响应"""
    app_base_url = current_app.config.get("APP_BASE_URL", "http://localhost:5000")
    params = {}
    if token:
        params["token"] = token
    if error:
        params["error"] = error
    url = f"{app_base_url}/login"
    if params:
        url += "?" + urlencode(params)
    return redirect(url)
