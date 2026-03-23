## ADDED Requirements

### Requirement: 统一日志工具
系统 SHALL 提供统一的结构化日志记录器 `StructuredLogger`，所有模块必须使用 `app.shared.utils.logger.get_logger(__name__)` 获取日志实例。

#### Scenario: 获取日志记录器
- **WHEN** 模块需要记录日志
- **THEN** 使用 `from app.shared.utils.logger import get_logger`
- **AND** 调用 `logger = get_logger(__name__)`
- **AND** 不得使用 `logging.getLogger(__name__)`

#### Scenario: 记录日志
- **WHEN** 调用 `logger.info("User logged in", user_id=123)`
- **THEN** 日志输出包含消息文本 "User logged in"
- **AND** 包含请求上下文（user_id, trace_id, request_id, ip）
- **AND** 包含自定义字段 `user_id=123`

### Requirement: 结构化日志格式
系统 SHALL 支持两种日志输出格式：
- 开发环境：文本格式（便于阅读）
- 生产环境：JSON 格式（便于 ELK/Loki 聚合）

#### Scenario: 开发环境日志输出
- **WHEN** 环境变量 `FLASK_ENV=development`
- **THEN** 日志输出为文本格式
- **EXAMPLE**: `2026-01-25 10:30:45 INFO [app.services.dataset] User logged in (user_id=123, trace_id=abc-123)`

#### Scenario: 生产环境日志输出
- **WHEN** 环境变量 `FLASK_ENV=production`
- **THEN** 日志输出为 JSON 格式
- **EXAMPLE**: `{"time":"2026-01-25T10:30:45Z","level":"INFO","logger":"app.services.dataset","message":"User logged in","context":{"user_id":"123","trace_id":"abc-123","request_id":"req-456","ip":"192.168.1.100"}}`

### Requirement: 请求上下文注入
系统 SHALL 在每个 HTTP 请求开始时自动注入以下上下文到 Flask `g` 对象：
- `trace_id`: 分布式追踪 ID（UUID）
- `request_id`: 请求唯一 ID（UUID）
- `user_id`: 当前用户 ID（从认证中间件获取）
- `ip`: 客户端 IP 地址

#### Scenario: 请求上下文自动注入
- **WHEN** HTTP 请求到达
- **THEN** 中间件生成 `trace_id` 和 `request_id`
- **AND** 注入到 `g.trace_id` 和 `g.request_id`
- **AND** 所有日志自动包含这些上下文

### Requirement: 日志级别配置
系统 SHALL 支持通过环境变量 `LOG_LEVEL` 配置日志级别，支持的级别包括：DEBUG, INFO, WARNING, ERROR, CRITICAL。

#### Scenario: 配置日志级别
- **WHEN** 环境变量 `LOG_LEVEL=DEBUG`
- **THEN** 所有 DEBUG 及以上级别的日志都会输出
- **WHEN** 环境变量 `LOG_LEVEL=WARNING`
- **THEN** 仅 WARNING, ERROR, CRITICAL 级别的日志输出

## REMOVED Requirements

### Requirement: 直接使用 logging.getLogger()
**Reason**: 日志格式不一致，缺少请求上下文

**Migration**: 批量替换为 `get_logger(__name__)`，使用脚本自动化处理
