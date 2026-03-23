## Context

平台需要一个统一的元数据浏览组件，用于在查询中心（SQL Editor）和数据集注册流程中浏览异构数据源的层级结构。当前两处各自独立实现了简单的表列表加载，缺少层级导航、字段查看、搜索、右键菜单等高级功能。

**利益相关方**：前端开发、后端 API 开发、数据分析用户
**约束**：需兼容 MaxCompute、MySQL、PostgreSQL、ClickHouse 四种数据源

## Goals / Non-Goals

### Goals
- 设计一个可复用的 `SchemaBrowser` 前端组件，支持在不同页面中嵌入
- 提供统一的树形层级：数据源 → 数据库 → Schema(可选) → 表/视图 → 字段
- 支持按需加载（Lazy Loading），首次仅加载顶层，展开时才请求子节点
- 支持本地关键字搜索与对象类型过滤
- 支持右键菜单（复制、生成 SELECT SQL、快速预览、刷新）
- 支持双击表名/字段名插入到 SQL 编辑器光标位置
- 通过 props/callback 机制解耦，让宿主页面控制交互行为
- 补充后端缺失的元数据 API（`list_schemas`、`get_table_schema`）

### Non-Goals
- 不实现拖拽交互（Drag & Drop）—— 延后到后续迭代
- 不实现全局后端搜索 —— 仅做本地客户端过滤
- 不实现 DDL 生成（Generate DDL）—— 延后
- 不实现跨数据源搜索
- 不实现连接状态实时感知（信号灯）—— 可在后续版本添加
- DatasetRegister 页面集成 SchemaBrowser —— 延后。当前迭代已用 `SaveAsDatasetDialog`（嵌入 Query Editor）替代独立的 SQL 注册页面

## Decisions

### 1. 组件架构：Headless Hook + UI 组件分离

**决定**：将数据逻辑封装在 `useSchemaTree` hook 中，UI 渲染由 `SchemaBrowser` 组件完成。

**理由**：
- Hook 可独立测试，也可被其他页面（如 DatasetRegister）以不同 UI 形式调用
- 组件通过 props（`onSelect`、`onDoubleClick`、`onInsert`）暴露事件，解耦宿主页面逻辑

**替代方案**：Zustand 全局 store → 过度设计，Schema Browser 状态无需全局共享

### 2. 树节点数据结构

**决定**：使用扁平化 Map 管理节点状态，key 为节点路径：

```typescript
type NodeKey = string  // e.g. "ds:1/db:mydb/schema:public/table:users"
interface TreeNode {
  key: NodeKey
  type: 'datasource' | 'database' | 'schema' | 'table' | 'view' | 'column'
  name: string
  parentKey: NodeKey | null
  children: NodeKey[]  // 子节点 keys
  loaded: boolean      // 子节点是否已加载
  loading: boolean
  expanded: boolean
  metadata?: Record<string, unknown>
}
```

**理由**：
- 扁平 Map 查找 O(1)，适合大规模表（数万张）下的局部更新
- 避免深层嵌套对象的不可变更新开销

### 3. 后端 API 扩展策略

**决定**：在现有 `datasources.py` 路由文件中新增 2 个端点，复用 DI 容器模式：
- `GET /api/v1/datasources/<id>/schemas?database=xxx` —— 返回 Schema 列表
- `GET /api/v1/datasources/<id>/table-schema?database=xxx&table=yyy&schema=zzz` —— 返回列信息

**理由**：
- 与已有 `get_databases`、`get_tables` 端点命名风格一致
- `get_table_schema` 后端适配器方法已存在，只需暴露为 REST API

### 4. 字段类型图标映射

**决定**：在前端维护类型映射表，将不同数据源的类型名统一映射为 5 种类别图标：

| 类别 | 匹配模式 | 图标 |
|------|---------|------|
| 文本 | varchar, text, char, string | `Type` |
| 数值 | int, bigint, decimal, float, double, number | `Hash` |
| 时间 | date, time, timestamp, datetime | `Calendar` |
| 布尔 | boolean, bool | `ToggleLeft` |
| 其他 | json, array, blob, binary... | `Braces` |

## Risks / Trade-offs

