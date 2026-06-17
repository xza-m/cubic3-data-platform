"""
OpenAPI 文档配置
用于自动生成 API 文档
"""
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Info:
    title: str
    version: str
    description: str
    contact: dict[str, Any]
    license: dict[str, Any]


@dataclass(frozen=True)
class Tag:
    name: str
    description: str


@dataclass(frozen=True)
class Server:
    url: str
    description: str


# ============================================================================
# OpenAPI 基本信息
# ============================================================================

info = Info(
    title="CUBIC3 Data Platform API",
    version="1.0.0",
    description="""
# CUBIC3 Data Platform API 文档

## 概述
CUBIC3 Data Platform 提供数据源接入、数据资产同步、语义建模、治理审计与 Agent-first 智能问数能力。

> 3 Layers: Source, Semantic, Application

## 功能模块
- **数据中心**：数据源、数据集、元数据浏览与目录同步
- **语义中心**：数据资产底座、语义 Runtime 健康检查、语义建模与发布
- **Agent Runtime**：official Runtime 语义规划与受治理查询执行
- **治理与审计**：策略、执行画像、审计 Trace 与 gateway 观测
- **查询中心**：SQL Lab、查询历史、查询模板
- **应用与配置中心**：应用定义、实例、渠道与订阅

## 认证方式
API 使用平台 Token Pair：登录返回 `access_token` 与 `refresh_token`。
业务请求在请求头中添加 `Authorization: Bearer <access_token>`；`access_token` 过期后通过
`POST /api/v1/auth/refresh` 使用 `refresh_token` 轮换新的 Token Pair。
部分 Agent-first preview 接口同时支持平台 API Key 入口，具体以接口说明为准。

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
- `422`: 请求语义合法性校验失败
- `500`: 服务器内部错误
    """,
    contact={
        "name": "CUBIC3 Data Platform Team",
        "email": "support@cubic3.local"
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
    Tag(name="语义资产", description="数据资产底座、物理表事实、字段候选、元数据同步"),
    Tag(name="语义 Runtime", description="已发布语义资产的 official Runtime 健康与运行时契约"),
    Tag(name="语义路由", description="语义路由、执行计划预演与诊断"),
    Tag(name="执行编译", description="QueryDSL、逻辑 SQL、治理材料和执行预览"),
    Tag(name="Agent Runtime", description="Agent-first 语义规划与受治理查询执行"),
    Tag(name="治理与审计", description="治理策略、执行画像、审计 Trace 与 gateway 观测"),
    Tag(name="语义建模", description="语义建设工作台、Copilot 会话、发布预演与门禁投影"),
    Tag(name="业务语义", description="Ontology、术语、关系、策略与业务上下文预览"),
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
    Server(url="https://cubic3-dp.example.com", description="生产或预生产环境占位，请按实际部署域名替换"),
]


# ============================================================================
# 安全方案
# ============================================================================

security_schemes = {
    "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
        "description": "平台 Access Token 认证"
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
