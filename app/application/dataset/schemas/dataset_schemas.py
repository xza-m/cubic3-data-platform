"""
数据集Pydantic Schemas
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, model_validator, field_validator, ConfigDict


class DatasetFieldSchema(BaseModel):
    """数据集字段Schema"""
    physical_name: str = Field(..., description="物理字段名")
    data_type: str = Field(..., description="数据类型")
    display_name: Optional[str] = Field(None, description="显示名称")
    business_type: str = Field(default='dimension', description="业务类型")
    sensitivity_level: str = Field(default='public', description="敏感级别")
    is_sensitive: bool = Field(default=False, description="是否敏感")
    mask_rule: Optional[str] = Field(None, description="脱敏规则")
    comment: Optional[str] = Field(None, description="字段备注")
    field_order: int = Field(default=0, description="字段顺序")

    @field_validator('business_type')
    @classmethod
    def validate_business_type(cls, value: str) -> str:
        allowed = {'partition', 'dimension', 'metric'}
        if value not in allowed:
            raise ValueError(f"business_type 必须为 {sorted(allowed)}")
        return value

    @field_validator('sensitivity_level')
    @classmethod
    def validate_sensitivity_level(cls, value: str) -> str:
        allowed = {'public', 'internal', 'pii', 'confidential', 'secret'}
        if value not in allowed:
            raise ValueError(f"sensitivity_level 必须为 {sorted(allowed)}")
        return value


class CreateDatasetRequest(BaseModel):
    """创建数据集请求"""
    dataset_code: Optional[str] = Field(None, min_length=1, max_length=100, description="数据集编码（可选，不提供时自动生成）")
    dataset_name: str = Field(..., min_length=1, max_length=200, description="数据集名称")
    source_id: Optional[int] = Field(None, description="数据源ID（文件数据集可选）")
    physical_table: Optional[str] = Field(None, description="物理表名（虚拟和文件数据集可选）")
    fields: List[DatasetFieldSchema] = Field(..., description="字段列表")
    description: Optional[str] = Field(None, description="描述")
    owner: Optional[str] = Field(None, description="负责人")
    dataset_type: str = Field(default='physical', description="数据集类型: physical/virtual/file")
    sql_query: Optional[str] = Field(None, description="SQL查询（虚拟数据集必填）")
    file_metadata: Optional[Dict[str, Any]] = Field(None, description="文件元数据（文件数据集必填）")

    @model_validator(mode='after')
    def validate_dataset_type_requirements(self):
        allowed_types = {'physical', 'virtual', 'file'}
        if self.dataset_type not in allowed_types:
            raise ValueError(f"dataset_type 必须为 {sorted(allowed_types)}")

        if self.dataset_type == 'physical':
            if not self.source_id or not self.physical_table:
                raise ValueError("physical 数据集必须包含 source_id 与 physical_table")
        elif self.dataset_type == 'virtual':
            if not self.source_id or not self.sql_query:
                raise ValueError("virtual 数据集必须包含 source_id 与 sql_query")
        elif self.dataset_type == 'file':
            if not self.file_metadata:
                raise ValueError("file 数据集必须包含 file_metadata")
        return self


class UpdateDatasetRequest(BaseModel):
    """更新数据集请求"""
    dataset_name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    owner: Optional[str] = None


class PreviewDatasetRequest(BaseModel):
    """预览数据集请求"""
    datasource_id: int
    database: str
    table: str


class DatasetResponse(BaseModel):
    """数据集响应"""
    id: int
    dataset_code: str
    dataset_name: str
    dataset_type: str
    source_id: Optional[int]
    source_type: Optional[str]
    physical_table: Optional[str]
    sql_query: Optional[str]
    file_metadata: Optional[Dict[str, Any]]
    description: Optional[str]
    owner: Optional[str]
    sync_status: str
    last_sync_at: Optional[datetime]
    sync_error: Optional[str]
    field_count: Optional[int]
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class DatasetListResponse(BaseModel):
    """数据集列表响应"""
    items: List[DatasetResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
