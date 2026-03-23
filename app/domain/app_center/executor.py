"""
应用执行器抽象

定义执行器接口和工厂
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, Type, Optional
from .execution_context import ExecutionContext, ExecutionResult, ValidationResult


class AppExecutor(ABC):
    """
    应用执行器抽象基类
    
    所有应用执行器都必须继承此类并实现以下方法：
    1. execute() - 执行应用逻辑
    2. validate_config() - 验证配置参数
    3. get_config_schema() - 获取配置表单 JSON Schema
    """
    
    @abstractmethod
    def execute(self, context: ExecutionContext) -> ExecutionResult:
        """
        执行应用逻辑
        
        Args:
            context: 执行上下文（包含配置、实例信息等）
        
        Returns:
            ExecutionResult: 执行结果
        
        Raises:
            Exception: 执行过程中的任何异常都应该被捕获并转换为 ExecutionResult
        """
        pass
    
    @abstractmethod
    def validate_config(self, config: Dict[str, Any]) -> ValidationResult:
        """
        验证配置参数
        
        Args:
            config: 配置参数字典
        
        Returns:
            ValidationResult: 验证结果
        """
        pass
    
    @abstractmethod
    def get_config_schema(self) -> Dict[str, Any]:
        """
        获取配置表单 JSON Schema
        
        Returns:
            Dict: JSON Schema 对象
        """
        pass
    
    def get_app_code(self) -> str:
        """
        获取应用代码（默认从类名推导）
        
        子类可以重写此方法以提供自定义应用代码
        """
        # 默认：将类名从驼峰命名转换为下划线命名
        # 如：BiDashboardPushExecutor -> bi_dashboard_push_executor
        # 然后移除 _executor 后缀 -> bi_dashboard_push
        class_name = self.__class__.__name__
        
        # 驼峰转下划线
        import re
        snake_case = re.sub(r'(?<!^)(?=[A-Z])', '_', class_name).lower()
        
        # 移除 _executor 后缀
        if snake_case.endswith('_executor'):
            snake_case = snake_case[:-9]
        
        return snake_case
    
    def supports_event_trigger(self) -> bool:
        """
        是否支持事件触发
        
        Returns:
            bool: True 表示支持事件触发
        """
        return False
    
    def get_supported_events(self) -> list[str]:
        """
        获取支持的事件类型列表
        
        Returns:
            list[str]: 事件类型列表（如 ['extraction.completed', 'extraction.failed']）
        """
        return []


class ExecutorFactory:
    """
    执行器工厂
    
    负责根据应用代码创建对应的执行器实例
    """
    
    _executors: Dict[str, Type[AppExecutor]] = {}
    
    @classmethod
    def register(cls, app_code: str, executor_class: Type[AppExecutor]):
        """
        注册执行器
        
        Args:
            app_code: 应用代码
            executor_class: 执行器类
        """
        cls._executors[app_code] = executor_class
    
    @classmethod
    def create(cls, app_code: str) -> Optional[AppExecutor]:
        """
        创建执行器实例
        
        Args:
            app_code: 应用代码
        
        Returns:
            AppExecutor: 执行器实例，如果未找到则返回 None
        """
        executor_class = cls._executors.get(app_code)
        if executor_class is None:
            return None
        
        return executor_class()
    
    @classmethod
    def get_registered_apps(cls) -> list[str]:
        """
        获取所有已注册的应用代码列表
        
        Returns:
            list[str]: 应用代码列表
        """
        return list(cls._executors.keys())
    
    @classmethod
    def is_registered(cls, app_code: str) -> bool:
        """
        检查应用是否已注册
        
        Args:
            app_code: 应用代码
        
        Returns:
            bool: True 表示已注册
        """
        return app_code in cls._executors


# 装饰器：自动注册执行器
def register_executor(app_code: str):
    """
    执行器注册装饰器
    
    用法:
    @register_executor('bi_dashboard_push')
    class BiDashboardPushExecutor(AppExecutor):
        ...
    
    Args:
        app_code: 应用代码
    """
    def decorator(executor_class: Type[AppExecutor]):
        ExecutorFactory.register(app_code, executor_class)
        return executor_class
    return decorator
