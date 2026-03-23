"""
枚举常量定义
集中管理所有枚举类型
"""
from enum import Enum


# ============================================================================
# 任务相关枚举
# ============================================================================

class TaskStatus(str, Enum):
    """任务状态"""
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    TIMEOUT = "timeout"
    CANCELLED = "cancelled"


class TaskType(str, Enum):
    """任务类型"""
    MANUAL = "manual"        # 手动触发
    SCHEDULED = "scheduled"   # 定时调度
    API = "api"              # API触发


class RunType(str, Enum):
    """执行类型"""
    MANUAL = "manual"
    SCHEDULED = "scheduled"
    RETRY = "retry"


# ============================================================================
# 文件交付相关枚举
# ============================================================================

class DeliveryMethod(str, Enum):
    """交付方式"""
    LOCAL = "local"            # 本地下载
    FEISHU_FILE = "feishu_file"  # 飞书文件
    OSS = "oss"                # OSS预签名链接
    EMAIL = "email"            # 邮件发送


class FileFormat(str, Enum):
    """文件格式"""
    CSV = "csv"
    EXCEL = "excel"
    JSON = "json"


# ============================================================================
# 数据集相关枚举
# ============================================================================

class DatasetSyncStatus(str, Enum):
    """数据集同步状态"""
    SYNCED = "synced"    # 元数据已同步
    SYNCING = "syncing"  # 同步中
    FAILED = "failed"    # 同步失败


class FieldCategory(str, Enum):
    """字段类别"""
    PARTITION = "partition"
    DIMENSION = "dimension"
    METRIC = "metric"


class SensitivityLevel(str, Enum):
    """敏感级别"""
    PUBLIC = "public"
    INTERNAL = "internal"
    PII = "pii"              # Personally Identifiable Information
    CONFIDENTIAL = "confidential"
    SECRET = "secret"


class MaskRule(str, Enum):
    """脱敏规则"""
    MOBILE = "mobile"        # 手机号：138****5678
    EMAIL = "email"          # 邮箱：joh***@example.com
    ID_CARD = "id_card"      # 身份证：110101********1234
    NAME = "name"            # 姓名：张**
    AMOUNT = "amount"        # 金额：***
    FULL_MASK = "full_mask"  # 完全脱敏：***


# ============================================================================
# 数据源相关枚举
# ============================================================================

class DataSourceType(str, Enum):
    """数据源类型"""
    MAXCOMPUTE = "maxcompute"
    CLICKHOUSE = "clickhouse"
    MYSQL = "mysql"
    POSTGRESQL = "postgresql"
    HIVE = "hive"


class ConnectionStatus(str, Enum):
    """连接状态"""
    UNKNOWN = "unknown"
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    ERROR = "error"


class DatasetType(str, Enum):
    """数据集类型"""
    PHYSICAL = "physical"    # 物理表数据集（直接映射数据源表）
    VIRTUAL = "virtual"      # 虚拟数据集（基于 SQL 查询）
    FILE = "file"           # 文件数据集（从上传文件创建）


# ============================================================================
# 查询操作符枚举
# ============================================================================

class FilterOperator(str, Enum):
    """过滤操作符"""
    EQ = "="            # 等于
    NE = "!="           # 不等于
    GT = ">"            # 大于
    GTE = ">="          # 大于等于
    LT = "<"            # 小于
    LTE = "<="          # 小于等于
    IN = "IN"           # 包含
    NOT_IN = "NOT IN"   # 不包含
    LIKE = "LIKE"       # 模糊匹配
    NOT_LIKE = "NOT LIKE"
    BETWEEN = "BETWEEN"  # 区间
    IS_NULL = "IS NULL"
    IS_NOT_NULL = "IS NOT NULL"


class LogicOperator(str, Enum):
    """逻辑操作符"""
    AND = "AND"
    OR = "OR"


# ============================================================================
# 通知相关枚举
# ============================================================================

class NotificationChannel(str, Enum):
    """通知渠道"""
    FEISHU = "feishu"
    EMAIL = "email"
    WEBHOOK = "webhook"


class NotificationStatus(str, Enum):
    """通知状态"""
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
