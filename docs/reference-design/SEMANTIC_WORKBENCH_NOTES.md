# 语义工作台设计草案与 IA 记录

## 状态说明

本文件保存语义工作台相关的 Pencil 画布说明、IA 草案与页面结构记录。
它是工作草案，不是当前实现的唯一事实来源。

使用规则：

- 查看当前实现与路由，以 `../TECH_STACK_AND_ARCHITECTURE.md`、`../../frontend/src/App.tsx` 和当前代码为准
- 查看当前文档可信度，以 `../DOC_ALIGNMENT_REPORT.md` 为准
- 当草案结论已经落地，应回写到基线文档，而不是只留在本文件

## Pencil 设计草案（`test_pencil.pen`）

- **状态**：仓库根目录 `test_pencil.pen` 为 Pencil 画布；当前主画板为 **「方案：简洁清晰 · 语义工作台」**（根节点 `Ak9tC`），旁附设计说明便签 `I0Dd6`
- **方向**：两栏（列表 + 详情）、顶栏单一主操作「新建」、浅底白卡片与细描边、无重阴影；设计变量含 `bg`、`surface`、`text-primary`、`text-muted`、`accent`、`border`
- **维护**：仅能通过 Pencil MCP 读写 `.pen` 内容；不要用普通编辑器直接编辑该文件
- **Semantic Studio（现代数据栈 · 浅色）**：一屏 **`N5xH0`**（`y≈860`，1440×900）已改为浅色工作台：`$bg` / `$surface` / `$text-primary` / `$accent` / `$border`，卡片区 `#F8FAFC`、表/代码区 `#F1F5F9`；结构仍为顶栏 + 语义侧栏 + 三栏主区（资源树 / 度量维度 / Trino 预览）
- **语义中心 IA 线框（UI/UX）**：浅色工作台风；画布 **`y≈1488`** 有 **`Wid6n`「线框规范 · Semantic Workbench」**；**`y≈1640`** 起 **`Wjt8o` 导览条**，**`y≈1780`** 起两列七屏；帧名含路由：`7FtuD`、`3ovHD`、`qn4om`、`ELRiv`、`JFxWh`、`Vo0KG`、`nhCQS`
- **全站 IA 便签**：画布 **`y≈4570`**、节点 **`OyYAZ`**「全站 IA · 企业数据平台」；正文以本文件最后的“企业级数据平台 · 全站 IA”小节为准
- **平台 IA 线框**：**`XETzc`**「① 语义中心」→ **`W7rUp`**「② 数据中心」→ **`r2JDR`**「③ 查询中心」；说明便签 **`jjj75`**

## 语义中心信息架构（IA）

### 总纲

| 模块 | 职责 | 不承担 |
|------|------|--------|
| **总览** | 解释模块职责与整体状态 | 分诊、入口跳转决策 |
| **Cube 管理** | 找对象、判状态、进编辑 | 单 Cube 定义维护 |
| **Cube Studio** | 单个 Cube 定义维护 | 领域 Join、查询调试 |
| **领域目录** | 目录治理、领域筛选 | 画布编辑 |
| **领域建模** | 关系组织、Join、发布检查 | 目录治理 |
| **开发工具** | 定义文件、编译调试、Schema 同步 | 扩成“第二后台” |

设计原则：**KISS**（页目标单一）、**YAGNI**（不设 View/Recipe 独立一级页）、**SOLID**（页职责与服务职责对齐）、**DRY**（状态、摘要、Inspector、上下文条复用）

### 推荐路径

| 路径 | 页面组件 |
|------|-----------|
| `/semantic/overview` | `Overview.tsx` |
| `/semantic/cubes` | `Playground.tsx` |
| `/semantic/cubes/new` | `RelationCanvas.tsx` |
| `/semantic/cubes/:name` | `RelationCanvas.tsx` |
| `/semantic/cubes/:name/edit` | `RelationCanvas.tsx` |
| `/semantic/domains` | `DomainList.tsx` |
| `/semantic/modeling` | `DomainModelingEntry.tsx` |
| `/semantic/domains/:id` | `DomainCanvas.tsx` |
| `/semantic/tools` | `DevTools.tsx` |

侧栏固定文案：总览、Cube 管理、领域目录、领域建模、开发工具。
`View 管理`、`Recipe 管理`、`Schema 治理` 不进一级侧栏，可挂在详情页或工具页。

