# API 迁移完成总结

## 迁移完成时间

2026-01-16

## 迁移概述

已完成从旧架构（routes + services）到新架构（Hexagonal + DDD + CQRS）的完全迁移。

---

## API 路径变更

### 旧路径 → 新路径

所有核心业务 API 已从 `/api/*` 迁移到 `/api/v1/*`：

| 旧路径 | 新路径 | 状态 |
|--------|--------|------|
| `/api/datasources` | `/api/v1/datasources` | ✅ 已迁移 |
| `/api/datasets` | `/api/v1/datasets` | ✅ 已迁移 |
| `/api/extraction` | `/api/v1/extraction` | ✅ 已迁移 |

---

## 完整的 API 端点清单

### 1. 数据源管理 API

**基础路径**: `/api/v1/datasources`

| 方法 | 端点 | 功能 | Handler |
|------|------|------|---------|
| GET | `/` | 数据源列表（分页、筛选） | ListDatasourcesHandler |
| GET | `/:id` | 数据源详情 | GetDatasourceHandler |
| POST | `/` | 创建数据源 | CreateDatasourceHandler |
| PUT | `/:id` | 更新数据源 | UpdateDatasourceHandler |
| DELETE | `/:id` | 删除数据源 | DeleteDatasourceHandler |
| POST | `/:id/test` | 测试连接 | TestConnectionHandler |
| GET | `/:id/databases` | 获取数据库列表 | GetDatabasesHandler |
| GET | `/:id/tables` | 获取表列表（带缓存） | GetTablesHandler |
| GET | `/statistics` | 统计信息 | GetStatisticsHandler |
| GET | `/types` | 支持的数据源类型 | - |

### 2. 数据集管理 API

**基础路径**: `/api/v1/datasets`

| 方法 | 端点 | 功能 | Handler |
|------|------|------|---------|
| GET | `/` | 数据集列表（分页、筛选） | ListDatasetsHandler |
| GET | `/:id` | 数据集详情 | GetDatasetHandler |
| POST | `/` | 创建数据集 | CreateDatasetHandler |
| PUT | `/:id` | 更新数据集 | UpdateDatasetHandler |
| DELETE | `/:id` | 删除数据集（软删除） | DeleteDatasetHandler |
| POST | `/preview` | 预览数据集Schema | PreviewDatasetHandler |
| GET | `/statistics` | 统计信息 | GetStatisticsHandler |

### 3. 数据提取 API

**基础路径**: `/api/v1/extraction`

| 方法 | 端点 | 功能 | Handler |
|------|------|------|---------|
| GET | `/tasks` | 任务列表（分页、筛选） | ListTasksHandler |
| GET | `/tasks/:id` | 任务详情 | GetTaskHandler |
| POST | `/tasks` | 创建任务 | CreateTaskHandler |
| PUT | `/tasks/:id` | 更新任务 | UpdateTaskHandler |
| DELETE | `/tasks/:id` | 删除任务 | DeleteTaskHandler |
| POST | `/tasks/:id/execute` | 执行任务 | ExecuteTaskHandler |
| POST | `/preview` | 数据预览 | PreviewDataHandler |
| GET | `/runs` | 执行历史列表 | ListRunsHandler |
| GET | `/runs/:id` | 执行详情 | GetRunHandler |
| GET | `/health` | 健康检查 | - |

---

## 架构层次

### Domain 层（领域层）

```
app/domain/
├── entities/
│   ├── data_source.py          ✅ 已有
│   ├── dataset.py               ✅ 已有
│   ├── dataset_field.py         ✅ 已有
│   ├── extraction_task.py       ✅ 已有
│   └── extraction_run.py        ✅ 已有
├── ports/repositories/
│   ├── datasource_repository.py ✅ 新增
│   ├── dataset_repository.py    ✅ 已有
│   └── extraction_repository.py ✅ 已有
└── services/
    ├── sql_generator.py         ✅ 已有
    └── permission_checker.py    ✅ 已有
```

### Application 层（应用层）

```
app/application/
├── datasource/                  ✅ 已迁移
│   ├── commands/                (3个)
│   ├── queries/                 (6个)
│   ├── handlers/                (9个)
│   └── schemas/                 (1个)
├── dataset/                     ✅ 已迁移
│   ├── commands/                (4个)
│   ├── queries/                 (4个)
│   ├── handlers/                (6个)
│   └── schemas/                 (1个)
└── extraction/                  ✅ 已完成
    ├── commands/                (4个)
    ├── queries/                 (4个)
    ├── handlers/                (4个)
    └── schemas/                 (1个)
```

