"""
认证中间件
"""
from functools import wraps
from datetime import timedelta
from flask import request, g, current_app
import jwt
from app.shared.exceptions import AuthenticationError, AuthorizationError
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


def _decode_access_payload(token: str) -> dict:
    """解码并强制校验平台 Access Token 语义。"""
    jwt_secret = current_app.config.get('JWT_SECRET', 'your-secret-key')
    payload = jwt.decode(token, jwt_secret, algorithms=['HS256'])
    if payload.get('token_use') != 'access':
        raise AuthenticationError(
            message="Invalid token type",
            code="INVALID_TOKEN_TYPE"
        )
    return payload


def require_auth(func):
    """
    JWT 认证装饰器
    
    Usage:
        @app.route('/api/v1/tasks')
        @require_auth
        def list_tasks():
            user_id = g.user_id
            ...
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        # 从 Header 获取 Token
        auth_header = request.headers.get('Authorization', '')
        
        if not auth_header.startswith('Bearer '):
            raise AuthenticationError(
                message="Missing authentication token",
                code="MISSING_TOKEN"
            )
        
        token = auth_header.replace('Bearer ', '')
        
        try:
            payload = _decode_access_payload(token)

            # 将用户信息注入到 Flask g 对象
            g.user_id = payload.get('user_id')
            g.principal_id = payload.get('principal_id') or payload.get('user_id')
            g.user_name = payload.get('user_name')
            g.user_roles = payload.get('roles', [])
            
            logger.debug(f"User authenticated: {g.user_id}")
            
            return func(*args, **kwargs)
        
        except jwt.ExpiredSignatureError:
            raise AuthenticationError(
                message="Token has expired",
                code="TOKEN_EXPIRED"
            )
        
        except jwt.InvalidTokenError as e:
            raise AuthenticationError(
                message=f"Invalid token: {str(e)}",
                code="INVALID_TOKEN"
            )
    
    return wrapper


def optional_auth(func):
    """
    可选认证装饰器（如果有 Token 则验证，没有则放行）
    
    Usage:
        @app.route('/api/v1/public/datasets')
        @optional_auth
        def list_public_datasets():
            user_id = getattr(g, 'user_id', None)  # 可能为 None
            ...
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        
        if auth_header.startswith('Bearer '):
            token = auth_header.replace('Bearer ', '')
            
            try:
                payload = _decode_access_payload(token)
                
                g.user_id = payload.get('user_id')
                g.principal_id = payload.get('principal_id') or payload.get('user_id')
                g.user_name = payload.get('user_name')
                g.user_roles = payload.get('roles', [])

            except Exception as e:
                logger.warning(f"Optional auth failed: {e}")
                g.user_id = None
                g.principal_id = None
                g.user_name = None
                g.user_roles = []
        else:
            g.user_id = None
            g.principal_id = None
            g.user_name = None
            g.user_roles = []
        
        return func(*args, **kwargs)
    
    return wrapper


def require_roles(*allowed_roles: str):
    """
    基于角色的访问控制装饰器（RBAC）。

    在 ``require_auth`` 的基础上叠加角色检查：

    - 未携带 / 无效 Bearer Token  → 401 ``AuthenticationError``
    - 已认证但角色不在 ``allowed_roles`` 中 → 403 ``AuthorizationError``
    - 角色匹配 → 调用被装饰函数

    Usage::

        @bp.route('/cubes', methods=['POST'])
        @require_roles('admin')
        def create_cube():
            ...

    Args:
        *allowed_roles: 允许访问的角色名集合，至少匹配其中一个即放行。
                        若为空，则等价于 ``require_auth``（仅校验登录）。

    Returns:
        Flask 视图装饰器。
    """
    allowed = {r for r in allowed_roles if r}

    def decorator(func):
        @wraps(func)
        @require_auth
        def wrapper(*args, **kwargs):
            if allowed:
                user_roles = set(getattr(g, 'user_roles', []) or [])
                if not (allowed & user_roles):
                    raise AuthorizationError(
                        message="Insufficient permissions",
                        code="INSUFFICIENT_ROLE",
                        details={
                            'required_roles': sorted(allowed),
                            'user_roles': sorted(user_roles),
                        }
                    )
            return func(*args, **kwargs)
        return wrapper

    return decorator


