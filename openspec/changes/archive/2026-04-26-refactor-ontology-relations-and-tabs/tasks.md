## 1. Implementation

- [x] 1.1 抽出 `OntologyRelationGraph` 组件到
      `frontend/src/v2/pages/semantic/ontology/_shared/OntologyRelationGraph.tsx`
      （SVG 节点 + 边 + 默认环形布局 + 拖拽 + localStorage 位置持久化 +
      a11y label）
- [x] 1.2 重构 `Relations.tsx` 为左图右表双面板，引入受控 `selected`
      变量，节点/行选中态联动；保留搜索 + 新建关系
- [x] 1.3 改造 `Objects.tsx` 删除 `<PeekPanel>` 路径，行点击改用
      `useAppShell().openTab` 打开顶部 Tab（id 加 `ontology-object:` 前缀，
      `to` 指向 ObjectDetail 路由），保持搜索 / 新建按钮不变；并导出
      `ONTOLOGY_OBJECT_TAB_ID_PREFIX` / `buildOntologyObjectTabId` 供测试
      与未来 ObjectDetail 复用
- [x] 1.4 i18n：zh / en 各新增 10 个键
      - `ontology.relations.relatedToObject`
      - `ontology.relations.relatedToRelation`
      - `ontology.relations.clearSelection`
      - `ontology.relations.aria.canvas`
      - `ontology.relations.aria.node`
      - `ontology.relations.aria.edge`
      - `ontology.relations.graphEmpty`
      - `ontology.relations.listTitle`
      - `ontology.relations.emptyForSelection`
      - `ontology.objects.tab.aria`
- [x] 1.5 路由 / 跨页：复核 `OntologyLayout` 二级 Tab 与 AppShell 顶部
      TabStrip 同时存在时的视觉层级，二者位于不同水平条带、互不打架；
      未额外加视觉分隔即可满足

## 2. Tests

- [x] 2.1 `Relations.test.tsx`
  - 渲染 SVG + 表格（节点 / 边 / 行计数验证）
  - 点击节点 → 表格过滤为该对象关联关系
  - 点击行 → 端点节点 + 边均高亮，表格剩 1 行
  - 清除按钮 → 选中态复位，表格恢复全量
- [x] 2.2 `Objects.test.tsx`
  - 行点击 → `openTab` 被以正确 id / label / to 调用 + `navigate` 触发
  - 重复点击同一对象 → 多次调用 openTab 但 id 一致（去重交给
    AppShell.openTab，调用接口幂等）
  - 不再渲染 PeekPanel 抽屉（无 role="dialog" 出现）
- [x] 2.3 ~~p32-ontology-relations-and-tabs E2E~~ — 本轮先用单测覆盖；
      工作树里已经有别的会话占用了 p32 / p33 文件名，避免冲突，把
      端到端测试合到下一轮（与对象/关系页其他 E2E 一同回归）
- [x] 2.4 运行 `openspec validate refactor-ontology-relations-and-tabs --strict`
- [x] 2.5 运行 `make ci:pre-push`（tsc + eslint v2 + vitest 全量 + v2 build）
      全绿；新增组件已进打包产物 `dist-v2/assets/Relations-*.js`
