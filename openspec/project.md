# Project Context

## Purpose

本项目是一个**企业级数据应用平台** `CUBIC3`（Git 仓库名：`cubic3-data-platform`），提供统一的数据访问、提取、分析和智能问数能力。

### 核心功能模块

1. **数据中心**：
   - 数据源管理：支持 MySQL、PostgreSQL、ClickHouse、Hive、MaxCompute 等多种数据库
   - 数据集注册：统一的数据集元数据管理，支持字段级权限控制
   - 元数据同步：自动同步数据库表结构，保持元数据最新

2. **提取中心**：
   - 任务调度：支持定时、手动、API 触发的数据提取任务
   - 增量提取：基于时间字段的增量数据抽取
   - 格式转换：支持 CSV、JSON、Parquet 等多种输出格式
   - 异步处理：基于 Redis Queue 的后台任务队列

3. **查询中心**：
   - SQL Lab：在线 SQL 编辑器，支持语法高亮和智能提示
   - 查询模板：参数化查询模板，支持动态参数替换（CRUD 完整）
   - 查询历史：完整的查询记录和结果缓存
   - 结果导出：支持 CSV、Excel 格式导出

4. **对话中心**：
   - 智能问数：基于 LLM 的自然语言查询转 SQL
   - 上下文对话：支持多轮对话和历史上下文
   - 结果可视化：自动生成图表和数据分析报告

5. **应用中心**：
   - 应用定义：配置化的数据应用开发
   - 应用实例：支持多环境部署和参数管理
   - 自动执行：定时自动执行并推送结果

6. **配置中心**：
   - 渠道管理：飞书、钉钉、Webhook 等多种推送渠道（完整 UI）
   - 订阅管理：灵活的事件订阅和消息推送规则（完整 UI）
   - 权限控制：基于角色的访问控制 (RBAC)

## Tech Stack

### 后端技术栈
- **框架**: Flask 3.0.3 + Gunicorn 23.0.0
- **ORM**: SQLAlchemy 3.1.1 + Flask-Migrate 4.0.5
- **数据库**: PostgreSQL (psycopg2-binary 2.9.9)
- **依赖注入**: dependency-injector 4.41.0
- **异步任务**: RQ 1.15.1 + Redis 5.0.1
- **定时调度**: Flask-APScheduler 1.13.1 + APScheduler 3.10.4
- **数据验证**: Pydantic 2.5.0
- **认证**: PyJWT 2.8.0
- **HTTP 客户端**: requests 2.32.3, aiohttp 3.9.1 (异步)
- **数据处理**: pandas 2.2.0
- **对象存储**: oss2 2.18.4 (阿里云 OSS)

### 数据源驱动
- **MaxCompute**: pyodps 0.11.5
- **ClickHouse**: clickhouse-driver 0.2.7
- **MySQL**: pymysql 1.1.0 (同步), aiomysql 0.2.0 (异步)
- **PostgreSQL**: psycopg2-binary 2.9.9 (同步), asyncpg 0.29.0 (异步)

### 前端技术栈
- **框架**: React 18.2.0 + TypeScript 5.3.3
- **构建工具**: Vite 5.0.11
- **UI 组件库**: Ant Design 5.13.2 + @ant-design/icons 5.2.6
- **图标系统**: Lucide React 0.303.0
- **样式方案**: Tailwind CSS 3.4.1 + PostCSS 8.4.33 + Autoprefixer 10.4.16
- **状态管理**: Zustand 4.4.7 + @tanstack/react-query 5.17.9
- **路由**: React Router DOM 6.21.1
- **HTTP 客户端**: Axios 1.6.5
- **代码编辑器**: Monaco Editor (@monaco-editor/react 4.7.0)
- **SQL 格式化**: sql-formatter 15.7.0
- **图表库**: Recharts 2.10.3
- **日期处理**: date-fns 3.0.6
- **Markdown 渲染**: react-markdown 9.0.1

