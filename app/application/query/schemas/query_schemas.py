"""
查询相关Schemas
"""
from typing import Optional, List
from pydantic import BaseModel, Field


class ExecuteQueryRequest(BaseModel):
    """执行查询请求"""
    source_id: int = Field(..., description="数据源ID")
    sql_query: str = Field(..., min_length=1, description="SQL查询")
    query_id: Optional[int] = Field(None, description="查询ID（临时查询不需要）")
    limit: Optional[int] = Field(1000, ge=1, le=10000, description="结果行数限制")


class CreateQueryRequest(BaseModel):
    """创建查询请求"""
    query_name: str = Field(..., min_length=1, max_length=200, description="查询名称")
    source_id: int = Field(..., description="数据源ID")
    sql_query: str = Field(..., min_length=1, description="SQL查询")
    description: Optional[str] = Field(None, description="描述")
    folder_id: Optional[int] = Field(None, description="文件夹ID")
    tags: Optional[List[str]] = Field(default_factory=list, description="标签")
    is_favorite: bool = Field(False, description="是否收藏")


class UpdateQueryRequest(BaseModel):
    """更新查询请求"""
    query_name: Optional[str] = Field(None, min_length=1, max_length=200, description="查询名称")
    sql_query: Optional[str] = Field(None, min_length=1, description="SQL查询")
    description: Optional[str] = Field(None, description="描述")
    folder_id: Optional[int] = Field(None, description="文件夹ID")
    tags: Optional[List[str]] = Field(None, description="标签")
    source_id: Optional[int] = Field(None, description="数据源ID")


class CreateFolderRequest(BaseModel):
    """创建文件夹请求"""
    folder_name: str = Field(..., min_length=1, max_length=100, description="文件夹名称")
    parent_id: Optional[int] = Field(None, description="父文件夹ID")