def _resolve_access_roles(principal_id: str | None) -> set[str]:
    """从 access role binding 解析平台角色。

    JWT 中的业务角色只作为 legacy API 的输入，不作为新权限体系的事实源。
    测试环境下 `install_default_admin_auth` 使用固定 `test_admin`，这里保留最小测试入口，
    避免每个集成测试重复造 Principal/RoleBinding。
    """

    if not principal_id:
        return set()
    if current_app.config.get("TESTING") and principal_id == "test_admin":
        return set(getattr(g, "user_roles", []) or [])
    try:
        from app.application.access.identity import RoleBindingResolver
        from app.extensions import db
        from app.infrastructure.access.repositories import SqlAccessRepository

        context = RoleBindingResolver(SqlAccessRepository(db.session)).resolve_principal_context(
            principal_id=principal_id,
            actor_id=principal_id,
            actor_type="human",
            source="access_middleware",
        )
        return set(context.platform_roles or [])
    except Exception:
        logger.debug("access role binding resolve failed", exc_info=True)
        return set()


def require_access_roles(*allowed_roles: str):
    """基于统一 access role binding 的平台权限校验。"""

    allowed = {role for role in allowed_roles if role}

    def decorator(func):
        @wraps(func)
        @require_auth
        def wrapper(*args, **kwargs):
            if allowed:
                principal_id = getattr(g, "principal_id", None) or getattr(g, "user_id", None)
                access_roles = _resolve_access_roles(principal_id)
                if not (allowed & access_roles):
                    raise AuthorizationError(
                        message="Insufficient permissions",
                        code="INSUFFICIENT_ROLE",
                        details={
                            "required_roles": sorted(allowed),
                            "principal_roles": sorted(access_roles),
                        },
                    )
            return func(*args, **kwargs)

        return wrapper

    return decorator


def require_identity(func):
    """仅要求已认证，并归一出 Principal ID。"""

    @wraps(func)
    @require_auth
    def wrapper(*args, **kwargs):
        user_id = getattr(g, "user_id", None)
        if current_app.config.get("TESTING") and user_id == "test_user_admin":
            g.principal_id = "internal:test:test_admin"
        else:
            g.principal_id = getattr(g, "principal_id", None) or user_id
        if not getattr(g, "principal_id", None):
            raise AuthenticationError(
                message="Missing authenticated principal",
                code="MISSING_PRINCIPAL",
            )
        return func(*args, **kwargs)

    return wrapper


def require_admin(func):
    """
    便捷装饰器：等价于 ``@require_roles('admin')``。

    用于所有写操作（POST/PUT/PATCH/DELETE）的管理员权限校验。
    """
    return require_access_roles('platform_admin', 'governance_admin', 'admin')(func)


def generate_access_token(
    *,
    principal_id: str,
    user_name: str,
    roles: list | None = None,
    session_id: str | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    """生成平台 Access Token。"""
    import secrets
    from app.shared.utils.time import utcnow

    jwt_secret = current_app.config.get('JWT_SECRET', 'your-secret-key')
    now = utcnow()
    expires_at = now + (expires_delta or timedelta(seconds=current_app.config.get('AUTH_ACCESS_TOKEN_TTL_SECONDS', 3600)))
    payload = {
        'user_id': principal_id,
        'principal_id': principal_id,
        'user_name': user_name,
        'roles': roles or [],
        'token_use': 'access',
        'sid': session_id,
        'jti': 'atk_' + secrets.token_hex(16),
        'iat': now,
        'exp': expires_at,
    }

    return jwt.encode(payload, jwt_secret, algorithm='HS256')
