# Change: Add Universal Schema Browser Component

## Why

当前平台中元数据浏览功能分散在 `Editor.tsx`（查询中心）和 `DatasetRegister.tsx`（数据集注册）中，各自独立实现加载逻辑，无法复用。现有实现仅支持单级表列表，缺乏：
- 层级化导航（数据源→数据库→Schema→表→字段）
- 列/字段级元数据查看
- 关键字搜索与过滤
- 右键上下文菜单
- 双击插入到编辑器

需要将其重构为统一的、可复用的 `UniversalSchemaBrowser` 组件，满足 PRD `docs/prd/universal_schema_browser_prd.md` 的功能要求。

## What Changes

### 后端（Backend）
- **新增** `GET /api/v1/datasources/<id>/schemas` API —— 获取指定数据库的 Schema 列表（PostgreSQL 等支持 Schema 的数据源）
- **新增** `GET /api/v1/datasources/<id>/table-schema` API —— 获取表的字段列表与属性（名称、类型、注释、主键、分区键等）
- **扩展** `BaseAdapter` 接口 —— 新增 `list_schemas(database)` 方法
- **扩展** 各适配器（PostgreSQL、MySQL、ClickHouse、MaxCompute）实现 `list_schemas`

### 前端（Frontend）
- **新增** `src/components/business/SchemaBrowser/` —— 通用元数据浏览器组件
  - `SchemaBrowser.tsx` —— 主组件，树状层级导航
  - `SchemaTreeNode.tsx` —— 树节点渲染（含图标、类型标识）
  - `SchemaContextMenu.tsx` —— 右键上下文菜单
  - `useSchemaTree.ts` —— 数据加载 + 状态管理 Hook
  - `types.ts` —— TypeScript 类型定义
- **新增** `src/api/schema.ts` —— Schema 相关 API 封装
- **重构** `Editor.tsx` —— 用 `SchemaBrowser` 替换现有数据库结构面板
- **新增** `SaveAsDatasetDialog.tsx` —— 从查询中心直接保存为虚拟数据集（替代独立的 SQL 注册页面）
- ~~**重构** `DatasetRegister.tsx` —— 集成 `SchemaBrowser` 替换现有表选择器~~（延后，已由 `SaveAsDatasetDialog` 替代）

## Impact
- Affected specs: `frontend-ui` (MODIFIED), `schema-browser` (ADDED), `metadata-api` (ADDED)
- Affected code:
  - Backend: `app/interfaces/api/v1/datasources.py`, `app/infrastructure/adapters/datasources/*.py`
  - Frontend: `src/components/business/SchemaBrowser/*` (new), `src/components/business/SaveAsDatasetDialog.tsx` (new), `src/pages/QueryCenter/Editor.tsx`, `src/api/schema.ts` (new)