### 测试工具
- **测试框架**: pytest 7.4.3, pytest-asyncio 0.21.1, pytest-flask 1.3.0, pytest-mock 3.12.0
- **覆盖率**: pytest-cov 4.1.0
- **测试数据**: faker 20.1.0

### 部署与基础设施
- **容器化**: Docker + Docker Compose
- **Web 服务器**: Nginx (反向代理 + 静态文件服务)
- **环境配置**: python-dotenv 1.0.1

### API 文档
- **文档生成**: 自动扫描路由生成 OpenAPI 3.0 规范
- **UI 界面**: Swagger UI + ReDoc
- **访问地址**: `/api/docs/swagger`, `/api/docs/redoc`, `/api/docs/openapi.json`

## Project Conventions

### Code Style

#### Python 后端
- **编码规范**: 遵循 PEP 8 标准
- **缩进**: 4 个空格（不使用 Tab）
- **命名规范**:
  - 函数/变量: `snake_case` (如 `create_dataset`, `user_id`)
  - 类名: `CapWords` (如 `DatasetRepository`, `CreateDatasetCommand`)
  - 常量: 全大写 + 下划线 (如 `MAX_RETRY_COUNT`, `DEFAULT_TIMEOUT`)
  - 私有成员: 单下划线前缀 (如 `_validate_input`)
- **注释**: 关键业务逻辑使用中文注释说明，公共 API 添加 docstring
- **导入顺序**: 标准库 → 第三方库 → 本地模块 (各组之间空一行)

#### TypeScript 前端
- **编译目标**: ES2020 (target + lib)
- **模块系统**: ESNext (module) + bundler (moduleResolution)
- **严格模式**: 启用 `strict: true`
- **未使用检查**: `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`
- **JSX**: `react-jsx` (React 17+ 自动导入)
- **路径别名**: `@/*` 映射到 `./src/*`
- **Lint 配置**: ESLint + @typescript-eslint (TBD - 当前未找到配置文件)

#### 目录结构约定
- **后端 (`app/`)**:
  - `domain/`: 领域层 (entities, events, ports, services) - DDD 核心
  - `application/`: 应用层 (commands, handlers, schemas) - CQRS 实现
  - `infrastructure/`: 基础设施层 (adapters, cache, database, events, repositories, tasks)
  - `interfaces/`: 接口层 (api/v1/, api/docs/, middleware/) - REST API
  - `di/`: 依赖注入容器配置
  - `shared/`: 共享模块 (enums, exceptions, logger, response, utils)
  - `config.py`, `config_schema.py`: 应用配置（Pydantic 验证）
  
- **前端 (`frontend/src/`)**:
  - `api/`: API 客户端封装
  - `components/`: 可复用组件
  - `pages/`: 页面组件
  - `types/`: TypeScript 类型定义
  - `utils/`: 工具函数
  - `styles/`: 全局样式

### Architecture Patterns

#### 后端架构模式
本项目采用 **Hexagonal Architecture (六边形架构)** + **Domain-Driven Design (DDD)** + **CQRS (读写分离)**：

**1. 分层架构**
```
┌─────────────────────────────────────────────────────────┐
│ Interfaces Layer (interfaces/)                          │
│ - REST API (v1/datasources, v1/datasets, v1/extraction) │
│ - Middleware (auth, error_handler)                      │
└─────────────────────────────────────────────────────────┘
                        ↓ HTTP/JSON
┌─────────────────────────────────────────────────────────┐
│ Application Layer (application/)                        │
│ - Commands: CreateDatasetCommand, UpdateDatasetCommand  │
│ - Handlers: CreateDatasetHandler, DatasetQueryHandler   │
│ - Schemas: Pydantic 请求/响应验证                        │
└─────────────────────────────────────────────────────────┘
                        ↓ Domain Events
┌─────────────────────────────────────────────────────────┐
│ Domain Layer (domain/)                                  │
│ - Entities: Dataset, DataSource, ExtractionTask (ORM)   │
│ - Events: DatasetCreated, TaskExecuted                  │
│ - Ports: Repository/Service 接口定义                     │
│ - Services: 领域服务 (SQL 生成、权限检查)                 │
└─────────────────────────────────────────────────────────┘
                        ↓ Adapters
┌─────────────────────────────────────────────────────────┐
│ Infrastructure Layer (infrastructure/)                  │
│ - Adapters: MaxCompute, ClickHouse, MySQL, PostgreSQL   │
│ - Repositories: SQLAlchemy ORM 实现                     │
│ - Cache: Redis 缓存装饰器                                │
│ - Events: EventBus + EventDispatcher                    │
│ - Tasks: RQ 异步任务队列                                 │
└─────────────────────────────────────────────────────────┘
```

