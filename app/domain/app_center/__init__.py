"""
应用中心领域层

职责：
1. 定义应用执行器抽象接口
2. 定义执行上下文和结果数据结构
3. 提供应用中心相关的领域服务
"""

from .executor import AppExecutor, ExecutorFactory
from .execution_context import ExecutionContext, ExecutionResult, ExecutionStatus, TriggerType

__all__ = [
    'AppExecutor',
    'ExecutorFactory',
    'ExecutionContext',
    'ExecutionResult',
    'ExecutionStatus',
    'TriggerType',
]
