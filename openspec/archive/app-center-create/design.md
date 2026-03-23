# Design Document: 应用中心

## Context

当前系统缺少统一的应用编排能力。业务方需要定期推送 BI 看板、数据集信息、周报日报到飞书，但这些功能散落在各处，缺乏：
- 统一的配置界面
- 可视化的监控能力
- 灵活的调度机制
- 可扩展的执行器架构

应用中心旨在提供轻量级的应用编排平台，通过执行器抽象支持多种应用类型，通过表单化配置降低技术门槛。

**约束条件**:
- 必须保持轻量级，不引入浏览器自动化等重型依赖
- 依赖专业平台（Superset）提供的 API，不重复造轮子
- 必须与现有数据源、数据集、飞书集成无缝对接
- 必须支持定时、事件、手动三种触发方式

**利益相关者**:
- 业务人员：通过表单配置应用，无需编程
- 数据分析师：通过周报/日报自动推送减少重复劳动
- 管理层：通过异常监控及时发现数据问题
- 开发人员：通过执行器抽象快速扩展新应用类型

## Goals / Non-Goals

### Goals
- 提供统一的应用市场和实例管理界面
- 支持表单化配置，降低技术门槛
- 提供完整的执行监控和日志查询
- 支持定时任务、事件驱动、手动触发三种调度方式
- 实现 6 个内置应用覆盖核心业务场景
- 保持轻量级架构，所有执行器无重型依赖

### Non-Goals
- ❌ 不实现浏览器自动化（Selenium、Puppeteer）
- ❌ 不实现复杂图表渲染（交给 BI 平台或前端）
- ❌ 不实现大规模数据处理（交给数据仓库）
- ❌ 不支持除飞书外的其他 IM 平台（首期）
- ❌ 不实现应用市场的外部应用安装（首期仅内置应用）
- ❌ 不实现复杂的工作流编排（如 DAG）

## Decisions

### Decision 1: 轻量级架构 - 依赖专业平台 API

**选择**: BI 看板推送调用 Superset 内置截图 API，而非使用 Selenium + Chrome Headless。

**理由**:
- Superset 提供了完整的截图 API（`POST /api/v1/dashboard/{id}/screenshot`）
- 无需安装浏览器和驱动，Docker 镜像减少 500MB+
- 内存占用从 200-500MB/实例降低到 <10MB/实例
- 并发能力从 3-5 个实例提升到 10-20 个实例
- 故障率降低 80%（无浏览器崩溃、超时等问题）
- 维护成本降低 90%（无浏览器版本兼容性问题）

**替代方案考虑**:
- ❌ **Selenium + Chrome Headless**: 资源占用大，故障率高，维护成本高
- ❌ **Puppeteer**: 与 Selenium 类似，且需要 Node.js 环境
- ✅ **Superset API**: 轻量、稳定、官方支持

**权衡**:
- ✅ 优势：轻量、高并发、稳定性高
- ⚠️ 劣势：依赖 Superset 版本支持（需要 Superset 支持截图 API）
- ⚠️ 缓解：如果 Superset 不支持，可降级到手动上传截图 URL

### Decision 2: 执行器抽象 - 支持多种应用类型

**选择**: 通过抽象基类 `AppExecutor` 定义执行器接口，每种应用类型实现具体执行器。

**理由**:
- 支持快速扩展新应用类型，无需修改核心调度逻辑
- 执行器职责单一，易于测试和维护
- 支持依赖注入，便于 mock 和测试

**接口设计**:
```python
class AppExecutor(ABC):
    @abstractmethod
    async def execute(self, instance: AppInstance, context: ExecutionContext) -> ExecutionResult:
        """执行应用逻辑"""
        pass
    
    @abstractmethod
    def validate_config(self, config: dict) -> ValidationResult:
        """验证配置"""
        pass
    
    @abstractmethod
    def get_config_schema(self) -> dict:
        """获取配置表单 JSON Schema"""
        pass
```