**2. 核心模式说明**
- **依赖注入 (DI)**: 使用 `dependency-injector` 管理 30+ Providers (Repositories, Services, Adapters)
- **适配器模式**: `AdapterFactory` 统一创建不同数据源适配器，支持扩展新数据源
- **仓储模式**: Repository 接口隔离数据访问逻辑 (如 `DatasetRepository`, `DatasourceRepository`)
- **CQRS**: Command (写操作) 和 Query (读操作) 分离，Handler 统一处理
- **领域事件**: 异步事件总线 (EventBus) + 事件处理器 (DatasetCreated → 触发元数据同步)
- **策略模式**: 文件交付策略 (< 20MB 飞书直传, ≥ 20MB OSS 预签名链接)

**3. 数据源适配器设计**
- **统一接口** (`BaseAdapter`): `test_connection()`, `execute_query()`, `get_tables()`, `get_table_schema()`
- **工厂创建** (`AdapterFactory.create_adapter(source_type, config)`): 根据类型返回具体适配器
- **支持数据源**: MaxCompute (PyODPS), ClickHouse (clickhouse-driver), MySQL (aiomysql), PostgreSQL (asyncpg)

#### 前端架构模式
- **单页应用 (SPA)**: React Router 客户端路由
- **组件化**: 原子化组件 (FieldSelector, FilterBuilder) + 页面组件 (GlassDatasets)
- **状态管理**:
  - 全局状态: Zustand (轻量级)
  - 服务端状态: TanStack Query (缓存 + 自动重试)
  - 表单状态: React Hooks (useState, useReducer)
- **API 封装**: Axios 拦截器统一处理认证 (X-User-Id) + 错误处理
- **响应式设计**: Tailwind CSS 工具类 + 玻璃态效果 (glassmorphism)

### Testing Strategy

**当前状态**: ⚠️ 测试覆盖不足

**已安装工具**:
- pytest 7.4.3 (测试运行器)
- pytest-cov 4.1.0 (覆盖率报告)
- pytest-asyncio 0.21.1 (异步测试支持)
- pytest-flask 1.3.0 (Flask 应用测试)
- pytest-mock 3.12.0 (Mock 工具)
- faker 20.1.0 (测试数据生成)

**当前实践**:
- 存在 `tests/` 目录，包含部分单元测试和集成测试
- 缺少完整的测试覆盖和持续集成配置
- 手工烟测：`curl http://localhost:81/health` (健康检查)

**推荐实践** (TBD - 待完善):
1. **单元测试**: 覆盖 Domain Services (SQL 生成、权限检查)、Handlers (Command/Query)
2. **集成测试**: API 端点测试 (使用 pytest-flask)、数据库操作测试
3. **测试命名**: `test_*.py` (文件名), `test_*` (函数名)
4. **测试运行**: `pytest tests/ -v --cov=app --cov-report=html`
5. **CI/CD**: 集成 GitHub Actions / GitLab CI 自动运行测试

### Git Workflow

**当前状态**: ⚠️ 未配置 Git 仓库 (本地开发阶段)

**推荐实践** (TBD - 待配置):
1. **提交规范**: 遵循 Conventional Commits
   - `feat: 添加 SQL Lab 虚拟数据集功能`
   - `fix: 修复数据源连接池泄漏问题`
   - `refactor: 重构数据提取任务队列为 RQ`
   - `docs: 更新 API 文档`
   - `test: 添加数据集创建测试用例`
   - `chore: 升级依赖版本`

