"""
数据源Pydantic Schemas
"""
from typing import Optional, Dict, Any, List
from datetime import datetime
from pydantic import BaseModel, Field, field_validator, ConfigDict


class DatasourceBase(BaseModel):
    """数据源基础Schema"""
    name: str = Field(..., min_length=1, max_length=100, description="数据源名称")
    source_type: str = Field(..., description="数据源类型")
    description: Optional[str] = Field(None, description="描述")


class CreateDatasourceRequest(DatasourceBase):
    """创建数据源请求"""
    connection_config: Dict[str, Any] = Field(..., description="连接配置")
    extra_config: Optional[Dict[str, Any]] = Field(default_factory=dict, description="额外配置")
    
    @field_validator('source_type')
    @classmethod
    def validate_source_type(cls, v: str) -> str:
        allowed_types = ['maxcompute', 'clickhouse', 'postgresql', 'mysql']
        if v not in allowed_types:
            raise ValueError(f'source_type must be one of {allowed_types}')
        return v


class UpdateDatasourceRequest(BaseModel):
    """更新数据源请求"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    connection_config: Optional[Dict[str, Any]] = None
    extra_config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class DatasourceResponse(DatasourceBase):
    """数据源响应"""
    id: int
    connection_config: Dict[str, Any]
    extra_config: Dict[str, Any]
    is_active: bool
    connection_status: str
    last_test_at: Optional[datetime]
    last_test_error: Optional[str]
    created_by: str
    created_by_display_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class DatasourceListResponse(BaseModel):
    """数据源列表响应"""
    items: List[DatasourceResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class TestConnectionResponse(BaseModel):
    """测试连接响应"""
    success: bool
    message: str
    details: Optional[Dict[str, Any]] = None


class StatisticsResponse(BaseModel):
    """统计信息响应"""
    total: int
    active: int
    connected: int
    inactive: int
    by_type: Dict[str, int]
