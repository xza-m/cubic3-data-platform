# app/interfaces/api/v1/auth.py
"""
认证 API v1
提供管理员密码登录、飞书 SSO 登录、当前用户信息查询。

W4.D-2 之后，密码登录优先走数据库（UserService），仅在数据库中尚无任何
用户时回退到环境变量中的引导账户（首次安装兼容）。
"""
import logging
from urllib.parse import urlencode

from flask import Blueprint, current_app, redirect, request

from app.application.users.user_service import UserService
from app.extensions import db
from app.infrastructure.users.password import BcryptHasher
from app.infrastructure.users.repositories import SqlRoleRepository, SqlUserRepository
from app.interfaces.api.middleware.auth import generate_token, require_auth
from app.shared.exceptions import AuthenticationError
from app.shared.response import bad_request, error, success

bp = Blueprint("auth_api_v1", __name__, url_prefix="/api/v1/auth")
logger = logging.getLogger(__name__)


def _generate_token_for(user_id, user_name, roles):
    return generate_token(
        user_id=user_id,
        user_name=user_name,
        roles=roles,
        expiry_hours=current_app.config.get("JWT_EXPIRATION_HOURS", 24),
    )


def _user_service() -> UserService:
    """直接基于 Flask-SQLAlchemy 的 ``db.session`` 构造 UserService。

    与 W4.D-2 其它入口（``users.py`` / ``roles.py``）保持一致，避免依赖
    DI 容器中独立的引擎；这样在测试与生产环境下用同一个 SQLAlchemy 引擎。
    """
    return UserService(
        SqlUserRepository(db.session),
        SqlRoleRepository(db.session),
        BcryptHasher(),
    )


def _client_ip() -> str:
    """提取客户端 IP（优先使用反向代理转发的头）。"""
    xff = request.headers.get("X-Forwarded-For", "")
    if xff:
        return xff.split(",")[0].strip()[:64]
    return (request.remote_addr or "")[:64]


@bp.post("/login")
def login():
    """密码登录。

    1. 优先走数据库（UserService.authenticate）。
    2. 如果数据库为空 / 配置缺失，回退到环境变量中的 ADMIN_USERNAME /
       ADMIN_PASSWORD，授予 admin 角色（仅用于首次安装引导）。
    """
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return bad_request("用户名和密码不能为空")

    client_ip = _client_ip()
    user_agent = (request.headers.get("User-Agent") or "")[:512]

    # ---- 数据库优先 ------------------------------------------------------
    try:
        user_service = _user_service()
    except Exception as exc:  # pragma: no cover - 仅在 SQLAlchemy 异常时
        logger.warning("无法构造 UserService，回退到引导账户: %s", exc)
        user_service = None

    if user_service is not None:
        try:
            has_users = user_service.has_any_user()
        except Exception as exc:  # pragma: no cover
            logger.exception("查询用户总数失败")
            has_users = False

        if has_users:
            try:
                authed = user_service.authenticate(username, password)
            except AuthenticationError as exc:
                return error(str(exc) or "用户名或密码错误", status=401)
            except Exception as exc:  # pragma: no cover
                logger.exception("数据库认证失败")
                return error("登录失败：服务异常", status=500)

            if not authed:
                # 尝试记录失败事件（若找得到用户）
                try:
                    from app.infrastructure.users.repositories import SqlUserRepository
                    repo = SqlUserRepository(db.session)
                    existing = repo.get_by_username(username)
                    if existing and existing.id is not None:
                        user_service.record_login_event(
                            user_id=existing.id,
                            status="failed",
                            ip_address=client_ip,
                            user_agent=user_agent,
                            error_reason="invalid_credentials",
                        )
                except Exception:
                    pass
                return error("用户名或密码错误", status=401)

            user_service.record_login_event(
                user_id=int(authed["id"]),
                status="success",
                ip_address=client_ip,
                user_agent=user_agent,
            )

            roles = authed.get("role_codes") or []
            token = _generate_token_for(
                user_id=str(authed["id"]),
                user_name=authed.get("display_name") or authed["username"],
                roles=roles,
            )
            return success({"token": token}, message="登录成功")

    # ---- 引导回退（数据库为空时使用环境变量账号）------------------------
    admin_username = current_app.config.get("ADMIN_USERNAME")
    admin_password = current_app.config.get("ADMIN_PASSWORD")
    if not admin_username or not admin_password:
        return error("管理员账号未配置，请联系系统管理员", status=500)
    if username != admin_username or password != admin_password:
        return error("用户名或密码错误", status=401)

    token = _generate_token_for(user_id=username, user_name=username, roles=["admin"])
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
        token_data = client.get_user_access_token(code)
        user_access_token = token_data.get("access_token")

        user_info = client.get_user_info(user_access_token)
        open_id = user_info.get("open_id", "")
        name = user_info.get("name") or user_info.get("en_name") or open_id

        admin_ids_str = current_app.config.get("FEISHU_ADMIN_OPEN_IDS", "")
        admin_ids = {s.strip() for s in admin_ids_str.split(",") if s.strip()}
        roles = ["admin"] if open_id in admin_ids else ["user"]

        jwt_token = _generate_token_for(user_id=open_id, user_name=name, roles=roles)
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
