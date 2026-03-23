# Change: 创建应用中心模块

## Why

当前系统缺少统一的应用管理和调度能力。业务需求如"BI看板推送飞书"、"周报日报自动生成"、"异常数据告警"等功能散落在各处，缺乏统一的配置界面和监控能力。应用中心将提供轻量级的应用编排平台，通过表单化配置降低技术门槛，通过统一监控提升可观测性。

## What Changes

- **新增应用中心模块**：包含应用市场、应用实例管理、执行记录监控三大核心功能
- **新增 6 个内置应用**：
  - BI看板推送（调用 Superset API + 飞书）
  - 数据集卡片推送（元数据查询 + 飞书卡片）
  - 周报日报推送（SQL查询 + 文本格式化 + 飞书）
  - 异常数据监控（SQL查询 + 阈值判断 + 飞书告警）
  - 查询结果推送（SQL查询 + 结果格式化 + 飞书）
  - 数据提取通知（事件监听 + 飞书通知）
- **新增数据库表**：
  - `app_definitions`（应用定义）
  - `app_instances`（应用实例）
  - `app_executions`（执行记录）
- **新增后端 API**：
  - `/api/v1/apps`（应用市场 REST API）
  - `/api/v1/app-instances`（应用实例管理 REST API）
  - `/api/v1/app-executions`（执行记录查询 REST API）
- **新增前端页面**：
  - 应用市场页面（`/apps`）
  - 应用实例管理页面（`/apps/:code/instances`）
  - 执行监控仪表盘（`/apps/executions`）
- **新增调度能力**：
  - 基于 APScheduler 的定时任务调度
  - 基于 RQ (Redis Queue) 的异步任务执行
  - 基于事件系统的触发执行

## Impact

- **新增功能模块**：应用中心（app-center）
- **新增后端文件**：
  - `app/domain/app_center/`（领域模型：AppDefinition、AppInstance、AppExecution、执行器抽象）
  - `app/services/app_center/`（应用服务：应用管理、实例管理、执行管理、调度服务）
  - `app/interfaces/api/v1/apps.py`（应用市场 API Blueprint）
  - `app/interfaces/api/v1/app_instances.py`（实例管理 API Blueprint）
  - `app/interfaces/api/v1/app_executions.py`（执行记录 API Blueprint）
  - `app/executors/`（6 个应用执行器实现）
- **新增前端文件**：
  - `frontend/src/pages/AppMarket.tsx`（应用市场）
  - `frontend/src/pages/AppInstanceManage.tsx`（实例管理）
  - `frontend/src/pages/AppExecutionDashboard.tsx`（执行监控）
  - `frontend/src/api/apps.ts`（API 客户端）
  - `frontend/src/types/apps.ts`（类型定义）
- **修改文件**：
  - `app/__init__.py`（注册新的 Blueprint）
  - `frontend/src/App.tsx`（添加路由）
  - `frontend/src/components/Layout/GlassAppLayout.tsx`（添加导航菜单）
  - `requirements.txt`（可能需要添加依赖，如调度库）
  - `schema/`（添加数据库迁移脚本）
- **新增依赖**：
  - 后端：`APScheduler`（定时任务调度）、`rq`（任务队列）
  - 前端：无需新增（使用现有 Ant Design、React Query）
- **配置变更**：
  - 需要在 `.env` 中配置 Redis 连接（用于 RQ 队列）
  - 需要配置 Superset API 凭据（用于看板截图）

## Design Decisions

- **轻量级架构**：应用中心只负责调度和监控，不引入浏览器自动化（Selenium）等重型依赖
- **依赖专业平台**：BI 看板截图调用 Superset 内置 API，不自行实现
- **执行器抽象**：通过抽象基类 `AppExecutor` 支持多种应用类型扩展
- **混合配置模式**：默认提供 JSON Schema 表单，高级用户可切换到代码模式
- **异步执行**：所有应用执行通过 RQ 队列异步化，避免阻塞主线程

## Non-Goals

- ❌ 不实现浏览器自动化（Selenium、Puppeteer）
- ❌ 不实现复杂图表渲染（交给 BI 平台或前端）
- ❌ 不实现大规模数据处理（交给数据仓库）
- ❌ 不支持除飞书外的其他 IM 平台（未来可扩展，但首期仅支持飞书）
- ❌ 不实现应用市场的外部应用安装（首期仅支持内置应用）

## Risks

- **Superset API 稳定性**：依赖 Superset 截图 API，需要处理超时和失败场景（通过重试机制）
- **飞书 API 限流**：高频推送可能触发飞书 API 限流（通过请求限流和错峰发送）
- **调度精度**：APScheduler 基于轮询，精度为秒级（对于日报/周报场景足够）
- **执行并发**：RQ Worker 并发数需要合理配置，避免资源耗尽（建议 10-20 个并发）