### Infrastructure 层（基础设施层）

```
app/infrastructure/
├── repositories/
│   ├── datasource_repository.py ✅ 新增
│   ├── dataset_repository.py    ✅ 已有
│   └── extraction_repository.py ✅ 已有
├── adapters/
│   ├── datasources/             ✅ 已迁移
│   ├── feishu/                  ✅ 已迁移
│   └── file_delivery/           ✅ 已迁移
├── cache/
│   ├── redis_client.py          ✅ 已有
│   └── decorators.py            ✅ 已有
└── tasks/
    ├── task_queue.py            ✅ 已有
    ├── jobs/                    ✅ 已有
    └── rq_worker.py             ✅ 已有
```

### Interface 层（接口层）

```
app/interfaces/api/v1/
├── datasources.py               ✅ 新增
├── datasets.py                  ✅ 新增
└── extraction.py                ✅ 已有
```

---

## 已删除的文件

### Routes（旧路由）

- ❌ `app/routes/datasources.py` (删除)
- ❌ `app/routes/datasets.py` (删除)
- ❌ `app/routes/extraction.py` (删除)
- ❌ `app/routes/pages.py` (删除)
- ❌ `app/routes/data_export.py` (删除)

### Services（旧服务）

- ❌ `app/services/datasource_service.py` (删除)
- ❌ `app/services/dataset_service.py` (删除)
- ❌ `app/services/extraction_service.py` (删除)

---

## 保留的文件

以下文件保留（非核心业务或特殊用途）：

- ✅ `app/routes/health.py` - 健康检查
- ✅ `app/routes/config.py` - 配置 API
- ✅ `app/routes/feishu.py` - 飞书 Webhook
- ✅ `app/routes/index.py` - 旧页面入口（可后续删除）
- ✅ `app/routes/metadata_sync.py` - 元数据同步

---

## 技术特性

### CQRS 模式

- **写操作（Commands）**: 使用 ORM + Repository
- **读操作（Queries）**: 使用 SQLAlchemy Core 提升性能

### 异步任务

- 使用 RQ (Redis Queue) 处理长时间任务
- 测试连接、数据提取、Schema 同步等操作异步执行

### 缓存策略

- 表列表查询使用 Redis 缓存（TTL: 1小时）
- 支持强制刷新（`force_refresh=true`）

### 认证授权

- JWT Token 认证（`@require_auth`）
- 向后兼容 `X-User-Id` header
- 可选认证（`@optional_auth`）

---

## 前端调整

### API 基础路径

前端 axios 客户端已配置为 `/api/v1`：

```typescript
// frontend/src/api/client.ts
const apiClient = axios.create({
  baseURL: '/api/v1',  // 已更新
  ...
})
```

### 无需修改

所有前端 API 调用无需修改，因为原本就使用了相对路径。

---

## 启动与测试

### 启动服务

```bash
# 完整启动（包含前端）
./start_fullstack.sh

# 仅启动后端（旧方式仍可用）
docker-compose up -d --build
```

### 测试 API

```bash
# 健康检查
curl http://localhost/api/v1/extraction/health

# 数据源列表
curl http://localhost/api/v1/datasources

# 数据集列表
curl http://localhost/api/v1/datasets

# 提取任务列表
curl http://localhost/api/v1/extraction/tasks
```

---

## 验收标准

- [x] 所有旧 routes 文件已删除
- [x] 所有旧 services 文件已删除
- [x] 所有 API 端点使用 `/api/v1/*` 路径
- [x] Datasource 模块完全遵循新架构
- [x] Dataset 模块完全遵循新架构
- [x] Extraction 模块完全遵循新架构
- [x] Flask App 正确注册新 API
- [ ] Docker Compose 启动成功（待测试）
- [ ] 所有 API 端点正常工作（待测试）
- [ ] 前端页面正常调用新 API（待测试）

---

## 下一步

1. **测试验证**: 启动服务并测试所有 API 端点
2. **前端对接**: 验证前端 React 应用与新 API 的集成
3. **数据库迁移**: 确认所有数据库表结构正确
4. **文档补充**: 补充 API 使用示例和 Swagger 文档

---

## 相关文档

- [架构重构记录](./ARCHITECTURE_REFACTORING.md)
- [迁移指南](./MIGRATION_GUIDE.md)
- [前后端分离部署](./FRONTEND_DEPLOYMENT.md)
- [快速参考](../QUICK_REFERENCE.md)