注：为尽快让新设计直接参与前后端联调，当前在线主路由已经切到 `Playground.tsx` / `RelationCanvas.tsx`；`CubeList.tsx` 与 `CubeStudio.tsx` 作为旧实现保留在仓库中，但不再挂主路由。

### 页面级草案

- **总览**：轻页头 + 一条上下文条 + 模块职责列表；不展示风险分诊和营销式入口卡片
- **Cube 管理**：标题 + 新建；单层筛选；表格主区；选中后才显示右侧预览
- **Cube Studio**：轻页头 + 单条上下文 + 左步骤轨 + 中任务面板 + 右建模摘要；不含领域关系和查询调试
- **领域目录**：轻页头 + 上下文 + 左目录 rail + 中治理列表 + 右摘要
- **领域建模入口**：左创建草稿，右草稿/已发布列表；入口页非画布
- **领域画布**：轻页头 + 上下文 + 左 Cube 库 + 中画布 + 右 Inspector
- **开发工具**：轻页头 + 上下文 + 左资源树 + 中 workspace；固定三个 Tab：定义文件、编译调试、Schema 同步

### 跨页规则

- 页头只写模块功能，不写流程
- 上下文条只写当前范围、对象、状态、数量
- 主面板每页只保留一个主任务区；Inspector 按需出现
- 状态文案统一：草稿、已发布、校验失败、未绑定、已废弃、漂移告警

### 前端实现提示

- 类型与映射：`../../frontend/src/lib/semantic-ia.ts`
- Hooks：`../../frontend/src/hooks/semantic-ia/`
- 页面职责：页面组件负责 URL 和 UI 编排；筛选、派生列表、默认选中等逻辑下沉到 hook 或 `lib`

## 企业级数据平台 · 全站 IA

**目标用户**：数据工程师、分析师、数据产品经理。  
**索引便签**：`test_pencil.pen` 内 **`OyYAZ`**、**`XETzc`**、**`W7rUp`**、**`r2JDR`**、**`jjj75`**。

### 一级导航

| 一级 | 说明 |
|------|------|
| **控制台** | 个人/空间级指标与快捷入口 |
| **查询中心** | 取数、写 SQL、可视化构建、资产与调度 |
| **数据中心** | 数据源、数据集 |
| **应用中心** | 应用市场、执行监控 |
| **语义中心** | 总览、Cube、领域、建模、工具 |
| **智能问数** | 对话式取数 |
| **配置中心** | 渠道、订阅等运营配置 |

### 主要页面

| 模块 | 页面 |
|------|------|
| **控制台** | Dashboard |
| **查询中心** | 查询台、SQL 编辑器、可视化构建、我的查询、历史、模板库、定时任务 |
| **数据中心** | 数据源列表、数据集列表、数据集详情、数据集注册 |
| **应用中心** | 应用市场、应用详情、执行监控 |
| **语义中心** | 总览、Cube 管理、Cube 编辑、领域目录、领域建模入口、领域画布、View 详情、开发工具 |

### 模板划分

- **列表页模板**：数据源、数据集列表、应用市场、执行监控、Cube 管理、领域目录、我的查询、查询历史、模板库、定时任务、语义总览
- **详情页模板**：数据集详情、应用详情、Cube/View 只读详情
- **工作台模板**：SQL 编辑器、可视化构建、Cube Studio、领域画布、数据集注册向导、开发工具、智能问数

## 本体语义工作台 · IDE 风重构草案

**状态**：线下 HTML 草案，未进仓主干；验证通过即回写到基线并废弃草案文件。

- **产出位置**：`tmp/ontology-workbench-redesign/index.html`（单文件 demo，Tailwind CDN + 原生 JS + mock 数据；不提交到 git）
- **预览方式**：`cd tmp/ontology-workbench-redesign && python3 -m http.server 8899`，浏览器打开 `http://localhost:8899/index.html`
- **对标现状**：`frontend/src/pages/Semantic/OntologyWorkbenchV2.tsx`（5 个顶部 Tab + 对象详情 5 个子 Tab）

### 信息架构调整

