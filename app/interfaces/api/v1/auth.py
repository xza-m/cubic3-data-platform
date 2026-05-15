# app/interfaces/api/v1/auth.py
"""
认证 API v1
提供管理员密码登录、飞书 SSO 登录、当前用户信息查询。

登录只负责签发当前会话 JWT；权限主体、角色绑定统一写入 access_* 新体系。
"""
import logging
from urllib.parse import urlencode

from flask import Blueprint, current_app, redirect, request

from app.application.access.identity import AccessIdentityService
from app.extensions import db
from app.infrastructure.access.repositories import SqlAccessRepository
from app.interfaces.api.middleware.auth import generate_token, require_auth
from app.shared.response import bad_request, error, success

bp = Blueprint("auth_api_v1", __name__, url_prefix="/api/v1/auth")
logger = logging.getLogger(__name__)
BOOTSTRAP_ADMIN_ROLES = ["platform_admin", "governance_admin", "semantic_admin", "viewer"]


def _generate_token_for(user_id, user_name, roles):
    return generate_token(
        user_id=user_id,
        user_name=user_name,
        roles=roles,
        expiry_hours=current_app.config.get("JWT_EXPIRATION_HOURS", 24),
    )


def _access_repository() -> SqlAccessRepository:
    return SqlAccessRepository(db.session)


def _access_service() -> AccessIdentityService:
    return AccessIdentityService(_access_repository())


def _ensure_internal_principal(username: str, roles: list[str]) -> str:
    principal_id = f"internal:local:{username}"
    repo = _access_repository()
    repo.upsert_principal(
        principal_id=principal_id,
        principal_type="human",
        idp="internal",
        tenant_key="local",
        display_name=username,
        raw_profile={"source": "bootstrap_login"},
    )
    repo.commit()
    _access_service().ensure_principal_role_bindings(
        principal_id=principal_id,
        roles=roles,
        source="bootstrap",
        created_by=principal_id,
    )
    return principal_id


def _client_ip() -> str:
    """提取客户端 IP（优先使用反向代理转发的头）。"""
    xff = request.headers.get("X-Forwarded-For", "")
    if xff:
        return xff.split(",")[0].strip()[:64]
    return (request.remote_addr or "")[:64]


@bp.post("/login")
def login():
    """密码登录。

    仅支持环境变量中的引导账户。平台正式用户以飞书 SSO 为准；
    引导账户会同步为 ``internal:local:<username>`` Principal。
    """
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return bad_request("用户名和密码不能为空")

    admin_username = current_app.config.get("ADMIN_USERNAME")
    admin_password = current_app.config.get("ADMIN_PASSWORD")
    if not admin_username or not admin_password:
        return error("管理员账号未配置，请联系系统管理员", status=500)
    if username != admin_username or password != admin_password:
        return error("用户名或密码错误", status=401)

    try:
        principal_id = _ensure_internal_principal(username, BOOTSTRAP_ADMIN_ROLES)
    except Exception:
        logger.exception("初始化引导 Principal 失败")
        return error("登录失败：无法初始化权限主体", status=500)

    token = _generate_token_for(user_id=principal_id, user_name=username, roles=BOOTSTRAP_ADMIN_ROLES)
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
        union_id = user_info.get("union_id") or user_info.get("unionid")
        tenant_key = user_info.get("tenant_key") or current_app.config.get("FEISHU_TENANT_KEY") or "default"
        name = user_info.get("name") or user_info.get("en_name") or open_id
        email = user_info.get("email")
        employee_no = user_info.get("employee_no") or user_info.get("employee_id")

        service = _access_service()
        principal = service.upsert_feishu_principal(
            tenant_key=tenant_key,
            open_id=open_id,
            union_id=union_id,
            display_name=name,
            email=email,
            employee_no=employee_no,
            raw_profile=user_info,
        )

        admin_ids_str = current_app.config.get("FEISHU_ADMIN_OPEN_IDS", "")
        admin_ids = {s.strip() for s in admin_ids_str.split(",") if s.strip()}
        roles = BOOTSTRAP_ADMIN_ROLES if {open_id, union_id, principal.principal_id} & admin_ids else ["viewer"]
        service.ensure_principal_role_bindings(
            principal_id=principal.principal_id,
            roles=roles,
            source="feishu_sso",
            created_by=principal.principal_id,
        )

        jwt_token = _generate_token_for(user_id=principal.principal_id, user_name=name, roles=roles)
        return _redirect_to_login(token=jwt_token)

    except Exception as e:
        logger.exception("飞书 SSO 登录失败")
        return _redirect_to_login(error=f"飞书登录失败: {str(e)}")


@bp.get("/me")
@require_auth
def me():
    """获取当前登录用户信息"""
    from flask import g
    principal_id = getattr(g, "principal_id", None) or getattr(g, "user_id", None)
    return success({
        "user_id": g.user_id,
        "principal_id": principal_id,
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
