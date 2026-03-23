"""
结构化日志工具
支持 JSON 格式输出，便于日志聚合和分析
"""
import logging
import json
import sys
import os
from datetime import datetime
from app.shared.utils.time import utcnow
from typing import Any, Dict, Optional
from contextvars import ContextVar

# 上下文变量用于跟踪请求 ID 和用户 ID
request_id_var: ContextVar[Optional[str]] = ContextVar('request_id', default=None)
user_id_var: ContextVar[Optional[str]] = ContextVar('user_id', default=None)


class StructuredLogger:
    """结构化日志器
    
    特性：
    - JSON 格式输出
    - 自动包含请求 ID 和用户 ID（从上下文变量）
    - 支持自定义字段
    - 兼容标准 logging 接口
    """
    
    def __init__(self, name: str, level: Optional[str] = None):
        self.logger = logging.getLogger(name)
        # 如果未指定级别，使用环境变量或默认 INFO
        if level is None:
            level = os.getenv('LOG_LEVEL', 'INFO')
        self.logger.setLevel(getattr(logging, level.upper()))
        
        # 配置处理器（避免重复添加）
        if not self.logger.handlers:
            handler = logging.StreamHandler(sys.stdout)
            handler.setFormatter(StructuredFormatter())
            self.logger.addHandler(handler)
        
        # 禁止日志传播到父 logger（避免重复输出）
        self.logger.propagate = False
    
    def _log(self, level: str, message: str, **kwargs):
        """内部日志方法"""
        # 提取标准 logging 参数
        exc_info = kwargs.pop('exc_info', False)
        stack_info = kwargs.pop('stack_info', False)
        stacklevel = kwargs.pop('stacklevel', 1)
        
        # 自动包含上下文信息
        extra = {
            'timestamp': utcnow().isoformat(),
            'level': level,
        }
        
        # 添加请求 ID 和用户 ID（如果存在）
        request_id = request_id_var.get()
        if request_id:
            extra['request_id'] = request_id
        
        user_id = user_id_var.get()
        if user_id:
            extra['user_id'] = user_id
        
        # 合并自定义字段
        extra.update(kwargs)
        
        getattr(self.logger, level.lower())(
            message, 
            extra=extra,
            exc_info=exc_info,
            stack_info=stack_info,
            stacklevel=stacklevel + 1  # 调整堆栈级别
        )
    
    def debug(self, message: str, **kwargs):
        """调试日志"""
        self._log('DEBUG', message, **kwargs)
    
    def info(self, message: str, **kwargs):
        """信息日志"""
        self._log('INFO', message, **kwargs)
    
    def warning(self, message: str, **kwargs):
        """警告日志"""
        self._log('WARNING', message, **kwargs)
    
    def error(self, message: str, **kwargs):
        """错误日志"""
        self._log('ERROR', message, **kwargs)
    
    def critical(self, message: str, **kwargs):
        """严重错误日志"""
        self._log('CRITICAL', message, **kwargs)
    
    def exception(self, message: str, **kwargs):
        """异常日志（自动包含堆栈信息）"""
        kwargs['exc_info'] = True
        self._log('ERROR', message, **kwargs)
    
    def with_context(self, **context) -> 'LoggerContext':
        """创建带上下文的日志器
        
        用法：
            with logger.with_context(user_id="123", action="login"):
                logger.info("用户登录")  # 自动包含 user_id 和 action
        """
        return LoggerContext(self, context)


class LoggerContext:
    """日志上下文管理器"""
    
    def __init__(self, logger: StructuredLogger, context: Dict[str, Any]):
        self.logger = logger
        self.context = context
        self.original_log = None
    
    def __enter__(self):
        # 保存原始 _log 方法
        self.original_log = self.logger._log
        
        # 创建新的 _log 方法，自动包含上下文
        def _log_with_context(level: str, message: str, **kwargs):
            kwargs.update(self.context)
            self.original_log(level, message, **kwargs)
        
        self.logger._log = _log_with_context
        return self.logger
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        # 恢复原始 _log 方法
        self.logger._log = self.original_log


