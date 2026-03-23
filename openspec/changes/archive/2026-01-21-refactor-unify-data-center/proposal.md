# Change: 统一数据中心 - 整合数据源与数据集管理

## Why

当前系统中"数据源管理"和"数据集管理"作为独立模块存在，导致：
1. **数据资产分散**：用户需要在两个独立入口之间切换，缺乏整体视角
2. **概念割裂**：数据源和数据集本质上构成"数据底座"的两个层次，但在 UI 和架构上分离
3. **权限管理复杂**：两个独立模块需要分别配置权限，增加管理成本
4. **API 路径不统一**：`/api/v1/datasources` 和 `/api/v1/datasets` 缺乏层次关系

## What Changes

### 后端 API 重构
- **BREAKING**: 将 `/api/v1/datasources/*` 迁移至 `/api/v1/data-center/datasources/*`
- **BREAKING**: 将 `/api/v1/datasets/*` 迁移至 `/api/v1/data-center/datasets/*`
- 不保留旧路径的兼容性重定向，直接全部迁移。
- 统一错误码和响应格式（如已统一则无需改动）

### 前端导航重构
- 移除顶级菜单项："数据源" 和 "数据集"
- 新增顶级菜单项："数据中心"（带折叠子菜单）
  - 子菜单 1: "数据源"（路由: `/data-center/datasources`）
  - 子菜单 2: "数据集"（路由: `/data-center/datasets`）
- 保持现有功能不变，仅调整路由和导航层级

### 前端路由调整
- `/datasources` → `/data-center/datasources`
- `/datasets` → `/data-center/datasets`
- `/datasets/register` → `/data-center/datasets/register`
- 相关子路由同步更新

### API 客户端更新
- 更新 `frontend/src/api/datasources.ts` 和 `frontend/src/api/datasets.ts` 的 base URL
- 确保所有 API 调用使用新路径

## Impact

### Affected Specs
- 新增 `data-center` capability（包含数据源和数据集的统一管理规范）
- 可能影响 `datasource-management` 和 `dataset-management` specs（如已存在）

### Affected Code

**后端**:
- `app/interfaces/api/v1/datasources.py` - Blueprint URL prefix
- `app/interfaces/api/v1/datasets.py` - Blueprint URL prefix
- `app/__init__.py` - Blueprint 注册路径

**前端**:
- `frontend/src/components/Layout/GlassAppLayout.tsx` - 导航菜单结构
- `frontend/src/App.tsx` - 路由定义
- `frontend/src/api/datasources.ts` - API base URL
- `frontend/src/api/datasets.ts` - API base URL
- `frontend/src/pages/GlassDashboard.tsx` - 快捷入口链接
- 所有使用 `useNavigate()` 跳转到数据源/数据集页面的组件

**文档**:
- `docs/readme.md` - API 文档更新
- `openspec/project.md` - 项目结构更新

### Breaking Changes
- ⚠️ **API 路径变更**: 依赖旧 API 路径的外部系统需要更新
- ⚠️ **前端路由变更**: 书签和外部链接需要更新

### Migration Strategy
1. 彻底移除旧路径支持

## Non-Goals
- 不合并数据源和数据集的数据库表结构
- 不改变现有业务逻辑和权限模型
- 不新增数据血缘、数据质量等高级功能（留作后续迭代）
- 不影响查询中心、数据提取、智能问数等其他模块