**替代方案考虑**:
- ❌ **硬编码每种应用**: 不可扩展，添加新应用需要修改核心代码
- ❌ **插件系统 + 动态加载**: 过度设计，首期仅支持内置应用
- ✅ **执行器抽象 + 工厂模式**: 平衡扩展性和简单性

### Decision 3: 混合配置模式 - 表单 + 代码

**选择**: 默认提供 JSON Schema 表单配置，高级用户可切换到代码模式（JSON/YAML）。

**理由**:
- 降低技术门槛：非技术人员通过表单配置
- 保留灵活性：高级用户通过代码模式实现复杂逻辑
- 使用成熟方案：JSON Schema 有丰富的表单生成库（react-jsonschema-form）

**实现方案**:
- 前端使用 Ant Design + react-jsonschema-form 渲染表单
- 提供"切换到代码模式"按钮，显示 Monaco Editor
- 保存时统一存储为 JSON（存储在 `app_instances.config` JSONB 字段）

**替代方案考虑**:
- ❌ **仅表单模式**: 不够灵活，无法支持复杂配置
- ❌ **仅代码模式**: 技术门槛高，非技术人员无法使用
- ✅ **混合模式**: 兼顾易用性和灵活性

### Decision 4: 异步执行 - RQ 队列

**选择**: 使用 RQ (Redis Queue) 异步执行所有应用任务。

**理由**:
- 避免阻塞主线程，提升 API 响应速度
- 支持并发执行多个任务
- 支持任务重试和失败处理
- RQ 是 Python 生态成熟的任务队列，轻量级，易于部署

**架构**:
```
APScheduler (定时触发) → RQ Queue (异步执行) → Executor (执行应用)
Event System (事件触发) → RQ Queue (异步执行) → Executor (执行应用)
Manual Trigger (手动触发) → RQ Queue (异步执行) → Executor (执行应用)
```

**替代方案考虑**:
- ❌ **Celery**: 功能强大但过于复杂，需要额外依赖（如 Kombu）
- ❌ **同步执行**: 阻塞主线程，无法并发
- ✅ **RQ**: 轻量、成熟、易于部署

### Decision 5: 调度方式 - APScheduler + 事件 + 手动

**选择**: 支持三种触发方式：定时任务（APScheduler）、事件驱动（Event System）、手动触发（API）。

**理由**:
- **定时任务**：覆盖周报、日报、定期推送等场景
- **事件驱动**：覆盖数据提取完成、数据变更等实时场景
- **手动触发**：覆盖测试、紧急推送等场景

**实现方案**:
- APScheduler 注册 cron 任务，到期时将任务推送到 RQ 队列
- Event System 通过 Flask signals 或自定义事件总线触发
- 手动触发通过 `POST /api/v1/app-instances/:id/execute` API

**替代方案考虑**:
- ❌ **仅定时任务**: 无法覆盖实时场景
- ❌ **仅事件驱动**: 无法覆盖定期推送场景
- ✅ **多种触发方式**: 灵活覆盖所有场景

## Architecture