2. **分支策略**: Git Flow
   - `main`: 生产环境代码
   - `develop`: 开发分支
   - `feature/*`: 功能开发分支
   - `hotfix/*`: 紧急修复分支

3. **Pull Request 规范**:
   - 标题: 简洁描述变更内容
   - 描述: 变更目的、影响范围、验证方式
   - 截图: UI 变更必须附截图
   - 关联: 链接相关 Issue/需求文档

4. **代码审查**: 至少 1 人 Approve 后合并

## Domain Context

### 核心领域概念

#### 1. 数据源 (DataSource)
- **定义**: 外部数据库/数仓连接配置 (MaxCompute, ClickHouse, MySQL, PostgreSQL)
- **关键属性**: `source_type`, `connection_config`, `status` (连接状态)
- **业务规则**: 
  - MaxCompute 使用 AK/SK + Endpoint 认证 (非 JDBC)
  - 其他数据源支持 JDBC 连接字符串
  - 连接池配置: `pool_size`, `max_overflow`, `pool_timeout`

#### 2. 数据集 (Dataset)
- **定义**: 注册的数据表或虚拟查询，作为数据提取的目标
- **三种类型**:
  - **物理表数据集** (PHYSICAL): 直接映射数据源中的物理表
  - **SQL 虚拟数据集** (VIRTUAL): 基于 SQL 查询定义的视图
  - **CSV 文件数据集** (FILE): 从上传的 CSV 文件创建
- **关键属性**: `dataset_code`, `source_id`, `physical_table`, `sql_query`, `file_metadata`, `fields`
- **业务规则**:
  - 字段元数据包含: `field_name`, `data_type`, `display_name`, `is_sensitive` (脱敏标记)
  - 敏感字段自动识别: 手机号、身份证、姓名、金额等

#### 3. 数据提取任务 (ExtractionTask)
- **定义**: 用户配置的定时或手动数据导出任务
- **关键属性**: `dataset_id`, `filter_conditions`, `row_limit`, `delivery_config`, `schedule_config`
- **业务规则**:
  - 过滤条件支持: 等于、包含、范围、枚举
  - 行数限制: 最大 100 万行 (防止资源耗尽)
  - 交付策略: 飞书直传 (< 20MB) / OSS 预签名链接 (≥ 20MB)

#### 4. 数据提取执行 (ExtractionRun)
- **定义**: 单次任务执行记录
- **关键属性**: `task_id`, `status`, `generated_sql`, `result_file_path`, `delivery_method`
- **业务规则**:
  - SQL 安全生成: 参数化查询、关键字白名单、分区强制注入
  - 字段脱敏: 手机号显示前 3 后 4 位、身份证显示前 6 后 4 位
  - 超时控制: MaxCompute 任务最多等待 10 分钟

### 安全与合规

#### SQL 注入防护
- **白名单机制**: 字段名、表名、操作符严格校验
- **值转义**: 字符串参数自动转义，拒绝 SQL 关键字 (DROP, DELETE, UPDATE, EXEC 等)
- **参数化查询**: 优先使用数据源驱动的参数化接口 (如 PyODPS `execute_sql_with_params`)

#### 数据脱敏规则
- **手机号**: `138****5678` (保留前 3 后 4 位)
- **身份证**: `110101****1234` (保留前 6 后 4 位)
- **姓名**: `张**` (保留姓氏)
- **金额**: 四舍五入到整数或千位

#### 权限控制 (TBD - 待完善)
- **认证**: 当前使用 Header `X-User-Id` 传递用户信息 (⚠️ 可伪造，需替换为 JWT)
- **授权**: 列级权限 (字段白名单) + 行级权限 (SQL WHERE 子句注入)
- **审计**: 记录所有数据访问行为 (谁/何时/访问了哪些数据)

### 外部集成

