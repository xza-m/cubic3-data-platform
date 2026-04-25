# 语义中心页面字段清单与组件清单

## 1. Overview
- Header:
  - title
  - description
- Context:
  - cube counts
  - view counts
  - domain counts
  - active counts
  - draft counts
- Main:
  - asset counts
  - recent operations
  - asset trend

## 2. CubeList
- Header:
  - title
  - description
  - primary action: 新建 Cube
- Toolbar:
  - search
  - cube type filter
  - domain filter
  - status filter
  - sort
  - clear filter
  - quick chips
- List:
  - title
  - code
  - short description
  - cube type
  - domain
  - dimension counts
  - measure counts
  - view counts
  - status
  - update summary
  - edit action
- Conditional Preview:
  - current object
  - blockers
  - field list
  - property summary
  - domain
  - recent change

## 3. CubeStudio
- Header:
  - title
  - description
- Context:
  - mode
  - lifecycle
  - binding state
  - structure summary
- Main:
  - step rail
  - task panel
  - inspector
- Step Fields:
  - basic info
  - source binding
  - dimensions / measures
  - semantic rules
  - validation summary
  - save / lifecycle actions

## 4. DomainList
- Header:
  - title
  - description
  - primary action: 进入领域建模
  - secondary action: 新建目录
- Context:
  - current catalog
  - domain total
  - cube total
  - join total
  - draft total
- Main:
  - catalog rail
  - domain list
  - cube list in selected domain
  - conditional join summary panel
 - Right Summary:
  - join counts
  - related cube counts

## 5. DomainModelingEntry
- Header:
  - title
  - description
- Context:
  - catalog count
  - draft domain count
  - active domain count
  - current scope
- Main:
  - create draft panel
  - draft domain list
  - active domain list

## 6. DomainCanvas
- Header:
  - title
  - description
- Context:
  - current domain
  - lifecycle
  - node count
  - edge count
  - issue count
  - dirty state
- Main:
  - cube library
  - graph canvas
  - inspector
- Inspector States:
  - domain summary
  - cube summary
  - join editor
- Visual Priority:
  - cube name
  - join relationship
  - issue highlight
- Join Highlight:
  - missing
  - conflict
  - normal
- Node Summary:
  - dimension counts
  - measure counts

## 7. DevTools
- Header:
  - title
  - description
- Context:
  - current object
  - object kind
  - active tab
  - schema state
  - resource counts（Cube / View / Recipe）
- Main:
  - resource tree
  - workspace
  - tabs
- Resource Tree:
  - cube
  - view
  - recipe
  - domain
  - catalog
- Tabs:
  - definition file
  - compile debug
  - schema sync
- Primary Focus:
  - yaml definition file
  - recipe as few-shot / DSL teaching sample
- Recipe Detail:
  - tags
  - example counts
  - related cubes
  - view related cube action

## 8. Shared Components
- SemanticPageHeader
- SemanticWorkbenchContextBar
- SemanticSurface
- SemanticInspectorPanel
- SemanticIssueList
- SemanticActionBar
- SemanticPreviewPanel

## 9. Shared View Models
- SemanticObjectSummary
- SemanticGovernanceState
- SemanticStructureSummary
- WorkbenchContextItem

## 10. 最小验收标准

### 10.1 Overview
- 页头只说明模块职责，不提供分诊动作
- 上下文条只显示整体规模与发布状态
- 主面板只显示模块用途和当前现状
- 不出现流程引导、推荐路径或重复入口

### 10.2 Inventory
- 页头只保留标题、功能摘要和主动作
- 上下文条只显示当前范围、筛选透镜和规模
- 主任务区必须是对象列表或治理列表
- 预览 / Inspector 只在选中对象后显示

### 10.3 Studio
- 页头只说明单对象维护职责
- 上下文条必须显示模式、状态、绑定状态和结构规模
- 主任务区必须由步骤轨 + 任务面板构成
- Inspector 只承载对象摘要、差异或风险提示

### 10.4 Canvas
- 页头只说明关系建模职责
- 上下文条必须显示当前领域、生命周期、实体/关系规模和问题数
- 主任务区必须固定为左资源库、中画布、右 Inspector
- Inspector 必须支持领域摘要 / 对象摘要 / Join 设置三态之一
- `Join` 高亮必须区分 `缺失 / 冲突 / 正常`
- 节点内必须继续显示维度数和指标数

### 10.5 Developer Workbench
- 页头只说明工具职责，不承担业务入口介绍
- 上下文条必须显示当前对象、标签页、Schema 状态和资源规模
- 主任务区必须固定为资源树 + Workspace + Tabs
- 不可编辑对象必须给出稳定空状态和返回主模块动作
- `View / Recipe` 必须作为现有工作台中的次级资源挂载，不新增一级导航
- `Recipe` 在 YAML 工作区必须固定显示标签、示例数和关联 Cube
