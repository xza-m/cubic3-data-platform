# Change: 架构清理与技术债务重构

## Why

根据 2026-01-25 代码审查报告，项目存在以下严重的架构和技术债务问题：

1. **新旧架构混乱**：`app/models.py` 与 `app/domain/entities/` 重复定义模型，违反 DRY 原则
2. **日志系统不一致**：部分模块使用 `logging.getLogger()`，部分使用 `app.shared.utils.logger.get_logger()`
3. **事件总线类型不安全**：使用字符串路径订阅事件处理器，重构时容易遗漏更新
4. **依赖注入配置不完整**：缺少类型标注和配置验证，初始化失败时错误提示不明确
5. **API 文档缺失**：虽然安装了 `flask-openapi3`，但未实际使用
6. **文档冗余混乱**：`docs/readme.md` 包含 3595 行，大量历史信息与当前架构不同步
7. **前后端分离不彻底**：前端代码混在同一仓库，构建产物被提交到 Git

这些问题导致：
- 维护成本高（需要同步修改多处）
- 新人困惑（不知道使用哪个模块）
- 重构风险大（类型不安全导致运行时错误）
- 文档与代码不同步（43 处 TODO/FIXME 未处理）

## What Changes

### 1. 架构统一 (BREAKING)
- **移除** `app/models.py` 中已迁移至 DDD 的旧模型定义
- **保留** 未迁移的模型（`TaskConfig`, `TaskRunLog`, `FeishuChatRef`, `DatasetRegistry`, `FieldMetadata`, `MetadataSyncLog`, `DatasetApproval`, `ExtractionTemplate`, `DataSourceTableCache`）
- **统一** 所有实体定义到 `app/domain/entities/`
- **批量更新** 所有引用旧模型的代码，直接导入新实体

### 2. 日志系统统一
- **创建** 统一的结构化日志记录器 `app/shared/utils/logger.py`
- **替换** 所有 `logging.getLogger()` 为 `get_logger()`
- **添加** 请求上下文（user_id, trace_id, request_id, ip）
- **配置** JSON 格式输出（便于 ELK/Loki 聚合）

### 3. 事件总线类型安全
- **重构** `EventBus.subscribe()` 接受 `Callable` 而非字符串路径
- **保留** 字符串序列化机制（用于 RQ 任务队列）
- **添加** 类型检查和 IDE 自动完成支持
- **更新** 所有事件处理器注册代码

### 4. 依赖注入配置验证
- **引入** Pydantic `BaseSettings` 验证配置结构
- **添加** 配置类型定义（`AppConfig`, `LLMConfig`, `FeishuConfig`, `OSSConfig`）
- **实现** 启动时配置验证（生产环境强制检查）
- **改进** 错误提示（明确指出缺失或无效的配置项）

### 5. API 文档自动生成
- **启用** Flask-OpenAPI3 自动生成 OpenAPI 3.0 规范
- **添加** API 端点装饰器（`@api.post()`, `@api.get()` 等）
- **定义** Pydantic 请求/响应模型
- **生成** Swagger UI 和 ReDoc 文档界面

### 6. 文档简化与同步
- **拆分** `docs/readme.md` 为多个独立文档
  - `docs/README.md` - 项目概览（<200 行）
  - `docs/ARCHITECTURE.md` - 架构设计
  - `docs/API.md` - API 文档（自动生成）
  - `docs/DEPLOYMENT.md` - 部署指南
  - `docs/DEVELOPMENT.md` - 开发指南
- **移除** 历史变更记录（已归档到 `openspec/changes/archive/`）
- **清理** 43 处 TODO/FIXME 注释

### 7. 前后端分离优化
- **添加** `.gitignore` 排除 `frontend/dist/`, `frontend/node_modules/`
- **创建** `frontend/.dockerignore` 优化构建
- **分离** 前端构建流程（独立 Docker 镜像）
- **配置** Nginx 反向代理（静态资源 + API 代理）

## Impact

### 受影响的规范
- **core-architecture**: 新增架构清理规范
- **logging**: 新增统一日志规范
- **event-system**: 修改事件总线规范
- **dependency-injection**: 修改 DI 配置规范
- **api-documentation**: 新增 API 文档规范
- **documentation**: 新增文档管理规范
- **frontend-separation**: 新增前后端分离规范

### 受影响的代码
- **核心文件**:
  - `app/models.py` - 移除已迁移模型
  - `app/__init__.py` - 更新导入和初始化
  - `app/di/container.py` - 添加配置验证
  - `app/infrastructure/events/event_bus.py` - 重构订阅机制
  - `app/shared/utils/logger.py` - 统一日志工具

- **接口层** (20+ 文件):
  - `app/interfaces/api/v1/*.py` - 添加 OpenAPI 装饰器
  - 所有使用 `logging.getLogger()` 的文件

- **文档**:
  - `docs/readme.md` - 拆分为多个文件
  - `README.md` - 更新项目概览

- **前端**:
  - `.gitignore` - 添加前端构建产物排除
  - `frontend/.dockerignore` - 新建
  - `docker-compose.full.yml` - 分离前端镜像构建

### 迁移路径
1. **阶段 1**（审计和准备）: 扫描所有旧模型引用，生成待修改文件列表
2. **阶段 2**（批量迁移）: 使用脚本批量替换导入语句，手工处理复杂情况
3. **阶段 3**（清理和验证）: 删除旧模型定义，运行测试验证

### 风险
- **中等风险**: 大量文件修改，需要充分测试
- **BREAKING CHANGE**: 无向后兼容，所有旧引用必须一次性迁移
- **缓解措施**: 
  - 使用脚本自动化批量替换
  - 详细的审计报告（哪些文件需要修改）
  - 运行完整测试套件验证
  - 保留 Git 历史便于回滚

### 预期收益
- **维护成本降低 50%**: 消除重复定义
- **新人上手时间减少 30%**: 架构清晰，文档简洁
- **重构安全性提升**: 类型检查防止运行时错误
- **文档同步**: 自动生成 API 文档，减少手工维护
