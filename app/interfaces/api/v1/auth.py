# app/interfaces/api/v1/auth.py
"""
认证 API v1
提供管理员密码登录、飞书 SSO 登录、当前用户信息查询。

登录统一签发平台 Token Pair；权限主体、角色绑定统一写入 access_* 新体系。
"""
import logging
import secrets
from urllib.parse import urlencode

from flask import Blueprint, current_app, redirect, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.application.access.token_pair_service import PlatformTokenPairService, TokenPair
from app.di.utils import get_app_container
from app.extensions import db
from app.interfaces.api.middleware.auth import require_auth
from app.shared.exceptions import AuthenticationError
from app.shared.response import bad_request, error, success

bp = Blueprint("auth_api_v1", __name__, url_prefix="/api/v1/auth")
logger = logging.getLogger(__name__)
BOOTSTRAP_ADMIN_ROLES = ["platform_admin", "governance_admin", "semantic_admin", "viewer"]
DEFAULT_M2_DATA_ROLES = ["data_m0_reader", "data_m1_reader", "data_m2_detail_reader"]
_OAUTH_STATE_COOKIE = "cubic3_feishu_oauth_state"
# F6：semantic.write / data.write 门控语义域、数据域的 destructive 操作
# （发布域、发布语义、删除会话、提取任务执行与启停等）。
_ADMIN_UI_PERMISSIONS = [
    "access.read", "access.write", "access.audit.read", "access.gateway.read",
    "semantic.write", "data.write",
]

ACCESS_PERMISSIONS_BY_PLATFORM_ROLE = {
    "platform_admin": _ADMIN_UI_PERMISSIONS,
    "governance_admin": _ADMIN_UI_PERMISSIONS,
    "auditor": ["access.read", "access.audit.read", "access.gateway.read"],
    "viewer": [],
    # 单元测试辅助角色；生产权限事实源仍是 access_role_bindings。
    "admin": _ADMIN_UI_PERMISSIONS,
}


def _access_repository():
    return get_app_container().sql_access_repository()


def _access_service():
    return get_app_container().access_identity_service()


def _token_pair_service() -> PlatformTokenPairService:
    return PlatformTokenPairService(
        db.session,
        access_ttl_seconds=current_app.config.get("AUTH_ACCESS_TOKEN_TTL_SECONDS", 3600),
        refresh_ttl_seconds=current_app.config.get("AUTH_REFRESH_TOKEN_TTL_SECONDS", 2592000),
        authorization_code_ttl_seconds=current_app.config.get("AUTH_AUTHORIZATION_CODE_TTL_SECONDS", 300),
        role_resolver=_resolve_roles_for_token_refresh,
    )


def _issue_token_pair(
    *,
    principal_id: str,
    user_name: str,
    roles: list[str],
    auth_method: str,
    client_type: str = "web",
) -> TokenPair:
    pair = _token_pair_service().issue(
        principal_id=principal_id,
        user_name=user_name,
        roles=roles,
        auth_method=auth_method,
        client_type=client_type,
        user_agent=request.headers.get("User-Agent"),
        ip_address=_client_ip(),
    )
    db.session.commit()
    return pair


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


