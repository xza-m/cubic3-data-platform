## Context

- v2 主线的本体工作台已落地三件套（Rail / Sidebar / Inspector），位于
  `frontend/src/v2/pages/semantic/ontology/`。
- 关系视图被拆成了两个相互独立的路由：
  - `/semantic/ontology/relations` → `Relations.tsx`：业务对象关系列表（表格）
  - `/semantic/relations` → `RelationCanvas.tsx`：cube join 图（SVG）
- 对象列表点击走 `<PeekPanel>` 抽屉，"查看详情"再跳全屏 `ObjectDetail.tsx`。
- AppShell 已经有 `openTab` / `closeTab` / `<TabStrip>` 完整基础设施，
  使用方式参考其他模块的实现（目前 v2 大部分页面同样未接入）。

## Goals / Non-Goals

- Goals
  - Ontology 关系页提供"左 SVG 图 + 右关系列表"双面板，单一路由内
    呈现 ontology 关系全貌，无需跨路由跳转。
  - 抽出可复用的 `OntologyRelationGraph` SVG 组件，与已有 `RelationCanvas`
    在风格上对齐但数据源相互独立。
  - Ontology 对象列表点击后通过 AppShell `openTab` 打开顶部 Tab，
    支持多对象并行查看。
  - 既有功能（搜索、新建关系、ObjectDetail 路由）保持不变。
- Non-Goals
  - 不合并 ontology relations 与 cube join 两个数据源（后续若有需要再单
    开 change）。
  - 不替换 `<PeekPanel>` 组件本身；其他模块仍可继续使用。
  - 不改动后端 API 与权限模型。
  - 不引入 react-flow 等新依赖；继续走纯 SVG 自绘。
  - 不在本 change 内推动 Cubes / Domains 等同类列表迁移到 Tab 模式
    （它们的多 Tab 化由后续 change 负责）。

## Decisions

### Decision 1: 左 SVG 图 + 右列表的布局

`Relations.tsx` 主体改为水平 split：

```
┌──────────────────────┬────────────────────┐
│  OntologyRelationGr… │  SearchBar + Table │
│  (SVG, 60% 宽)        │  (40% 宽)            │
│  - 节点 = 业务对象     │  - 行 = relation     │
│  - 边 = relation     │  - 选中行 ⇆ 高亮节点   │
│  - 选中节点 ⇆ 过滤行    │  - 新建关系 dialog    │
└──────────────────────┴────────────────────┘
```

- 桌面默认 60/40 分配；窄屏（<1280px）退化为上下堆叠（图占
  60% 高度，表格在下方滚动）。
- 选中态走单一受控变量 `selected`：可以是 `{kind:'object', name}` 或
  `{kind:'relation', name}` 或 `null`。
  - 点击节点 → `selected = {kind:'object', name}`，右侧 table 过滤为该
    对象相关的 relation。
  - 点击 relation 行 → `selected = {kind:'relation', name}`，左侧图高亮
    该 relation 的两个端点 + 边。
  - 表头"清除筛选"按钮把 `selected` 复位。

### Decision 2: `OntologyRelationGraph` 抽组件不直接复用 RelationCanvas

复用 RelationCanvas 的话，会把 cube/dimension 视觉语言（fact/dimension
颜色、维度/度量徽章、Inspector 关联 join 列表）夹带进 ontology 视图，
模型不一致。直接抽一份独立组件更干净，代价是约 ~120 LoC SVG。

抽出的接口：

```ts
interface OntologyRelationGraphProps {
  objects: BusinessObject[]
  relations: BusinessRelation[]
  selected: SelectedItem | null
  onSelectObject: (name: string | null) => void
  onSelectRelation: (name: string | null) => void
  storageKey?: string  // localStorage 位置持久化键
}
```

行为：
- 默认环形布局（与 `RelationCanvas.computeDefaultPositions` 同构）。
- 节点拖拽 + 位置持久化到 localStorage。
- 不带缩放 / 重置布局按钮（Round 1 简化）。后续若用户反馈需要再加。
- 节点 = 业务对象（圆形 + 文本 = title），高亮态 = `selected.kind === 'object' && selected.name === node.name` 或者 selected.kind === 'relation' 且
  关系任一端点是当前 node。
