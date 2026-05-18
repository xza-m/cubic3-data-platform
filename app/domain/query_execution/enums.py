from enum import Enum


class QueryJobStatus(str, Enum):
    """查询执行任务状态。"""

    QUEUED = "QUEUED"
    CLAIMED = "CLAIMED"
    SUBMITTING = "SUBMITTING"
    RUNNING = "RUNNING"
    FETCHING = "FETCHING"
    PERSISTING = "PERSISTING"
    SUCCEEDED = "SUCCEEDED"
    CANCELING = "CANCELING"
    CANCELED = "CANCELED"
    FAILED = "FAILED"


class ResultObjectStatus(str, Enum):
    """查询结果对象状态。"""

    DRAFT = "DRAFT"
    READY = "READY"
    EXPIRED = "EXPIRED"


class QueryRouteType(str, Enum):
    """查询来源类型。"""

    AGENT_SEMANTIC = "agent_semantic"
    MANUAL_SQL = "manual_sql"
    SCHEDULED_QUERY = "scheduled_query"
    APP_EXECUTION = "app_execution"


class PolicyExecutionDecision(str, Enum):
    """治理决策结果。"""

    ALLOW = "allow"
    DENY = "deny"
    APPROVAL_REQUIRED = "approval_required"

