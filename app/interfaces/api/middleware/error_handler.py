"""
统一错误处理中间件
"""
from flask import jsonify
from werkzeug.exceptions import HTTPException
from app.shared.exceptions import (
    BaseAppException,
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


def register_error_handlers(app):
    """
    注册全局错误处理器
    
    Args:
        app: Flask 应用实例
    """
    
    @app.errorhandler(ValidationError)
    def handle_validation_error(e: ValidationError):
        """处理验证错误（400）"""
        logger.warning(f"Validation error: {e.message}", details=e.details)
        return jsonify({
            'code': -1,
            'message': e.message,
            'error_code': e.code,
            'details': e.details
        }), 400
    
    @app.errorhandler(AuthenticationError)
    def handle_authentication_error(e: AuthenticationError):
        """处理认证错误（401）"""
        logger.warning(f"Authentication error: {e.message}")
        return jsonify({
            'code': -1,
            'message': e.message,
            'error_code': e.code
        }), 401
    
    @app.errorhandler(AuthorizationError)
    def handle_authorization_error(e: AuthorizationError):
        """处理授权错误（403）"""
        logger.warning(f"Authorization error: {e.message}", details=e.details)
        return jsonify({
            'code': -1,
            'message': e.message,
            'error_code': e.code,
            'details': e.details
        }), 403
    
    @app.errorhandler(EntityNotFoundError)
    def handle_entity_not_found_error(e: EntityNotFoundError):
        """处理实体未找到错误（404）"""
        logger.warning(f"Entity not found: {e.message}", error_code=e.code, details=e.details)
        return jsonify({
            'code': -1,
            'message': e.message,
            'error_code': e.code,
            'details': e.details
        }), 404
    
    @app.errorhandler(DomainException)
    def handle_domain_exception(e: DomainException):
        """处理领域异常（400）"""
        logger.warning(f"Domain exception: {e.message}", error_code=e.code)
        return jsonify({
            'code': -1,
            'message': e.message,
            'error_code': e.code,
            'details': e.details
        }), 400
    
    @app.errorhandler(ApplicationException)
    def handle_application_exception(e: ApplicationException):
        """处理应用异常（500）"""
        logger.error(f"Application exception: {e.message}", error_code=e.code, exc_info=True)
        return jsonify({
            'code': -1,
            'message': e.message,
            'error_code': e.code
        }), 500
    
    @app.errorhandler(InfrastructureException)
    def handle_infrastructure_exception(e: InfrastructureException):
        """处理基础设施异常（503）"""
        logger.error(f"Infrastructure exception: {e.message}", error_code=e.code, exc_info=True)
        return jsonify({
            'code': -1,
            'message': '服务暂时不可用，请稍后重试',
            'error_code': e.code
        }), 503
    
    @app.errorhandler(HTTPException)
    def handle_http_exception(e: HTTPException):
        """处理 HTTP 异常"""
        return jsonify({
            'code': -1,
            'message': e.description
        }), e.code
    
    @app.errorhandler(Exception)
    def handle_generic_exception(e: Exception):
        """处理未捕获的异常（500）"""
        logger.error(f"Unhandled exception: {e}", exc_info=True)
        return jsonify({
            'code': -1,
            'message': 'Internal server error',
            'error': str(e) if app.config.get('DEBUG') else None
        }), 500
