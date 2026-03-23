## 实现准备包

本文档用于把 `update-semantic-workbench-ux` 从提案阶段推进到可编码阶段。目标是明确实施顺序、改动边界、组件拆分、状态约定、验证策略和每个页面的最小可交付范围。

---

## 1. 实施策略
### 推荐方案 A：分阶段增量改造
- Phase 1：`CubeList` + 共享状态/工具栏/预览面板
- Phase 2：`CubeStudio` + 步骤轨和校验工作流
- Phase 3：`DomainCanvas` + 画布上下文条、Join Inspector、图例与异常视图
- Phase 4：`DevTools` + 资源树与 Workspace 上下文

优点：
- 符合 `KISS`，每一阶段都有明确页面目标
- 符合 `YAGNI`，不提前抽象全站组件
- 风险可控，便于逐页验证视觉和交互一致性

缺点：
- Phase 1 与 Phase 2 之间会短暂出现“新旧体验混合”

### 备选方案 B：先做共享组件，再批量切页面
- 先提炼 `SemanticToolbar`、`SemanticIssueList`、`SemanticPreviewPanel`、`SemanticWorkbenchContextBar`
- 再统一替换 `CubeList / CubeStudio / DomainCanvas / DevTools`

优点：
- 共享逻辑一次成型
- 后续页面实现速度更快

缺点：
- 前期抽象难度更高
- 容易为了抽象而抽象，违背 `YAGNI`

### 推荐结论
先按方案 A 推进，但在每一阶段只抽取“刚好被第二个页面复用”的组件，避免过早平台化。

---

## 2. 改动边界
### 本次允许改动
- `frontend/src/pages/Semantic/`
- `frontend/src/components/Semantic/`
- `frontend/src/lib/semantic-status.ts`
- 与语义中心直接相关的 `hooks`、测试和样式 token

### 本次不改动
- 全局 `AppLayout` 骨架
- 主导航与路由结构
- 语义相关后端接口语义
- 非语义中心页面的视觉重构

---

## 3. 页面优先级和最小可交付
### Phase 1: CubeList
#### 目标
- 从“对象浏览”切到“问题优先工作列表”

#### 最小可交付
- 表格主视图取代卡片主视图
- 快筛和基础筛选可用
- 右侧预览检查器可用
- URL 状态保留筛选、分页、当前选中

#### 非阻塞后置项
- 高级筛选组合
- 列配置
- 批量操作

### Phase 2: CubeStudio
#### 目标
- 从长表单堆叠切到阶段式工作流

#### 最小可交付
- 步骤轨稳定
- 当前步骤独占主工作区
- 校验与预览步骤可聚合阻塞项
- 保存草稿 / 发布动作层级明确

#### 非阻塞后置项
- 更细粒度字段编辑
- 复杂 diff 预览

### Phase 3: DomainCanvas
#### 目标
- 明确画布主次层级，统一 Join 编辑链路

#### 最小可交付
- 上下文条可用
- 左资源库、中央画布、右 Inspector 视觉层级明确
- 节点/连线状态样式收敛
- Join Inspector 结构化

#### 非阻塞后置项
- 更复杂的大图异常过滤
- 画布视图预设

### Phase 4: DevTools
#### 目标
- 形成轻量 IDE 语境

#### 最小可交付
- 资源树分组和当前对象上下文条可用
- 三个 tabs 结构差异化
- 空状态和跳转建议产品化

#### 非阻塞后置项
- 最近访问历史
- 更多日志过滤维度

---

## 4. 共享组件准备
### 第一批必须抽离
- `SemanticToolbar`
  - 承载搜索、筛选、快筛、主动作
- `SemanticPreviewPanel`
  - 承载对象摘要、下一步动作、引用关系
- `SemanticIssueList`
  - 承载阻塞项、提醒项、待处理项

### 第二批按需抽离
- `SemanticStepRail`
- `SemanticWorkbenchContextBar`
- `SemanticFilterChips`
- `SemanticObjectTable`

### 抽离原则
- 被两个页面重复使用再抽离
- 只抽结构与状态，不抽页面业务数据获取
- 避免形成新的“大而全 UI 层”

---

## 5. 状态与命名统一
### 页面级状态文案
- `草稿`
- `待发布`
- `已发布`
- `校验失败`
- `阻塞`
- `未绑定数据源`
- `高复用`

### 动作文案
- `保存草稿`
- `发布`
- `校验`
- `打开领域建模`
- `查看定义`
- `保存当前 Join`

### 命名原则
- 不出现营销式标题
- 不使用“智能驱动”“全新体验”这类抽象表达
- 标题先表达对象，再表达状态，再表达动作

---

## 6. 文件拆分建议
### CubeList
- `frontend/src/pages/Semantic/CubeList.tsx`
  - 保留页面入口和数据编排