def _dedupe(values: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        item = str(value or "").strip()
        if not item or item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


def _split_identifier_config(value) -> list[str]:
    if not value:
        return []
    if isinstance(value, str):
        raw_values = value.replace("\n", ",").split(",")
    elif isinstance(value, (list, tuple, set)):
        raw_values = list(value)
    else:
        raw_values = [value]
    return _dedupe([str(item or "").strip() for item in raw_values])


def _config_bool(name: str, default: bool) -> bool:
    value = current_app.config.get(name)
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    normalized = str(value).strip().lower()
    if normalized in {"0", "false", "no", "off"}:
        return False
    if normalized in {"1", "true", "yes", "on"}:
        return True
    return default


def _feishu_default_m2_reader_ids() -> set[str]:
    identifiers = _split_identifier_config(current_app.config.get("FEISHU_M2_READER_OPEN_IDS", ""))
    if _config_bool("FEISHU_M2_READER_SYNC_CUBIC3_ALLOWLIST", True):
        try:
            from app.application.agent.agent_factory import get_data_agent_config

            config = get_data_agent_config() or {}
            identifiers.extend(_split_identifier_config(config.get("allowed_user_ids", [])))
        except Exception:
            logger.warning("读取 CUBIC3 飞书白名单失败，跳过默认 M2 权限同步", exc_info=True)
    return set(_dedupe(identifiers))


def _is_feishu_default_m2_reader(*, open_id: str | None, union_id: str | None, principal_id: str | None) -> bool:
    allowed_ids = _feishu_default_m2_reader_ids()
    if not allowed_ids:
        return False
    candidates = {item for item in [open_id, union_id, principal_id] if item}
    return bool(candidates & allowed_ids)


def _ui_permissions(platform_roles: list[str]) -> list[str]:
    permissions: list[str] = []
    for role in platform_roles:
        permissions.extend(ACCESS_PERMISSIONS_BY_PLATFORM_ROLE.get(role, []))
    return _dedupe(permissions)


def _resolve_current_access_context(principal_id: str | None, legacy_roles: list[str]) -> dict:
    """从 access role binding 解析前端门控需要的权限上下文。

    JWT roles 只做旧链路兼容；正常路径以 access_role_bindings 为事实源。
    """

    if not principal_id:
        return {
            "platform_roles": _dedupe(legacy_roles),
            "data_roles": [],
            "access_roles": _dedupe(legacy_roles),
            "permissions": _ui_permissions(_dedupe(legacy_roles)),
        }
    if current_app.config.get("TESTING") and principal_id == "test_admin":
        platform_roles = _dedupe(legacy_roles)
        return {
            "platform_roles": platform_roles,
            "data_roles": [],
            "access_roles": platform_roles,
            "permissions": _ui_permissions(platform_roles),
        }
    try:
        from app.application.access.identity import RoleBindingResolver

        context = RoleBindingResolver(_access_repository()).resolve_principal_context(
            principal_id=principal_id,
            actor_id=principal_id,
            actor_type="human",
            source="auth_me",
        )
        platform_roles = _dedupe(context.platform_roles or [])
        data_roles = _dedupe(context.data_roles or [])
    except Exception:
        logger.debug("解析当前用户 access role binding 失败，降级使用 JWT roles", exc_info=True)
        platform_roles = _dedupe(legacy_roles)
        data_roles = []
    access_roles = _dedupe([*platform_roles, *data_roles])
    return {
        "platform_roles": platform_roles,
        "data_roles": data_roles,
        "access_roles": access_roles,
        "permissions": _ui_permissions(platform_roles),
    }


def _resolve_roles_for_token_refresh(principal_id: str, fallback_roles: list[str]) -> list[str]:
    """Refresh Token 轮换时重新读取角色，避免权限撤销被旧会话缓存拖住。"""

    if current_app.config.get("TESTING") and principal_id == "test_admin":
        return _dedupe(fallback_roles)
    try:
        from app.application.access.identity import RoleBindingResolver

        context = RoleBindingResolver(_access_repository()).resolve_principal_context(
            principal_id=principal_id,
            actor_id=principal_id,
            actor_type="human",
            source="auth_refresh",
        )
        return _dedupe([*(context.platform_roles or []), *(context.data_roles or [])])
    except Exception:
        logger.debug("刷新 Token Pair 时解析角色失败，降级使用 refresh session 缓存角色", exc_info=True)
        return _dedupe(fallback_roles)


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

    pair = _issue_token_pair(
        principal_id=principal_id,
        user_name=username,
        roles=BOOTSTRAP_ADMIN_ROLES,
        auth_method="password",
        client_type=_client_type(),
    )
    return success(pair.to_dict(), message="登录成功")


@bp.post("/refresh")
def refresh_token():
    """使用 Refresh Token 轮换并签发新的 Token Pair。"""
    data = request.get_json(silent=True) or {}
    refresh_value = str(data.get("refresh_token") or "").strip()
    if not refresh_value:
        return bad_request("refresh_token 不能为空")
    try:
        pair = _token_pair_service().refresh(
            refresh_value,
            client_type=_client_type(),
            user_agent=request.headers.get("User-Agent"),
            ip_address=_client_ip(),
        )
        return success(pair.to_dict(), message="刷新成功")
    except AuthenticationError as exc:
        return error(exc.message, status=401, details={"code": exc.code})


@bp.post("/logout")
def logout():
    """撤销当前 Refresh Token。

    登出只依赖 refresh_token，便于 access token 过期后仍能清理服务端会话。
    """
    data = request.get_json(silent=True) or {}
    refresh_value = str(data.get("refresh_token") or "").strip()
    revoked = _token_pair_service().revoke(refresh_value) if refresh_value else False
    return success({"revoked": revoked}, message="已退出登录")


@bp.get("/feishu/authorize")
def feishu_authorize():
    """重定向到飞书 OAuth 授权页"""
    app_id = current_app.config.get("FEISHU_APP_ID")
    if not app_id:
        return error("飞书应用未配置", status=500)

    app_base_url = current_app.config.get("APP_BASE_URL", "http://localhost:5000")
    redirect_uri = f"{app_base_url}/api/v1/auth/feishu/callback"

    state = _signed_oauth_state(_client_type())
    authorize_url = "https://open.feishu.cn/open-apis/authen/v1/authorize?" + urlencode({
        "app_id": app_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "state": state,
    })
    response = redirect(authorize_url)
    response.set_cookie(
        _OAUTH_STATE_COOKIE,
        state,
        max_age=int(current_app.config.get("AUTH_OAUTH_STATE_TTL_SECONDS", 600)),
        httponly=True,
        secure=bool(request.is_secure),
        samesite="Lax",
        path="/api/v1/auth/feishu",
    )
    return response


@bp.get("/feishu/callback")
def feishu_callback():
    """飞书 OAuth 回调：用 code 换取身份并签发 Token Pair。"""
    code = request.args.get("code")
    if not code:
        return _redirect_to_login(error="缺少授权码")

    try:
        client_type = _client_type_from_oauth_state(
            request.args.get("state"),
            request.cookies.get(_OAUTH_STATE_COOKIE),
        )
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
        if _is_feishu_default_m2_reader(open_id=open_id, union_id=union_id, principal_id=principal.principal_id):
            roles = _dedupe([*roles, *DEFAULT_M2_DATA_ROLES])
        service.ensure_principal_role_bindings(
            principal_id=principal.principal_id,
            roles=roles,
            source="feishu_sso",
            created_by=principal.principal_id,
        )

        if client_type == "cli":
            authorization_code = _token_pair_service().issue_authorization_code(
                principal_id=principal.principal_id,
                user_name=name,
                roles=roles,
                client_type="cli",
            )
            return _redirect_to_login(
                cli_code=authorization_code.code,
                code_expires_in=authorization_code.expires_in,
            )

        authorization_code = _token_pair_service().issue_authorization_code(
            principal_id=principal.principal_id,
            user_name=name,
            roles=roles,
            client_type="web",
        )
        return _redirect_to_login(
            code=authorization_code.code,
            code_expires_in=authorization_code.expires_in,
        )

    except Exception as e:
        logger.exception("飞书 SSO 登录失败")
        return _redirect_to_login(error=f"飞书登录失败: {str(e)}")


@bp.post("/feishu/exchange")
def feishu_exchange():
    """使用飞书回调生成的一次性 code 兑换 Token Pair。"""
    data = request.get_json(silent=True) or {}
    code = str(data.get("code") or "").strip()
    if not code:
        return bad_request("code 不能为空")
    try:
        pair = _token_pair_service().exchange_authorization_code(
            code,
            client_type=_client_type(),
            user_agent=request.headers.get("User-Agent"),
            ip_address=_client_ip(),
        )
        return success(pair.to_dict(), message="登录成功")
    except AuthenticationError as exc:
        return error(exc.message, status=401, details={"code": exc.code})


@bp.get("/me")
@require_auth
def me():
    """获取当前登录用户信息"""
    from flask import g
    principal_id = getattr(g, "principal_id", None) or getattr(g, "user_id", None)
    access_context = _resolve_current_access_context(principal_id, list(getattr(g, "user_roles", []) or []))
    return success({
        "user_id": g.user_id,
        "principal_id": principal_id,
        "user_name": g.user_name,
        "roles": g.user_roles,
        **access_context,
    })


def _client_type() -> str:
    value = (request.args.get("client") or request.headers.get("X-C3-Client-Type") or "web").strip().lower()
    return "cli" if value == "cli" else "web"


def _signed_oauth_state(client_type: str) -> str:
    serializer = URLSafeTimedSerializer(current_app.config.get("JWT_SECRET", "your-secret-key"))
    return serializer.dumps(
        {
            "client": "cli" if client_type == "cli" else "web",
            "nonce": secrets.token_urlsafe(16),
        },
        salt="feishu-oauth-state",
    )


def _client_type_from_oauth_state(state: str | None, expected_state: str | None) -> str:
    if not state or not expected_state or not secrets.compare_digest(state, expected_state):
        raise AuthenticationError(message="OAuth state 无效，请重新发起登录", code="INVALID_OAUTH_STATE")
    serializer = URLSafeTimedSerializer(current_app.config.get("JWT_SECRET", "your-secret-key"))
    try:
        payload = serializer.loads(
            state,
            salt="feishu-oauth-state",
            max_age=int(current_app.config.get("AUTH_OAUTH_STATE_TTL_SECONDS", 600)),
        )
    except SignatureExpired as exc:
        raise AuthenticationError(message="OAuth state 已过期，请重新发起登录", code="OAUTH_STATE_EXPIRED") from exc
    except BadSignature as exc:
        raise AuthenticationError(message="OAuth state 无效，请重新发起登录", code="INVALID_OAUTH_STATE") from exc
    client_type = str((payload or {}).get("client") or "web").strip().lower()
    return "cli" if client_type == "cli" else "web"


def _redirect_to_login(
    *,
    code: str | None = None,
    cli_code: str | None = None,
    code_expires_in: int | None = None,
    error: str | None = None,
) -> object:
    """构造重定向到前端登录页的响应"""
    app_base_url = current_app.config.get("APP_BASE_URL", "http://localhost:5000")
    params = {}
    if code:
        params["code"] = code
    if cli_code:
        params["cli_code"] = cli_code
    if code_expires_in is not None:
        params["code_expires_in"] = str(code_expires_in)
    if error:
        params["error"] = error
    url = f"{app_base_url}/login"
    if params:
        url += "?" + urlencode(params)
    response = redirect(url)
    response.delete_cookie(_OAUTH_STATE_COOKIE, path="/api/v1/auth/feishu")
    return response