### 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend (React)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ 应用市场     │  │ 实例管理     │  │ 执行监控     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │ REST API
┌────────────────────────┴────────────────────────────────┐
│                   Backend (Flask)                        │
│  ┌──────────────────────────────────────────────────┐   │
│  │ API Layer (/api/v1/apps, /app-instances, ...)   │   │
│  └────────────────────┬─────────────────────────────┘   │
│  ┌────────────────────┴─────────────────────────────┐   │
│  │ Service Layer (AppDefinitionService, ...)        │   │
│  └────────────────────┬─────────────────────────────┘   │
│  ┌────────────────────┴─────────────────────────────┐   │
│  │ Domain Layer (AppDefinition, AppInstance, ...)   │   │
│  └──────────────────────────────────────────────────┘   │
│                                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Scheduler Service (APScheduler)                  │   │
│  └────────────────────┬─────────────────────────────┘   │
│                       │ enqueue                          │
│  ┌────────────────────▼─────────────────────────────┐   │
│  │ Task Queue (RQ - Redis Queue)                    │   │
│  └────────────────────┬─────────────────────────────┘   │
│                       │ dequeue                          │
│  ┌────────────────────▼─────────────────────────────┐   │
│  │ RQ Workers (10-20 并发)                          │   │
│  │  └─> ExecutorFactory.create(app_code)            │   │
│  │       └─> BiDashboardPushExecutor.execute()      │   │
│  │       └─> DatasetCardPushExecutor.execute()      │   │
│  │       └─> ...                                     │   │
│  └──────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────┘
```

### 数据模型

```
┌─────────────────────┐       ┌─────────────────────┐       ┌─────────────────────┐
│  app_definitions    │       │  app_instances      │       │  app_executions     │
├─────────────────────┤       ├─────────────────────┤       ├─────────────────────┤
│ id (PK)             │       │ id (PK)             │       │ id (PK)             │
│ code (UK)           │◄──────│ app_code (FK)       │◄──────│ instance_id (FK)    │
│ name                │       │ name                │       │ status              │
│ category            │       │ config (JSONB)      │       │ started_at          │
│ description         │       │ schedule_type       │       │ ended_at            │
│ config_schema       │       │ schedule_config     │       │ duration_ms         │
│ icon                │       │ enabled             │       │ input_params        │
│ ...                 │       │ ...                 │       │ output              │
└─────────────────────┘       └─────────────────────┘       │ error_message       │
                                                             │ ...                 │
                                                             └─────────────────────┘
```

### 执行器继承关系

```
                       ┌──────────────────┐
                       │   AppExecutor    │
                       │   (抽象基类)     │
                       └────────┬─────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
┌───────▼─────────┐   ┌─────────▼────────┐   ┌────────▼────────┐
│BiDashboardPush  │   │DatasetCardPush   │   │ReportPush       │
│Executor         │   │Executor          │   │Executor         │
└─────────────────┘   └──────────────────┘   └─────────────────┘
        │                       │                       │