| 维度 | 现状 | 草案 |
|------|------|------|
| 主导航 | 顶部 5 Tab（总览/对象/指标/关系/治理） | 左侧 Rail（5 项）+ 动态 Sidebar 二级导航 |
| 多实体编辑 | 同时只能看一个 | 顶部 Tab Strip 支持多实体并行 |
| 全局查找 | 各页独立搜索框 | ⌘K 命令面板（对象/指标/关系/规则 + 操作项） |
| 对象详情 | 5 个子 Tab | 保留，沉入 Sidebar 的对象卡 + 主区 Tab 内嵌 |
| 右侧信息 | 无 | 常驻 Inspector（选中态摘要、统计、快捷操作） |

### 五视图覆盖

- **总览**：健康指标卡（对象/指标/关系/规则/风险）、对象覆盖矩阵、待办治理、近期活动、快捷操作（AI 建模 / 导入 YAML / 导出资产）
- **对象**：Sidebar 按领域分组 + 主区列表/详情，详情沿用定义/字段/关系/规则/历史 5 个子 Tab；关系子 Tab 内嵌以当前对象为中心的迷你 SVG 关系图
- **指标**：按对象归组的 Sidebar + 主区表格（绑定状态、口径类型、审计态）
- **关系**：类型分组 Sidebar + 主区关系表 + 全局 SVG 关系图
- **治理**：规则 / 策略 / 审计三分段，复用 Inspector 看具体条目

### 视觉与交互规范

- 设计 token：CSS 变量 `--bg/--surface/--border/--text-primary/--text-muted/--accent`，支持 Light/Dark 切换（延续 `DESIGN.md` 的浅色工作台基调）
- 密度：Sidebar 12px 字 / 32px 行高；主区 13px；表格紧凑行高 34px
- 顶部永远暴露「变更 N · 发布」；底部状态栏显示 git 分支、最近同步、环境
- 键盘：⌘K 全局搜索、Esc 关面板、↑↓ 选、⌘↵ 新 Tab 打开

### 已验证路径

- Rail 切换：总览 ↔ 对象 ↔ 指标 ↔ 关系 ↔ 治理
- Sidebar 点击订单 → 主区加载对象详情（定义子 Tab）
- ⌘K 弹出命令面板，显示操作项 + 对象结果，Esc 关闭

### 落地建议

- 先把 Rail + Sidebar + Tab Strip + Inspector 四件套抽成 `Semantic/layout/*` 组件，复用给其他语义页面
- 命令面板改造为独立 `useCommandPalette` hook，挂 App 根节点，跨页可用
- 对象详情子 Tab 保留既有 URL 参数（`tab=definition|fields|relations|rules|history`），不破坏现有深链

## 平台全站 · IDE 风统一 Demo

**状态**：线下 HTML 草案，继承上一节语义工作台的视觉语言，覆盖全部子功能；不提交到 git。

- **产出位置**：`tmp/platform-redesign/`（单页站点；`index.html` + `assets/*` + `assets/modules/*`；依赖仅 Google Fonts 与 lucide CDN）
- **预览方式**：`cd tmp/platform-redesign && python3 -m http.server 4173`，浏览器打开 `http://127.0.0.1:4173/index.html`
- **替代关系**：本 Demo 承载 `tmp/ontology-workbench-redesign` 的所有能力，后者作为单功能验证保留，后续以本 Demo 为准
- **对标路由**：`frontend/src/App.tsx` 的全部顶层 Lazy 路由（Dashboard / QueryCenter / DataCenter / AppCenter / Semantic / DataChat / ConfigCenter）

### 壳层结构

统一 `app-shell` 采用 CSS Grid 六区：

```
rail  |  topbar   topbar    topbar
rail  |  sidebar  main      inspector
rail  |  statusbar
```

- **rail**：7 个一级模块 + 命令面板 / 主题切换 / 设置，宽度 `--rail-w`（56px）
- **topbar**：面包屑 + env 胶囊 + 全局搜索（⌘K 占位）+ 通知 / 历史 / 保存 / 发布
- **sidebar**：动态二级导航，由当前模块的 `render(route, STATE)` 填充
- **main**：工作区，承载列表、编辑器、画布、对话框等主体
- **inspector**：上下文检查器，默认展示当前选中实体摘要 + AI 建议
- **statusbar**：连接态 + 分支 + 模块自定义状态 + 版本

### 模块覆盖

