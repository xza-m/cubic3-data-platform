"""
统一错误处理中间件
"""
from flask import g, has_request_context, jsonify
from pydantic import ValidationError as PydanticValidationError
from werkzeug.exceptions import HTTPException
from app.shared.exceptions import (
    EntityNotFoundError,
    DomainException,
    ApplicationException,
    InfrastructureException,
    ValidationError,
    AuthenticationError,
    AuthorizationError
)
from app.shared.utils.logger import get_logger

logger = get_logger(__name__)


def _trace_id() -> str | None:
    if not has_request_context():
        return None
    return getattr(g, "request_id", None) or getattr(g, "trace_id", None)


def _error_payload(*, message: str, error_code: str | None = None, details=None) -> dict:
    payload: dict = {
        "code": -1,
        "message": message,
        "trace_id": _trace_id(),
    }
    if error_code:
        payload["error_code"] = error_code
    if details is not None:
        payload["details"] = details
    return payload


def register_error_handlers(app):
    """
    注册全局错误处理器
    
    Args:
        app: Flask 应用实例
    """
    
    @app.errorhandler(PydanticValidationError)
    def handle_pydantic_validation_error(e: PydanticValidationError):
        """Pydantic 请求体校验（400）"""
        logger.warning(f"Pydantic validation error: {e.errors()}")
        return jsonify(
            _error_payload(message="请求参数错误", details=e.errors())
        ), 400

    @app.errorhandler(ValidationError)
    def handle_validation_error(e: ValidationError):
        """处理验证错误（400）"""
        logger.warning(f"Validation error: {e.message}", details=e.details)
        return jsonify(
            _error_payload(message=e.message, error_code=e.code, details=e.details)
        ), 400
    
    @app.errorhandler(AuthenticationError)
    def handle_authentication_error(e: AuthenticationError):
        """处理认证错误（401）"""
        logger.warning(f"Authentication error: {e.message}")
        return jsonify(
            _error_payload(message=e.message, error_code=e.code)
        ), 401
    
    @app.errorhandler(AuthorizationError)
    def handle_authorization_error(e: AuthorizationError):
        """处理授权错误（403）"""
        logger.warning(f"Authorization error: {e.message}", details=e.details)
        return jsonify(
            _error_payload(message=e.message, error_code=e.code, details=e.details)
        ), 403
    
    @app.errorhandler(EntityNotFoundError)
    def handle_entity_not_found_error(e: EntityNotFoundError):
        """处理实体未找到错误（404）"""
        logger.warning(f"Entity not found: {e.message}", error_code=e.code, details=e.details)
        return jsonify(
            _error_payload(message=e.message, error_code=e.code, details=e.details)
        ), 404
    
    @app.errorhandler(DomainException)
    def handle_domain_exception(e: DomainException):
        """处理领域异常（400）"""
        logger.warning(f"Domain exception: {e.message}", error_code=e.code)
        return jsonify(
            _error_payload(message=e.message, error_code=e.code, details=e.details)
        ), 400
    
    @app.errorhandler(ApplicationException)
    def handle_application_exception(e: ApplicationException):
        """处理应用异常（500）"""
        logger.error(f"Application exception: {e.message}", error_code=e.code, exc_info=True)
        return jsonify(
            _error_payload(message=e.message, error_code=e.code, details=e.details)
        ), 500
    
    @app.errorhandler(InfrastructureException)
    def handle_infrastructure_exception(e: InfrastructureException):
        """处理基础设施异常（503）"""
        logger.error(f"Infrastructure exception: {e.message}", error_code=e.code, exc_info=True)
        return jsonify(
            _error_payload(
                message="服务暂时不可用，请稍后重试",
                error_code=e.code,
                details=e.details,
            )
        ), 503
    
    @app.errorhandler(HTTPException)
    def handle_http_exception(e: HTTPException):
        """处理 HTTP 异常"""
        return jsonify(
            _error_payload(message=e.description or e.name)
        ), e.code
    
    @app.errorhandler(Exception)
    def handle_generic_exception(e: Exception):
        """处理未捕获的异常（500）"""
        logger.error(f"Unhandled exception: {e}", exc_info=True)
        payload = _error_payload(message="Internal server error")
        if app.config.get("DEBUG"):
            payload["error"] = str(e)
        return jsonify(payload), 500