| 风险 | 缓解措略 |
|------|---------|
| 单库下表数量过大（>5000）导致树渲染卡顿 | 使用虚拟滚动（`react-window`），或分页加载前 500 + 搜索 |
| MaxCompute `list_schemas` 不适用 | MaxCompute 跳过 Schema 层级，直接从 Database 到 Table |
| MySQL 没有 Schema 概念 | MySQL 跳过 Schema 层级，Database 直接到 Table（MySQL 的 database 即 schema） |
| 右键菜单产生 SQL 用到未知语法 | SELECT 生成使用通用的 `SELECT * FROM <table> LIMIT 100` 模板 |

## UI Design Specification

### 5. 整体布局 (Overall Layout)

SchemaBrowser 作为一个独立的侧面板组件，嵌入宿主页面的右侧（Query Editor）或左侧（Dataset Register）。

```
┌─────────────────────────────────────────────────────────────┐
│  SchemaBrowser Panel (width: 280px, resizable)              │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🔍 搜索表名或字段...                          [≡ Filter]│ │  ← 搜索栏
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │  🗄️  analytics_db                            [↻ 刷新]  │ │  ← 数据库节点
│ │  ├─ 📁 public                                          │ │  ← Schema 节点
│ │  │  ├─ 🟩 users  ·························· 用户表     │ │  ← 表（展开态）
│ │  │  │  ├─ 🔑 id ························ INT           │ │  ← 主键列
│ │  │  │  ├─ T  username ·················· VARCHAR       │ │  ← 文本列
│ │  │  │  ├─ T  email ····················· VARCHAR       │ │  ← 文本列
│ │  │  │  ├─ 📅 created_at ················ TIMESTAMP     │ │  ← 时间列
│ │  │  │  └─ ⊘  is_active ················· BOOL          │ │  ← 布尔列
│ │  │  ├─ 🟩 orders                                       │ │  ← 折叠态
│ │  │  ├─ 🟩 products                                     │ │  ← 折叠态
│ │  │  └─ 👁️ v_daily_stats                                │ │  ← 视图
│ │  └─ 📁 staging                                         │ │
│ │  🗄️  warehouse_db                                      │ │  ← 折叠态
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 共 4 张表 · 1 个视图 · public schema                   │ │  ← 状态栏
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

在 Query Editor 中的嵌入方式：

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 工具栏: [< 返回] [选择数据源 ▼]           [格式化] [保存] [导出] [▶ 执行查询] │
├───────────────────────────────────────────────┬──────────────────────────────┤
│ 查询 1  +                                     │ 📚 数据库结构          [>]  │
│ ─────────────────────────────────────────────  │ ────────────────────────── │
│ SELECT * FROM users                           │ 🔍 搜索...                  │
│ WHERE created_at > '2024-01-01'               │ ┌ 🗄️ analytics_db          │
│ LIMIT 100                                     │ │ └ 📁 public               │
│                                               │ │   ├ 🟩 users  ← 双击插入  │
│                                               │ │   ├ 🟩 orders             │
│ (Monaco Editor)                               │ │   └ 👁️ v_daily_stats      │
│                                               │ └ 🗄️ warehouse_db          │
├───────────────────────────────────────────────┤                              │
│ 查询结果                                      │                              │
│ ┌───────┬──────────┬───────────┐              │                              │
│ │ id    │ username │ email     │              │                              │
│ ├───────┼──────────┼───────────┤              │                              │
│ │ 1     │ alice    │ a@x.com   │              │                              │
│ └───────┴──────────┴───────────┘              │                              │
└───────────────────────────────────────────────┴──────────────────────────────┘
```

### 6. 设计 Token (Design Tokens)

#### 颜色系统

| Token                     | 值                          | 用途                   |
|---------------------------|-----------------------------|----------------------|
| `--sb-bg`                 | `#ffffff`                   | 面板背景               |
| `--sb-bg-hover`           | `#f3f4f6` (gray-100)       | 行悬浮背景             |
| `--sb-bg-selected`        | `#eef2ff` (indigo-50)      | 选中行背景             |
| `--sb-bg-selected-border` | `#6366f1` (indigo-500)     | 选中行左边框           |
| `--sb-text`               | `#374151` (gray-700)       | 主文本颜色             |
| `--sb-text-secondary`     | `#9ca3af` (gray-400)       | 注释/类型文本          |
| `--sb-text-search`        | `#eab308` (yellow-500)     | 搜索匹配高亮背景       |
| `--sb-border`             | `#e5e7eb` (gray-200)       | 分隔线                |
| `--sb-indent-guide`       | `#e5e7eb` (gray-200)       | 层级缩进引导线         |