| 模块 | 子视图 | 备注 |
|------|-------|-----|
| **工作台** | KPI + 今日摘要 + 我的工作 + 常看仪表盘 + 快捷入口 | 与 `Dashboard.page.tsx` 对齐 |
| **查询中心** | SQL 工作台 / 可视化取数 / 我的查询 / 执行历史 / 定时任务 | 数据源 Rail、结果多 Tab（结果 / 可视化 / 日志 / 执行计划） |
| **数据中心** | 数据源 / 数据集 / 注册向导 / 数据任务 / 运行记录 | 三步注册向导、卡片 + 表格切换 |
| **语义中心** | 本体工作台 / Cube 管理 / 领域建模 / 开发工具 / 变更历史 | 内嵌上一节五视图（总览 / 对象 / 指标 / 关系 / 治理） |
| **应用中心** | 应用市场 / 我的实例 / 执行监控 | 分类筛选 + 执行表 + 应用详情 |
| **智能问数** | 会话区 + Prompt 模板 + 回答元信息 | 回答卡底部：保存看板 / 下载 CSV / 导出 SQL / 分享飞书 |
| **配置中心** | 通知渠道 / 订阅规则 / 访问令牌 / 成员角色 | 表格 + Inspector 看具体条目 |

### 共享层

- **`assets/tokens.css`**：Light / Dark 双套 Design Token（color-scheme、radius、shadow、easing）
- **`assets/shell.css`**：壳层布局 + 原子组件（btn / field / kpi-grid / card-grid / cmdk 等）
- **`assets/data.js`**：`window.DB`，覆盖 datasources / datasets / savedQueries / apps / channels / ontology 等全部 mock
- **`assets/app.js`**：渲染循环 + 哈希路由 + ⌘K 命令面板 + 主题切换，通过 `window.Shell` 暴露给各模块
- **`assets/modules/*.js`**：每个模块注册 `window.Modules[id] = { render, breadcrumb?, statusbar? }`

### 间距与控件对齐（Demo）

- **Token**：`--space-1`…`--space-7`（4px 基准）、`--control-h` 32px（顶栏/主按钮）、`--control-h-sm` 28px（次按钮/侧栏行）、`--topbar-h` 48px、`--statusbar-h` 28px、`--topbar-pad-x` / `--main-pad-x` 16px / 20px。
- **顶栏**：面包屑 + env 归入 `.topbar-left`；搜索框固定高度 32px 与 `.btn`/`.icon-btn` 同列对齐；右侧操作区间距 8px。
- **侧栏**：`.nav-item` 最小行高 28px；`.sidebar-header` / `.inspector-header` 与顶栏控件垂直节奏一致。
- **工具条**：`.toolbar-bleed`（查询工作台全宽）、`.toolbar-inset`（卡片内顶栏）、`.editor-chrome-bar`（SQL 文件名行）。
- **工具类**：`.btn-block`（全宽左对齐）、`.ml-auto`、`.stack-tight`（纵向 8px 间距按钮组）、全局 `.spacer`。

### 命令面板

索引覆盖：模块、语义对象、指标、数据集、查询、应用、全局操作。分组展示，支持 ↑↓ / Enter / ⌘↵ / Esc，选中后跳转到对应模块并携带选中态。

### 已验证路径

- Rail 切换：工作台 ↔ 查询中心 ↔ 数据中心 ↔ 语义中心 ↔ 应用中心 ↔ 智能问数 ↔ 配置中心
- 查询中心：SQL 工作台标签页 + 结果/可视化/日志/执行计划 Tab 切换，Inspector 同步
- 语义中心：Sidebar 选对象 → 主区显示对象详情（定义/字段·14/关系·3/规则·2/历史），Inspector 显示对象摘要
- 智能问数：问答流 + Prompt 模板 + 回答底部操作栏
- ⌘K：跨模块搜索（模块 / 对象 / 指标 / 数据集 / 查询 / 应用 / 操作）

### 落地建议

- **壳层回迁**：`app-shell` Grid、rail、topbar、sidebar、inspector、statusbar 抽为 `frontend/src/components/Shell/*` 的 Layout 组件，`AppLayout.tsx` 接入
- **Design Token 对齐**：把 `tokens.css` 合并进既有 Tailwind + CSS Variables 体系，优先补齐 dark 模式缺失项
- **命令面板**：基于 `cmdk` 实现 `useCommandPalette`，索引来源为各模块注册函数（对象 / 指标 / 数据集 / 查询 / 应用）
- **模块落地顺序**：语义中心（已有结构基础）→ 查询中心（交互最复杂）→ 工作台/数据中心/应用中心 → 智能问数 → 配置中心