class StructuredFormatter(logging.Formatter):
    """结构化日志格式化器
    
    输出格式：
    - 开发环境：人类可读的格式
    - 生产环境：JSON 格式（便于日志聚合）
    """
    
    def __init__(self, json_format: bool = True):
        super().__init__()
        self.json_format = json_format or os.getenv('LOG_FORMAT', 'json').lower() == 'json'
    
    def format(self, record: logging.LogRecord) -> str:
        """格式化日志"""
        log_entry = {
            'timestamp': utcnow().isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'module': record.module,
            'function': record.funcName,
            'line': record.lineno
        }
        
        # 添加额外字段
        if hasattr(record, 'timestamp'):
            log_entry['timestamp'] = record.timestamp
        
        # 添加异常信息
        if record.exc_info:
            log_entry['exception'] = self.formatException(record.exc_info)
        
        # 添加自定义字段（排除标准字段）
        # 注意: 这些是 Python logging 的保留字段，不能作为自定义字段使用
        excluded_keys = {
            'name', 'msg', 'args', 'created', 'filename', 'funcName',
            'levelname', 'lineno', 'module', 'msecs', 'message', 
            'pathname', 'process', 'processName', 'relativeCreated',
            'thread', 'threadName', 'exc_info', 'exc_text', 'stack_info',
            'timestamp', 'level', 'taskName', 'asctime', 'stack', 
            'levelno', 'exc_message'
        }
        
        for key, value in record.__dict__.items():
            if key not in excluded_keys:
                log_entry[key] = value
        
        # 返回 JSON 或人类可读格式
        if self.json_format:
            return json.dumps(log_entry, ensure_ascii=False)
        else:
            # 人类可读格式
            parts = [
                f"{log_entry['timestamp']}",
                f"[{log_entry['level']}]",
                f"{log_entry['logger']}",
                f"- {log_entry['message']}"
            ]
            
            # 添加自定义字段
            custom_fields = {k: v for k, v in log_entry.items() 
                           if k not in ['timestamp', 'level', 'logger', 'message', 
                                       'module', 'function', 'line', 'exception']}
            if custom_fields:
                parts.append(f"| {json.dumps(custom_fields, ensure_ascii=False)}")
            
            # 添加异常信息
            if 'exception' in log_entry:
                parts.append(f"\n{log_entry['exception']}")
            
            return ' '.join(parts)


# ============================================================================
# 便捷函数
# ============================================================================

def get_logger(name: str, level: Optional[str] = None) -> StructuredLogger:
    """获取结构化日志器
    
    Args:
        name: 日志器名称（通常使用 __name__）
        level: 日志级别（默认从环境变量 LOG_LEVEL 读取）
    
    Returns:
        StructuredLogger 实例
    
    用法：
        logger = get_logger(__name__)
        logger.info("应用启动", version="1.0.0")
    """
    return StructuredLogger(name, level)


def set_request_context(request_id: Optional[str] = None, user_id: Optional[str] = None):
    """设置请求上下文
    
    通常在 Flask before_request 钩子中调用
    
    Args:
        request_id: 请求 ID（用于追踪）
        user_id: 用户 ID
    """
    if request_id:
        request_id_var.set(request_id)
    if user_id:
        user_id_var.set(user_id)


def clear_request_context():
    """清除请求上下文
    
    通常在 Flask teardown_request 钩子中调用
    """
    request_id_var.set(None)
    user_id_var.set(None)


def configure_root_logger(level: Optional[str] = None, json_format: bool = True):
    """配置根日志器
    
    Args:
        level: 日志级别（默认从环境变量 LOG_LEVEL 读取）
        json_format: 是否使用 JSON 格式（默认 True）
    """
    if level is None:
        level = os.getenv('LOG_LEVEL', 'INFO')
    
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level.upper()))
    
    # 移除现有处理器
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    # 添加新处理器
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(StructuredFormatter(json_format=json_format))
    root_logger.addHandler(handler)


# 默认日志器
default_logger = get_logger(__name__)
