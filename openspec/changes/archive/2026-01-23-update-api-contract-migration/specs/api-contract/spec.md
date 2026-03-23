## ADDED Requirements

### Requirement: 统一 API 响应结构
系统 SHALL 对所有 /api/v1 端点返回统一响应结构：
`{ code, message, data, trace_id }`。

#### Scenario: 成功响应
- **WHEN** 客户端请求 `/api/v1/data-center/datasets`
- **THEN** 响应包含 `code=0` 且 `data` 为业务数据

#### Scenario: 错误响应
- **WHEN** 客户端请求无效参数
- **THEN** 响应包含 `code=-1` 与可读 `message`

### Requirement: 统一分页结构
分页接口 SHALL 使用统一分页结构：
`{ items, total, page, page_size, total_pages }`。

#### Scenario: 列表分页
- **WHEN** 客户端请求分页列表
- **THEN** `data.items` 为数组且包含 `total`、`page`、`page_size`、`total_pages`

### Requirement: 统一 API 前缀
系统 SHALL 仅将 `/api/v1` 作为业务 API 的稳定前缀。

#### Scenario: 旧端点迁移
- **WHEN** 客户端请求 `/api/*` 旧端点
- **THEN** 返回 410 且提示迁移到 `/api/v1`

## MODIFIED Requirements

### Requirement: 统一枚举值与字段命名
系统 SHALL 对跨端枚举与字段命名保持一致（前端不得使用与后端不一致的枚举）。

#### Scenario: 字段业务类型枚举
- **WHEN** 前端提交字段配置
- **THEN** `business_type` 只能取 `partition_key | dimension | measure`
