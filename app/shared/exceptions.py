"""
统一异常定义
所有自定义异常都继承自这些基类
"""


# ============================================================================
# 基础异常类
# ============================================================================

class BaseAppException(Exception):
    """应用异常基类"""
    
    def __init__(self, message: str, code: str = None, details: dict = None):
        self.message = message
        self.code = code or self.__class__.__name__
        self.details = details or {}
        super().__init__(self.message)
    
    def to_dict(self):
        """转换为字典（用于API响应）"""
        return {
            'error': self.code,
            'message': self.message,
            'details': self.details
        }


# ============================================================================
# 领域层异常
# ============================================================================

class DomainException(BaseAppException):
    """领域层异常基类"""
    pass


class EntityNotFoundError(DomainException):
    """实体未找到"""
    pass


class InvalidOperationError(DomainException):
    """无效操作"""
    pass


class BusinessRuleViolationError(DomainException):
    """业务规则违反"""
    pass


# ============================================================================
# 应用层异常
# ============================================================================

class ApplicationException(BaseAppException):
    """应用层异常基类"""
    pass


class ValidationError(ApplicationException):
    """数据验证失败"""
    pass


class AuthenticationError(ApplicationException):
    """认证失败"""
    pass


class AuthorizationError(ApplicationException):
    """授权失败（无权限）"""
    pass


# ============================================================================
# 常用异常别名（向后兼容）
# ============================================================================

# NotFoundError 别名（指向 EntityNotFoundError）
NotFoundError = EntityNotFoundError

# NOTE: PermissionError alias removed — it shadows the built-in PermissionError.
# Use AuthorizationError directly instead.


# ============================================================================
# 基础设施层异常
# ============================================================================

class InfrastructureException(BaseAppException):
    """基础设施层异常基类"""
    pass


class DatabaseError(InfrastructureException):
    """数据库错误"""
    pass


class ExternalServiceError(InfrastructureException):
    """外部服务调用失败"""
    pass


class CacheError(InfrastructureException):
    """缓存操作失败"""
    pass


# ============================================================================
# 数据提取相关异常
# ============================================================================

class TaskNotFoundError(EntityNotFoundError):
    """提取任务未找到"""
    
    def __init__(self, task_id: int):
        super().__init__(
            message=f"Extraction task {task_id} not found",
            code="TASK_NOT_FOUND",
            details={'task_id': task_id}
        )


class TaskNotActiveError(BusinessRuleViolationError):
    """任务未激活"""
    
    def __init__(self, task_id: int):
        super().__init__(
            message=f"Task {task_id} is not active",
            code="TASK_NOT_ACTIVE",
            details={'task_id': task_id}
        )


class DatasetNotFoundError(EntityNotFoundError):
    """数据集未找到"""
    
    def __init__(self, dataset_id: int):
        super().__init__(
            message=f"Dataset {dataset_id} not found",
            code="DATASET_NOT_FOUND",
            details={'dataset_id': dataset_id}
        )


class InvalidFieldsError(ValidationError):
    """无效字段"""
    
    def __init__(self, invalid_fields: list):
        super().__init__(
            message=f"Invalid fields: {', '.join(invalid_fields)}",
            code="INVALID_FIELDS",
            details={'invalid_fields': invalid_fields}
        )


class SQLGenerationError(ApplicationException):
    """SQL生成失败"""
    pass


class DataSourceConnectionError(ExternalServiceError):
    """数据源连接失败"""
    
    def __init__(self, source_type: str, error_message: str):
        super().__init__(
            message=f"Failed to connect to {source_type}: {error_message}",
            code="DATASOURCE_CONNECTION_ERROR",
            details={'source_type': source_type, 'error': error_message}
        )


class FileDeliveryError(InfrastructureException):
    """文件交付失败"""
    pass