#### 图标颜色

| 节点类型    | 图标          | 颜色                         |
|------------|--------------|------------------------------|
| 数据库      | `Database`   | `#6366f1` (indigo-500)       |
| Schema     | `Folder`     | `#8b5cf6` (violet-500)       |
| 表 (Table) | `Table2`     | `#22c55e` (green-500)        |
| 视图 (View)| `Eye`        | `#06b6d4` (cyan-500)         |
| 文本列      | `Type`       | `#f97316` (orange-500)       |
| 数值列      | `Hash`       | `#3b82f6` (blue-500)        |
| 时间列      | `Calendar`   | `#8b5cf6` (violet-500)      |
| 布尔列      | `ToggleLeft` | `#22c55e` (green-500)       |
| 其他列      | `Braces`     | `#6b7280` (gray-500)        |
| 主键        | `Key`        | `#eab308` (yellow-500)      |
| 分区键      | `Puzzle`     | `#ec4899` (pink-500)        |

#### 尺寸

| Token              | 值       | 用途                |
|--------------------|---------|--------------------|
| `--sb-panel-width` | `280px` | 面板默认宽度         |
| `--sb-row-height`  | `28px`  | 每行高度             |
| `--sb-indent`      | `16px`  | 每层缩进量           |
| `--sb-icon-size`   | `14px`  | 图标尺寸             |
| `--sb-font-size`   | `13px`  | 节点名文字大小       |
| `--sb-badge-size`  | `11px`  | 类型标签文字大小      |
| `--sb-search-h`    | `36px`  | 搜索框高度           |

### 7. 树节点渲染规则 (Tree Node Rendering)

每个树节点行的结构如下：

```
 ┌───────────────────────────────────────────────────────────┐
 │ [indent] [chevron] [icon] [name]          [badge] [badge] │
 └───────────────────────────────────────────────────────────┘
```

#### 各部分说明

| 部分       | 说明                                                        |
|-----------|-------------------------------------------------------------|
| `indent`  | 根据层级深度，每层 16px 缩进，带垂直引导线（1px solid gray-200）|
| `chevron` | 可展开节点显示 `ChevronRight`(折叠) 或 `ChevronDown`(展开)；列节点无箭头 |
| `icon`    | 按上方图标颜色表渲染对应类型图标，14×14px                       |
| `name`    | 节点名称，13px，gray-700；搜索匹配字符用 yellow-100 背景高亮     |
| `badge`   | 列节点右侧显示数据类型名称标签（11px, gray-400）；主键显示 🔑 金色标签 |

#### 节点交互状态

```css
/* 默认态 */
.tree-node {
  height: 28px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  border-left: 2px solid transparent;
  transition: background 150ms, border-color 150ms;
}

/* 悬浮态 */
.tree-node:hover {
  background: var(--sb-bg-hover);  /* #f3f4f6 */
}

/* 选中态 */
.tree-node.selected {
  background: var(--sb-bg-selected);        /* #eef2ff */
  border-left-color: var(--sb-bg-selected-border); /* #6366f1 */
}

/* 加载态 */
.tree-node.loading .icon {
  animation: spin 1s linear infinite;  /* 旋转动画 */
}
```

### 8. 搜索栏 (Search Bar)

```
┌──────────────────────────────────────────────────┐
│ 🔍 │ 搜索表名或字段...                    │ [≡] │
└──────────────────────────────────────────────────┘
      ↑ input (autofocus: false)              ↑ filter popover trigger
```

- 高度 36px，圆角 6px，边框 gray-200
- 搜索图标 `Search` 16px，gray-400
- 输入框 13px，gray-700，placeholder gray-400
- 右侧过滤按钮点击后弹出 popover：