#### Superset 截图服务
- **认证**: JWT Token (优先) / 用户名密码
- **API**: `/api/v1/chart/{id}/screenshot`, `/api/v1/dashboard/{id}/screenshot`
- **轮询机制**: 提交截图任务后轮询等待完成 (最多 60 秒)

#### 飞书开放平台
- **消息推送**: 卡片消息 (文本 + 图片 + 按钮)
- **事件订阅**: `im.chat.member.bot.added_v1` (机器人入群)、`im.message.receive_v1` (接收消息)
- **文件上传**: 支持直接上传文件到飞书群聊 (最大 20MB)

#### 阿里云 OSS
- **用途**: 大文件存储 (≥ 20MB 的导出结果)
- **预签名 URL**: 生成 24 小时有效期下载链接

## Important Constraints

### 技术约束
- **Python 版本**: 3.11+ (依赖 `match-case` 语法、Pydantic v2)
- **Node.js 版本**: 18+ (Vite 5 要求)
- **PostgreSQL 版本**: 12+ (支持 JSONB 字段)
- **Redis 版本**: 6+ (RQ 任务队列)

### 业务约束
- **数据提取行数限制**: 单次最多 100 万行 (防止内存溢出)
- **查询超时**: MaxCompute 10 分钟、ClickHouse 30 秒、MySQL/PostgreSQL 60 秒
- **文件大小限制**: CSV 上传最大 50MB、飞书直传最大 20MB

### 安全约束
- **敏感配置**: 所有密钥必须通过环境变量配置 (`.env` / `.env.prod`)，禁止硬编码
- **飞书 Verification Token**: 事件回调必须验证 Token，防止伪造请求
- **SQL 执行**: 仅允许 SELECT 查询，禁止 DDL/DML 操作

### 部署约束
- **Docker 版本**: 20+ (支持 BuildKit)
- **容器资源**: 建议后端容器分配 2 CPU + 4GB 内存
- **数据持久化**: `instance/` 目录必须挂载 Docker Volume (存储上传文件和提取结果)

## External Dependencies

### 核心外部服务
1. **PostgreSQL** (元数据存储)
   - 用途: 存储数据源配置、数据集定义、任务配置、执行记录
   - 连接池: `pool_size=10, max_overflow=20`
   - 迁移工具: Flask-Migrate (Alembic)

2. **Redis** (缓存 + 任务队列)
   - 用途: RQ 任务队列、API 响应缓存、查询结果缓存
   - 持久化: RDB + AOF (生产环境)
   - TTL 策略: 查询结果缓存 1 小时

3. **MaxCompute** (阿里云数仓)
   - 认证: AccessKey + AccessKeySecret + Endpoint
   - 驱动: PyODPS 0.11.5
   - 特性: 强制分区过滤、Instance 轮询

4. **ClickHouse** (OLAP 数据库)
   - 驱动: clickhouse-driver 0.2.7
   - 连接: Native Protocol (9000 端口)

5. **Superset** (BI 平台)
   - 认证: JWT Token (优先) / 用户名密码
   - 截图 API: `/api/v1/chart/{id}/screenshot`
   - 超时: 请求 20 秒 + 轮询 60 秒

6. **飞书开放平台**
   - 认证: App ID + App Secret → Tenant Access Token
   - API 限流: 100 QPS (推送消息)
   - Webhook: 事件回调 URL 必须公网可访问

7. **阿里云 OSS** (对象存储)
   - 认证: AccessKey + AccessKeySecret
   - SDK: oss2 2.18.4
   - 用途: 大文件 (≥ 20MB) 存储和预签名链接生成

### 监控与日志 (TBD)
- **日志聚合**: 推荐 ELK Stack / Loki
- **指标监控**: 推荐 Prometheus + Grafana
- **错误追踪**: 推荐 Sentry
- **性能分析**: 推荐 Jaeger (分布式追踪)

---

**文档版本**: 1.0  
**最后更新**: 2026-01-21  
**维护者**: 根据代码库自动生成