- `frontend/src/components/Semantic/CubeList/CubeToolbar.tsx`
- `frontend/src/components/Semantic/CubeList/CubeTable.tsx`
- `frontend/src/components/Semantic/CubeList/CubePreviewPanel.tsx`

### CubeStudio
- `frontend/src/pages/Semantic/CubeStudio.tsx`
  - 保留页面入口、查询、保存编排
- `frontend/src/components/Semantic/CubeStudio/CubeStudioStepRail.tsx`
- `frontend/src/components/Semantic/CubeStudio/CubeStudioTaskPanel.tsx`
- `frontend/src/components/Semantic/CubeStudio/CubeStudioInspector.tsx`
- `frontend/src/components/Semantic/CubeStudio/steps/*.tsx`

### DomainCanvas
- `frontend/src/pages/Semantic/DomainCanvas.tsx`
  - 保留页面入口和画布状态编排
- `frontend/src/components/Semantic/DomainCanvas/DomainWorkbenchContextBar.tsx`
- `frontend/src/components/Semantic/DomainCanvas/DomainCubeLibrary.tsx`
- `frontend/src/components/Semantic/DomainCanvas/DomainGraphLegend.tsx`
- `frontend/src/components/Semantic/DomainCanvas/inspectors/*.tsx`

### DevTools
- `frontend/src/pages/Semantic/DevTools.tsx`
  - 保留页面入口和 tabs 编排
- `frontend/src/components/Semantic/DevTools/SemanticResourceTree.tsx`
- `frontend/src/components/Semantic/DevTools/SemanticWorkspaceHeader.tsx`
- `frontend/src/components/Semantic/DevTools/SemanticEditorEmptyState.tsx`

---

## 7. 每阶段开发步骤
### Phase 1: CubeList
1. 提炼 `SemanticToolbar` 与 `SemanticPreviewPanel` 的最小 API
2. 重排 `CubeList` 页面结构，先保留现有数据来源
3. 用表格行替换对象卡片主视图
4. 接入筛选与 URL 状态
5. 补桌面/窄屏测试

### Phase 2: CubeStudio
1. 固定“步骤轨 / 当前步骤工作区 / Inspector”三栏
2. 先拆当前步骤面板，再逐步迁移已有表单块
3. 引入 `SemanticIssueList`
4. 补保存、发布、阻塞态反馈
5. 补关键场景测试

### Phase 3: DomainCanvas
1. 引入 `SemanticWorkbenchContextBar`
2. 重排左库、画布、Inspector 的层级和背景语义
3. 调整节点和连线状态表现
4. 重构 Join Inspector 结构
5. 补画布 smoke 和视觉回归

### Phase 4: DevTools
1. 重构资源树分组与工作区上下文条
2. 优化三类 tabs 的结构差异
3. 产品化空状态和跳转动作
4. 补对象切换和 tabs 状态保留测试

---

## 8. 测试与验证准备
### 单元/组件
- `workbench` 复用组件快照或语义测试
- `CubeList` 筛选与 URL 状态
- `CubeStudio` 步骤切换与阻塞项展示
- `DomainCanvas` 状态映射与 Inspector 切换
- `DevTools` tabs 切换与空状态

### 页面级
- `cd frontend && npm run test:unit`
- `cd frontend && npm run verify:semantic-layout`

### 冒烟链路
- `Cube 管理 -> 打开 Cube -> 编辑 -> 保存`
- `领域建模 -> 选中 Join -> 编辑 -> 校验`
- `开发工具 -> 切对象 -> 编译调试 -> 查看 Schema 同步`

---

## 9. 风险提醒
- `CubeList.tsx` 与 `CubeStudio.tsx` 当前页面文件较重，直接在原文件内继续堆逻辑会违背 `SOLID`
- 共享组件若一次性抽太多，会形成过早抽象，违背 `YAGNI`
- `DomainCanvas` 的视觉优化必须建立在现有 React Flow 状态模型上，避免在同一阶段同时改布局与底层状态结构
- `DevTools` 不要为了“像 IDE”而引入新的编辑器或工作区框架，违背 `KISS`

---

## 10. 建议的开工顺序
1. 先完成 `CubeList` 的组件切分和表格主视图
2. 然后进入 `CubeStudio` 的阶段式工作流
3. 共享组件稳定后再推进 `DomainCanvas`
4. `DevTools` 最后收尾，承接前面沉淀的上下文条和状态语言

这个顺序的原因是：
- `CubeList` 最快建立新视觉基线
- `CubeStudio` 最快验证“步骤工作台”模式
- `DomainCanvas` 复杂度最高，适合在共享模式稳定后进入
- `DevTools` 对共享工作台语义依赖最强，后做收益更高
