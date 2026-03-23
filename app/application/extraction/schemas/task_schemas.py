"""
提取任务相关 Pydantic Schemas
用于请求验证和响应序列化
"""
from pydantic import BaseModel, Field, field_validator, ConfigDict
from datetime import datetime
from typing import List, Dict, Any, Optional


# ============================================================================
# 请求 Schemas
# ============================================================================

class CreateTaskRequest(BaseModel):
    """创建任务请求"""
    model_config = ConfigDict(json_schema_extra={
        "example": {
            "task_name": "每日订单提取",
            "dataset_id": 1,
            "select_fields": ["ds", "order_id", "amount"],
            "filter_conditions": {
                "logic": "AND",
                "filters": [
                    {"field": "ds", "operator": "=", "value": "20231201"}
                ],
            },
            "row_limit": 50000,
            "task_type": "manual",
            "subscription_config": {"feishu_chat_id": "oc_xxx"},
        }
    })

    task_name: str = Field(..., min_length=1, max_length=200, description="任务名称")
    dataset_id: int = Field(..., gt=0, description="数据集ID")
    select_fields: List[str] = Field(default=[], description="选择的字段列表，空数组表示选择所有字段")
    filter_conditions: Dict[str, Any] = Field(default={}, description="过滤条件")
    row_limit: int = Field(default=500000, gt=0, le=1000000, description="行数限制")
    task_type: str = Field(default="manual", description="任务类型")
    schedule_config: Optional[Dict[str, Any]] = Field(default=None, description="调度配置")
    subscription_config: Optional[Dict[str, Any]] = Field(default=None, description="订阅配置")

    @field_validator('task_type')
    @classmethod
    def validate_task_type(cls, v: str) -> str:
        valid_types = ['manual', 'scheduled', 'api']
        if v not in valid_types:
            raise ValueError(f"Invalid task_type: {v}. Must be one of {valid_types}")
        return v


class UpdateTaskRequest(BaseModel):
    """更新任务请求"""
    task_name: Optional[str] = Field(None, min_length=1, max_length=200)
    select_fields: Optional[List[str]] = Field(None, min_length=1)
    filter_conditions: Optional[Dict[str, Any]] = None
    row_limit: Optional[int] = Field(None, gt=0, le=1000000)
    schedule_config: Optional[Dict[str, Any]] = None
    subscription_config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class ExecuteTaskRequest(BaseModel):
    """执行任务请求"""
    triggered_by: Optional[str] = Field(None, description="触发人")


# ============================================================================
# 响应 Schemas
# ============================================================================

class TaskListItemSchema(BaseModel):
    """任务列表项（读操作优化）"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    task_name: str
    task_code: str
    dataset_id: int
    task_type: str
    is_active: bool
    last_run_at: Optional[datetime] = None
    last_run_status: Optional[str] = None
    created_at: datetime


class TaskDetailSchema(BaseModel):
    """任务详情（完整字段）"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    task_name: str
    task_code: str
    dataset_id: int
    select_fields: List[str]
    filter_conditions: Dict[str, Any]
    sql_template: Optional[str] = None
    row_limit: int
    task_type: str
    schedule_config: Optional[Dict[str, Any]] = None
    subscription_config: Optional[Dict[str, Any]] = None
    is_active: bool
    last_run_at: Optional[datetime] = None
    last_run_status: Optional[str] = None
    created_by: str
    created_at: datetime
    updated_at: datetime


class TaskStatsSchema(BaseModel):
    """任务统计信息"""
    model_config = ConfigDict(from_attributes=True)

    total_runs: int
    success_rate: float
    avg_duration_ms: Optional[int] = None
    last_success_at: Optional[datetime] = None


# ============================================================================
# 执行结果 Schemas
# ============================================================================

class ExecutionResultSchema(BaseModel):
    """执行结果"""
    model_config = ConfigDict(from_attributes=True)

    run_id: int
    status: str
    message: str
    job_id: Optional[str] = None


class RunDetailSchema(BaseModel):
    """执行记录详情"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    task_id: int
    run_type: str
    triggered_by: str
    status: str
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration_ms: Optional[int] = None
    row_count: Optional[int] = None
    result_file_path: Optional[str] = None
    result_size_mb: Optional[float] = None
    delivery_method: Optional[str] = None
    delivery_info: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    created_at: datetime


# ============================================================================
# 通用响应 Schemas
# ============================================================================

class PaginatedResponse(BaseModel):
    """分页响应"""
    items: List[Any]
    total: int
    page: int
    page_size: int
    total_pages: int


class ApiResponse(BaseModel):
    """统一 API 响应格式"""
    code: int = Field(default=0, description="响应码，0表示成功")
    message: str = Field(default="success", description="响应消息")
    data: Optional[Any] = Field(default=None, description="响应数据")