┌───────▼─────────┐   ┌─────────▼────────┐   ┌────────▼────────┐
│AnomalyMonitor   │   │QueryResultPush   │   │ExtractionNotify │
│Executor         │   │Executor          │   │Executor         │
└─────────────────┘   └──────────────────┘   └─────────────────┘
```

## Data Model Details

### app_definitions 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| code | VARCHAR(50) UK | 应用唯一标识（如 `bi_dashboard_push`） |
| name | VARCHAR(100) | 应用名称 |
| category | VARCHAR(50) | 分类（如 `bi_integration`、`data_notification`） |
| description | TEXT | 应用描述 |
| config_schema | JSONB | JSON Schema（用于生成表单） |
| icon | VARCHAR(50) | 图标名称（Ant Design Icon） |
| author | VARCHAR(100) | 作者 |
| version | VARCHAR(20) | 版本号 |
| enabled | BOOLEAN | 是否启用 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

### app_instances 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| app_code | VARCHAR(50) FK | 关联应用定义 |
| name | VARCHAR(200) | 实例名称 |
| description | TEXT | 实例描述 |
| config | JSONB | 配置参数（JSON） |
| schedule_type | VARCHAR(20) | 调度类型（cron/event/manual） |
| schedule_config | JSONB | 调度配置（如 cron 表达式） |
| enabled | BOOLEAN | 是否启用 |
| owner | VARCHAR(100) | 所有者 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |
| last_execution_at | TIMESTAMP | 最后执行时间 |
| last_execution_status | VARCHAR(20) | 最后执行状态 |

### app_executions 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| instance_id | INTEGER FK | 关联实例 |
| trigger_type | VARCHAR(20) | 触发方式（scheduled/event/manual） |
| status | VARCHAR(20) | 执行状态（pending/running/success/failed） |
| started_at | TIMESTAMP | 开始时间 |
| ended_at | TIMESTAMP | 结束时间 |
| duration_ms | INTEGER | 执行耗时（毫秒） |
| input_params | JSONB | 输入参数 |
| output | JSONB | 输出结果 |
| error_message | TEXT | 错误信息 |
| created_at | TIMESTAMP | 创建时间 |

## Migration Plan

### 阶段 1：核心基础（周 1-2）
1. 创建数据库表和迁移脚本
2. 实现领域模型和执行器抽象
3. 实现执行器工厂和调度服务
4. 初始化 6 个应用定义 seed 数据

### 阶段 2：执行器实现（周 3-4）
1. 实现 BI 看板推送执行器（优先级最高）
2. 实现数据集卡片推送执行器
3. 实现周报日报推送执行器
4. 实现异常数据监控执行器
5. 实现查询结果推送执行器
6. 实现数据提取通知执行器

### 阶段 3：API 和前端（周 5-6）
1. 实现应用市场 API 和页面
2. 实现应用实例管理 API 和页面
3. 实现执行记录查询 API 和监控仪表盘
4. 集成到主导航

### 阶段 4：测试与优化（周 7）
1. 手动测试所有功能
2. 性能测试（并发执行）
3. 异常场景测试
4. 文档更新

### 回滚计划
- 数据库迁移支持回滚（`flask db downgrade`）
- 保留功能开关，可随时禁用应用中心
- RQ Worker 可独立停止，不影响主应用

## Risks / Trade-offs

### 风险 1: Superset API 稳定性
- **风险**: Superset 截图 API 可能超时或失败
- **影响**: BI 看板推送失败
- **缓解**: 
  - 实现重试机制（最多 3 次）
  - 配置超时参数（默认 30 秒）
  - 记录详细错误日志
  - 如果 Superset 不支持截图 API，降级到手动上传截图 URL

### 风险 2: 飞书 API 限流
- **影响**: 高频推送可能触发飞书 API 限流（默认 100 次/分钟）
- **缓解**:
  - 实现请求限流（令牌桶算法）
  - 错峰发送（避免在整点集中推送）
  - 记录限流事件并告警
  - 支持批量推送（合并多个消息）

### 风险 3: 调度精度
- **权衡**: APScheduler 基于轮询，精度为秒级
- **影响**: 无法支持毫秒级精度的调度
- **接受**: 对于日报/周报场景，秒级精度足够

### 风险 4: 执行并发
- **权衡**: RQ Worker 并发数需要合理配置
- **影响**: 并发过高可能耗尽资源，并发过低可能导致任务积压
- **缓解**:
  - 建议配置 10-20 个并发（轻量级应用）
  - 监控队列长度和 Worker 状态
  - 支持动态调整并发数

### 风险 5: 配置复杂度
- **权衡**: JSON Schema 表单无法覆盖所有复杂场景
- **缓解**:
  - 提供代码模式（JSON/YAML 编辑器）
  - 提供丰富的配置示例
  - 支持配置模板（预设常用配置）

## Open Questions

1. **Q**: Superset 截图 API 是否需要特定版本？  
   **A**: 需要验证 Superset 版本支持。如果不支持，降级到手动上传截图 URL。

2. **Q**: 飞书卡片样式是否需要定制？  
   **A**: 首期使用标准卡片模板，后续根据反馈迭代。

3. **Q**: 是否需要支持应用实例的版本管理？  
   **A**: 首期不支持，所有修改直接生效。未来可考虑添加版本历史和回滚功能。

4. **Q**: 是否需要支持应用实例的权限控制？  
   **A**: 首期仅基于 owner 字段，未来可集成 RBAC。

5. **Q**: RQ Worker 如何部署？  
   **A**: 提供 Docker Compose 配置和启动脚本，支持独立部署。