```
┌─────────────────────┐
│ 📋 对象类型过滤      │
│ ─────────────────── │
│ ☑ 表 (Tables)       │
│ ☑ 视图 (Views)      │
│ ☐ 系统表            │
└─────────────────────┘
```

- 输入时实时过滤（debounce 200ms）
- 匹配节点的父路径自动展开
- 匹配文本用 `<mark>` 标签包裹（背景 yellow-100）

### 9. 右键上下文菜单 (Context Menu)

使用 shadcn/ui 的 `ContextMenu` 组件，样式与平台一致。

#### 表节点菜单

```
┌─────────────────────────────┐
│ 📋  复制表名                 │
│ 📋  复制完整路径             │
│ ─────────────────────────── │
│ ▷   生成 SELECT 语句        │
│ 👁   预览数据 (前50行)       │
│ ─────────────────────────── │
│ ↻   刷新                    │
└─────────────────────────────┘
```

#### 列节点菜单

```
┌─────────────────────────────┐
│ 📋  复制字段名               │
│ 📋  复制完整引用路径          │
│ ─────────────────────────── │
│ ↻   刷新                    │
└─────────────────────────────┘
```

#### 数据库/Schema 节点菜单

```
┌─────────────────────────────┐
│ 📋  复制名称                 │
│ ─────────────────────────── │
│ ↻   刷新                    │
└─────────────────────────────┘
```

### 10. 空状态与加载状态

#### 初始空状态（未选择数据源）

```
┌─────────────────────────────────────────────┐
│                                             │
│          [数据库图标 48px, gray-300]          │
│                                             │
│          请先选择数据源                       │
│        选择后将显示数据库结构                  │
│                                             │
└─────────────────────────────────────────────┘
```

- 图标 `Database`, 48×48px, gray-300
- 主文案 14px, gray-500, font-medium
- 副文案 12px, gray-400

#### 节点加载中

- 展开节点时，子节点区域显示 3 行 Skeleton 条：
  ```
  ├─ ░░░░░░░░░░░░░░  (skeleton, h-4, w-3/4, gray-200 animate-pulse)
  ├─ ░░░░░░░░░░░     (skeleton, h-4, w-2/3)
  └─ ░░░░░░░░░░░░    (skeleton, h-4, w-1/2)
  ```

#### 搜索无结果

```
┌─────────────────────────────────────────────┐
│                                             │
│          [搜索图标 32px, gray-300]           │
│                                             │
│       未找到匹配的表或字段                    │
│       尝试使用其他关键字                      │
│                                             │
└─────────────────────────────────────────────┘
```

### 11. 动画与过渡

| 交互           | 动画                                       | 时长    |
|---------------|--------------------------------------------|--------|
| 节点展开/折叠   | 子节点区域 `max-height` + `opacity` 过渡     | 200ms  |
| 悬浮高亮       | `background-color` transition              | 150ms  |
| Chevron 旋转   | `transform: rotate(90deg)` transition      | 200ms  |
| 加载旋转       | `@keyframes spin` 360° rotation            | 1000ms |
| 搜索高亮闪烁    | 匹配项背景 yellow-100 `pulse` 一次后保持     | 300ms  |
| 右键菜单弹出    | `scale(0.95) → scale(1)` + `opacity`       | 150ms  |

### 12. 面板折叠/展开

在 Query Editor 中，SchemaBrowser 面板支持折叠：

**展开态**（默认）：
```
│ 📚 数据库结构                          [<] │  ← 点击 [<] 折叠
│ ────────────────────────────────────────── │
│ (树形内容)                                  │
```

**折叠态**：
```
│ [>] │  ← 竖向面板, 宽度 36px
│ 📚  │     点击 [>] 展开
│ 数  │
│ 据  │
│ 库  │
│ 结  │
│ 构  │
```

- 折叠动画：`width: 280px → 36px`，duration 300ms，ease-in-out
- 折叠时树形内容隐藏（`overflow: hidden`），仅保留竖排标题

## Open Questions

- 是否需要对元数据结果做服务端缓存（Redis）？当前计划先不缓存，按需查询。
- 虚拟滚动的具体阈值（多少张表时启用）？初始建议 200+。
