"""
异步数据导出相关 Pydantic schemas
"""
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class SubmitExportRequest(BaseModel):
    """POST /api/v1/queries/export 请求体"""
    source_id: int = Field(..., description="数据源 ID")
    sql_query: str = Field(..., min_length=1, description="要导出的 SQL")
    visual_spec: Optional[Dict[str, Any]] = Field(
        None,
        description="可选：前端 QueryVisual 的 spec，用于审计追溯",
    )


class ListExportsRequest(BaseModel):
    """GET /api/v1/queries/exports 查询参数"""
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)
    status: Optional[str] = Field(None, description="按状态过滤")
