"""
执行上下文和结果数据结构
"""
from dataclasses import dataclass, field
from datetime import datetime
from app.shared.utils.time import utcnow
from enum import Enum
from typing import Dict, Any, Optional


class ExecutionStatus(str, Enum):
    """执行状态枚举"""
    PENDING = 'pending'
    RUNNING = 'running'
    SUCCESS = 'success'
    FAILED = 'failed'


class TriggerType(str, Enum):
    """触发类型枚举"""
    SCHEDULED = 'scheduled'  # 定时触发
    EVENT = 'event'  # 事件触发
    MANUAL = 'manual'  # 手动触发


@dataclass
class ExecutionContext:
    """
    执行上下文
    
    包含执行器运行所需的所有上下文信息
    """
    # 执行记录 ID
    execution_id: int
    
    # 应用实例 ID
    instance_id: int
    
    # 应用代码
    app_code: str
    
    # 实例名称
    instance_name: str
    
    # 配置参数
    config: Dict[str, Any]
    
    # 触发类型
    trigger_type: TriggerType
    
    # 触发者（用户ID）
    triggered_by: Optional[str] = None
    
    # 执行开始时间
    started_at: datetime = field(default_factory=utcnow)
    
    # 额外的上下文数据（如事件数据）
    extra_data: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ExecutionResult:
    """
    执行结果
    
    执行器返回的结果数据
    """
    # 执行状态
    status: ExecutionStatus
    
    # 执行结束时间
    ended_at: datetime = field(default_factory=utcnow)
    
    # 输出数据（成功时）
    output: Optional[Dict[str, Any]] = None
    
    # 错误信息（失败时）
    error_message: Optional[str] = None
    
    # 错误详情（失败时，用于调试）
    error_details: Optional[Dict[str, Any]] = None
    
    # 执行日志（可选）
    logs: list[str] = field(default_factory=list)
    
    def is_success(self) -> bool:
        """判断是否执行成功"""
        return self.status == ExecutionStatus.SUCCESS
    
    def is_failed(self) -> bool:
        """判断是否执行失败"""
        return self.status == ExecutionStatus.FAILED
    
    def add_log(self, message: str):
        """添加执行日志"""
        timestamp = utcnow().strftime('%Y-%m-%d %H:%M:%S')
        self.logs.append(f"[{timestamp}] {message}")


@dataclass
class ValidationResult:
    """
    配置验证结果
    """
    # 是否验证通过
    is_valid: bool
    
    # 验证错误信息（验证失败时）
    errors: Dict[str, list[str]] = field(default_factory=dict)
    
    # 验证警告信息（可选）
    warnings: Dict[str, list[str]] = field(default_factory=dict)
    
    def add_error(self, field: str, message: str):
        """添加验证错误"""
        if field not in self.errors:
            self.errors[field] = []
        self.errors[field].append(message)
        self.is_valid = False
    
    def add_warning(self, field: str, message: str):
        """添加验证警告"""
        if field not in self.warnings:
            self.warnings[field] = []
        self.warnings[field].append(message)
