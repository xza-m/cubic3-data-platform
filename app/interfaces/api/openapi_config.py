"""
OpenAPI 文档配置
用于自动生成 API 文档
"""
from flask_openapi3 import Info, Tag, Server
from typing import List


# ============================================================================
# OpenAPI 基本信息
# ============================================================================

info = Info(
    title="CUBIC3 API",
    version="1.0.0",
    description="""
# CUBIC3 API 文档

## 概述
CUBIC3 提供统一的数据访问、提取、分析与智能问数能力。

> 3 Layers: Source, Semantic, Application

## 功能模块
- **数据中心**: 数据源管理、数据集管理
- **提取中心**: 数据提取任务管理、执行记录
- **查询中心**: SQL Lab、查询历史、查询模板
- **对话中心**: 智能问数、对话历史
- **应用中心**: 应用定义、应用实例、应用执行
- **配置中心**: 渠道管理、订阅管理

## 认证方式
API 使用 JWT Token 认证，在请求头中添加 `Authorization: Bearer <token>`

## 响应格式
所有 API 响应统一采用以下格式：

```json
{
  "code": 0,
  "message": "success",
  "data": { ... },
  "trace_id": "uuid"
}
```

- `code`: 状态码（0 表示成功，-1 表示失败）
- `message`: 响应消息
- `data`: 响应数据
- `trace_id`: 请求追踪 ID

## 错误码
- `0`: 成功
- `-1`: 通用错误
- `400`: 请求参数错误
- `401`: 未授权
- `403`: 禁止访问
- `404`: 资源不存在
- `500`: 服务器内部错误
    """,
    contact={
        "name": "CUBIC3 产品团队",
        "email": "support@example.com"
    },
    license={
        "name": "MIT",
        "url": "https://opensource.org/licenses/MIT"
    }
)


# ============================================================================
# API 标签（分组）
# ============================================================================

tags = [
    Tag(name="数据源管理", description="数据源的增删改查、连接测试、元数据获取"),
    Tag(name="数据集管理", description="数据集的注册、更新、删除、预览"),
    Tag(name="提取任务", description="数据提取任务的创建、执行、监控"),
    Tag(name="查询中心", description="SQL Lab、查询历史、查询模板"),
    Tag(name="对话中心", description="智能问数、对话历史"),
    Tag(name="应用中心", description="应用定义、应用实例、应用执行"),
    Tag(name="配置中心", description="渠道管理、订阅管理"),
    Tag(name="文件管理", description="文件上传、下载、预览"),
    Tag(name="飞书集成", description="飞书事件回调、消息推送"),
    Tag(name="健康检查", description="系统健康状态检查"),
]


# ============================================================================
# 服务器配置
# ============================================================================

servers = [
    Server(url="http://localhost:5000", description="本地开发环境"),
    Server(url="https://api.example.com", description="生产环境"),
]


# ============================================================================
# 安全方案
# ============================================================================

security_schemes = {
    "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
        "description": "JWT Token 认证"
    }
}


# ============================================================================
# 通用响应模型
# ============================================================================

from pydantic import BaseModel, Field
from typing import Any, Optional


class ApiResponse(BaseModel):
    """API 统一响应格式"""
    code: int = Field(default=0, description="状态码（0 表示成功）")
    message: str = Field(default="success", description="响应消息")
    data: Optional[Any] = Field(default=None, description="响应数据")
    trace_id: Optional[str] = Field(default=None, description="请求追踪 ID")


class PaginationMeta(BaseModel):
    """分页元数据"""
    page: int = Field(description="当前页码")
    page_size: int = Field(description="每页数量")
    total: int = Field(description="总记录数")
    total_pages: int = Field(description="总页数")


class PaginatedResponse(BaseModel):
    """分页响应"""
    items: list = Field(description="数据列表")
    pagination: PaginationMeta = Field(description="分页信息")


class ErrorResponse(BaseModel):
    """错误响应"""
    code: int = Field(description="错误码")
    message: str = Field(description="错误消息")
    trace_id: Optional[str] = Field(default=None, description="请求追踪 ID")
    details: Optional[dict] = Field(default=None, description="错误详情")