- 边 = relation（line），高亮态 = `selected.kind === 'relation' && selected.name === edge.name` 或者 selected.kind === 'object' 且任一端点等于 selected.name。
- 节点 / 边带 `aria-label`、`role="button"`、`aria-pressed`，键盘可达性
  与 RelationCanvas 对齐。

### Decision 3: 对象点击 → openTab 而非全页跳转或抽屉

`Objects.tsx` 的行为改为：

```ts
const onClick = (obj: BusinessObject) => {
  openTab({
    id: `ontology-object:${obj.name}`,
    label: obj.title || obj.name,
    closeable: true,
    to: `/semantic/ontology/objects/${obj.name}`,
  })
  navigate(`/semantic/ontology/objects/${obj.name}`)
}
```

- `id` 加 `ontology-object:` 前缀，避免与未来其他类型的 Tab 冲突。
- AppShell `openTab` 已经做了去重，重复点击同一对象不会创建新 Tab，
  只切换激活态。
- 既有路由 `/semantic/ontology/objects/:name`（`ObjectDetail.tsx`）作为
  Tab 内容容器，无需新建组件。
- 列表上仍保持光标 / hover 状态，新建按钮、搜索框不变。
- AppShell 在切换 module 时会清空 tabs，符合"语义中心 module 内多 Tab，
  跨 module 不保留"的预期。

### Decision 4: 不动 PeekPanel 组件

PeekPanel 仍由其他模块（Datasets / Datasources / ExtractionTasks /
Subscriptions 等）使用。本 change 仅删除 `Objects.tsx` 内的引用，组件
自身保留。

### Decision 5: 测试覆盖

- 单测（vitest + RTL）
  - `Relations.test.tsx`：渲染左图右表 → 点击节点 → 表格过滤 → 点击行 → 节点
    高亮。
  - `Objects.test.tsx`：行点击会调用 `openTab`（mock AppShell context），
    且 navigate 到对应路由。
- E2E（playwright）
  - `p32-ontology-relations-and-tabs.spec.ts`：登录 → /semantic/ontology/relations
    检查 SVG 渲染 + 表格行数 + 至少一个节点 click 触发表格 row 数下降；
    /semantic/ontology/objects 点击两条对象，断言顶部 Tab 出现两个 +
    Tab 关闭按钮可关闭。

## Risks / Trade-offs

- 风险：抽组件引入额外 ~120 LoC SVG。
  - 缓解：只放在 `_shared/` 内供 ontology 模块用；后续如果 cube 视图
    也需要简化版本，再回头收敛公共部分。
- 风险：openTab 不持久（刷新页面 Tab 丢失）。
  - 当前不在本 change 内解决；与 demo 的本地 mock 体验一致。
  - 未来若需要持久化，扩展 `useAppShell` 把 tabs 序列化到 sessionStorage 即可。
- 风险：对象点击改为 openTab 后，"在列表里快速预览" 的 PeekPanel 体验会
  消失。
  - 缓解：Tab 打开/关闭很轻；用户预览完后点 X 即可关闭。后续若有强需求
    再加双模式（单击 Peek / 双击 Tab）。

## Migration Plan

1. 抽出 `OntologyRelationGraph` 组件到 `_shared/`。
2. 用新组件 + 受控 `selected` 重构 `Relations.tsx`。
3. 删除 `Objects.tsx` 的 PeekPanel 路径，改用 `openTab` + `navigate`。
4. 补 i18n 键、单测和 E2E。
5. 运行 `make verify-detect` 输出建议目标 → 跑 `make verify-frontend`。
6. openspec validate --strict + archive。

## Open Questions

- 关系图节点数 > 30 时是否需要分组聚合？目前 ontology 关系普遍 < 20，
  不引入聚合逻辑。
- 是否在 Inspector 里同步显示选中关系的元信息？本 change 暂不接入，
  如有需要在后续迭代里加 `setContextPanel(...)`。
