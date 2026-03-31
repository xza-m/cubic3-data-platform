# 语义中心前端开发 Backlog

本文件将页面模型、字段清单与线框说明拆解为可开发任务。  
使用方式：
- 设计评审阶段：按页面章节确认字段优先级与交互边界
- 开发排期阶段：按 `Phase 1 -> Phase 5` 顺序拆分迭代
- 验收阶段：每个任务以“输出 + 验收标准 + 验证命令”为准

统一约束：
- `KISS`：不新增一级导航，不重做主路由
- `YAGNI`：`View / Recipe` 继续作为次级资源挂载
- `SOLID`：一个页面只承载一种任务模型
- `DRY`：页头、上下文条、工具栏、Inspector、状态表达全部复用共享组件

## Phase 1. 共享基线与壳

> 实施进度（2026-03-24）：
> - 已落地：`Cube 管理` 已接入首轮共享基线，包括 `SemanticObjectIdentity / SemanticStatusBlock / SemanticStructureSummary`、上下文条、单层工具栏和条件 Inspector
> - 已落地：`领域目录` 已完成资源树入口化首轮收口，中间区默认先看领域，选中后展示领域下 `Cube`，右侧目录摘要默认显示 `Join 数 / 关联 Cube 数`
> - 已落地：`CubeStudio` 已完成“自动优先、人工补充”首轮收口，来源绑定强调自动生成草稿，任务区不再要求用户从空白表单起步
> - 已落地：`领域画布` 已完成 `Join` 三态高亮、节点名称优先与 Inspector 三态收口，首屏默认优先辨认 `Cube 名称` 与 `Join` 关系
> - 已落地：`DevTools` 已完成资源树优先级重排、YAML 首屏收口，以及 `Recipe` 的 few-shot 元数据展示；`Domain / Catalog` 不可编辑空状态已补齐回退动作

### B-1 页面壳标准化
- 类型：共享组件
- 范围：
  - `SemanticPageHeader`
  - `SemanticWorkbenchContextBar`
  - `SemanticSurface`
  - `SemanticInspectorPanel`
  - `SemanticIssueList`
- 输出：
  - 固定页头 spacing、标题层级、主动作尺寸
  - 固定上下文条的字段样式与 tone 规则
  - 固定 Inspector 的 section 标题、键值行、空态风格
- 验收：
  - 所有语义页使用同一套页头和上下文条样式
  - 页面不再内联第二套 header / summary 容器

### B-2 状态与对象摘要基线
- 类型：共享模型
- 范围：
  - `SemanticObjectSummary`
  - `SemanticGovernanceState`
  - `SemanticStructureSummary`
  - `WorkbenchContextItem`
- 输出：
  - 统一 `ObjectIdentity`
  - 统一 `StatusBlock`
  - 统一 `StructureSummary`
- 验收：
  - `CubeList / DomainList / DomainCanvas / DevTools` 不再各自拼状态字段

### B-3 工具栏与轻筛选带
- 类型：共享组件
- 范围：
  - `SemanticToolbar`
  - `SemanticFilterChips`
- 输出：
  - 单层工具栏
  - 搜索 + 下拉 + 快筛 + 清空动作统一样式
- 验收：
  - `CubeList` 与 `DomainList` 的筛选条遵守同一交互节奏

## Phase 2. Overview / Inventory 页面

### P-OV-1 语义总览重构
- 页面：`/semantic/overview`
- 页面模型：`Overview`
- 输出：
  - 资产数量区：`Cube / View / Domain`
  - 最近操作记录区
  - 资产趋势区
- 不做：
  - 模块入口卡
  - 推荐路径
- 依赖：
  - `useSemanticOverview`
  - `SemanticWorkbenchContextBar`
- 验收：
  - 首屏不出现功能跳转
  - 总览只承担“资产概览 + 最近变化”

### P-CUBE-1 Cube 管理主列表
- 页面：`/semantic/cubes`
- 页面模型：`Inventory`
- 输出：
  - 轻页头
  - 上下文条：总数 / 已发布 / 草稿 / 校验失败
  - 单层工具栏：搜索、`Cube 类型`、所属领域、状态、排序、清空
  - 轻列表主区
- 字段优先级：
  - Cube 名称
  - 状态
  - 维度数 / 指标数
  - 所属领域
  - 更新时间
- 不做：
  - 大统计卡
  - 默认右侧详情

### P-CUBE-2 Cube 预览 Inspector
- 页面：`/semantic/cubes`
- 组件：
  - `CubePreviewPanel`
  - `SemanticPreviewPanel`
- 输出：
  - 仅在选中时显示
  - 固定区块：
    - 当前对象
    - 字段列表
    - 属性摘要
    - 所属领域
    - 当前状态
    - 编辑定义动作
- 验收：
  - 未选中时不占右侧空间
  - 不显示负责人、版本、来源长文本

### P-DOMAIN-1 领域目录资源树入口
- 页面：`/semantic/domains`
- 页面模型：`Inventory`
- 输出：
  - 左侧目录 rail
  - 中间领域列表
  - 选中领域后显示领域下 `Cube`
  - 右侧默认显示 `Join 数`
- 字段优先级：
  - 当前目录
  - 当前领域
  - 领域下 `Cube`
  - `Join` 摘要
- 不做：
  - 纯治理报表化页面
  - 目录详情页

### P-DOMAIN-2 目录摘要与 Join 概览
- 页面：`/semantic/domains`
- 组件：
  - `DomainGovernancePanel`
  - `SemanticPreviewPanel`
- 输出：
  - 默认固定显示：
    - `Join 数`
    - `关联 Cube 数`
  - 选中领域后补充：
    - 状态
    - 领域说明
    - 打开画布动作
- 验收：
  - 右侧摘要不变成重详情页

## Phase 3. Studio 页面

> 实施进度（2026-03-24）：
> - 已落地：`CubeStudio` 已完成“自动优先、人工补充”首轮收口，来源绑定步骤强调自动生成草稿，基础信息/规则步骤只保留少量人工补充项，右侧 Inspector 已默认显示当前阻塞、来源上下文和结构规模
> - 待继续：将同一套 `Studio` 基线扩展到 `Visual Builder`

### P-STUDIO-1 Cube Studio 任务区重构
- 页面：`/semantic/cubes/new`
- 页面：`/semantic/cubes/:name/edit`
- 页面模型：`Studio`
- 输出：
  - 左侧步骤轨改为任务目录
  - 中间任务区改为“自动优先、人工补充”
  - 当前步骤只展示主任务
- 重点：
  - 来源绑定后优先生成草稿
  - 自动识别维度 / 指标
  - 人工主要负责修正
- 验收：
  - 用户不需要从空白表单开始逐项填写

### P-STUDIO-2 Cube Studio 摘要 Inspector
- 页面：`CubeStudio`
- 输出：
  - 当前来源
  - 当前结构规模
  - 当前阻塞
  - 所属领域
- 不做：
  - Join 编辑
  - 领域发布信息
  - 编译调试入口

## Phase 4. Canvas 页面

> 实施进度（2026-03-24）：
> - 已落地：`P-CANVAS-1` 节点主视觉已调整为 `Cube 名称` 优先，同时保留 `维度数 / 指标数`
> - 已落地：`P-CANVAS-2` 已实现 `缺失 / 冲突 / 正常` 三态高亮与图例
> - 已落地：`P-CANVAS-3` Inspector 已收口为领域摘要 / Cube 摘要 / Join 设置三态

### P-CANVAS-1 领域画布主视觉重排
- 页面：`/semantic/domains/:id`
- 页面模型：`Canvas`
- 输出：
  - 节点内优先显示 `Cube 名称`
  - 节点内继续显示 `维度数 / 指标数`
  - 连线权重高于节点次信息
- 验收：
  - 首屏能快速辨认所有 `Cube`
  - 节点不会沦为纯装饰卡片

### P-CANVAS-2 Join 三态高亮
- 页面：`DomainCanvas`
- 输出：
  - `缺失`
  - `冲突`
  - `正常`
  三态高亮规则与图例
- 组件：
  - `DomainGraphCanvas`
  - `DomainInspectorPanel`
- 验收：
  - 用户一眼能分辨问题 Join 与正常 Join

### P-CANVAS-3 Inspector 三态收口
- 页面：`DomainCanvas`
- 输出：
  - 未选中：领域摘要
  - 选节点：Cube 摘要
  - 选边：Join 设置
- 细化：
  - Join 设置字段固定
  - 领域摘要只保留当前规模与发布检查

## Phase 5. Developer Workbench 页面

> 实施进度（2026-03-24）：
> - 已落地：`P-IDE-1` 资源树顺序固定为 `Cube / View / Recipe / Domain / Catalog`
> - 已落地：`P-IDE-2` 默认首屏继续以 `YAML` 编辑区为主，不再在页头提供额外主动作
> - 已落地：`P-IDE-3` `Recipe` 已固定展示标签、示例数、关联 Cube，并支持查看关联 Cube
> - 已落地：`P-IDE-4` `Domain / Catalog` 不可编辑对象已显示稳定空状态与返回动作

### P-IDE-1 DevTools 资源树优先级
- 页面：`/semantic/tools`
- 页面模型：`Developer Workbench`
- 输出：
  - 资源树顺序固定：
    1. Cube
    2. View
    3. Recipe
    4. Domain
    5. Catalog
- 验收：
  - 默认选中仍从可编辑对象开始
  - `Recipe` 不新增一级导航

### P-IDE-2 YAML 工作区优先
- 页面：`DevTools`
- 输出：
  - 默认 tab 为 `定义文件`
  - 工作区首屏以 YAML 编辑区为主
  - Workspace Header 固定显示当前对象与当前状态
- 验收：
  - 不再平均分配 3 个 tab 的首屏存在感

### P-IDE-3 Recipe 作为 Few-shot 样本
- 页面：`DevTools`
- 输出：
  - `Recipe` 在资源树中可选
  - YAML 工作区固定显示：
    - 标签
    - 示例数
    - 关联 Cube
    - 查看关联 Cube
- 验收：
  - `Recipe` 清晰表达为查询配方 / DSL 教学样本

### P-IDE-4 不可编辑对象空状态
- 页面：`DevTools`
- 输出：
  - `Domain / Catalog` 不可编辑时，展示稳定空状态
  - 空状态包含：
    - 为什么不能在线编辑
    - 应该回到哪个模块
    - 返回动作
- 验收：
  - 不可编辑对象不会让工作区显得“坏掉”

## Phase 6. 共享测试与验收

> 实施进度（2026-03-24）：
> - 已落地：`T-1` 已覆盖 `Overview / CubeList / DomainList / CubeStudio / DomainCanvas / DevTools` 的页面类型单测
> - 已落地：`T-2` 已固化 `Cube 管理 / 领域目录 / 领域画布 / 开发工具` 的视觉回归基线
> - 已落地：`T-3` 已通过 `build / test:unit / verify:ui / verify:semantic-layout`

### T-1 页面类型单测
- 范围：
  - `Overview`
  - `CubeList`
  - `DomainList`
  - `CubeStudio`
  - `DomainCanvas`
  - `DevTools`
- 验收：
  - 页头文案是功能摘要
  - 上下文条字段完整
  - Inspector 为条件显示

### T-2 视觉回归
- 范围：
  - Cube 管理
  - 领域目录
  - 领域画布
  - 开发工具
- 验收：
  - 列表页没有回到统计卡 / 卡片矩阵
  - 画布页 `Join` 三态可见
  - DevTools 首屏仍以 YAML 为主

### T-3 UI 组合校验
- 验证命令：
  - `cd frontend && npm run build`
  - `cd frontend && npm run test:unit`
  - `cd frontend && npm run verify:ui`
  - `cd frontend && npm run verify:semantic-layout`
- 验收：
  - 关键页面通过单测、构建和视觉回归

## 推荐排期顺序

### Sprint 1
- `B-1`
- `B-2`
- `B-3`
- `P-CUBE-1`
- `P-CUBE-2`

### Sprint 2
- `P-DOMAIN-1`
- `P-DOMAIN-2`
- `P-STUDIO-1`
- `P-STUDIO-2`

### Sprint 3
- `P-CANVAS-1`
- `P-CANVAS-2`
- `P-CANVAS-3`

### Sprint 4
- `P-IDE-1`
- `P-IDE-2`
- `P-IDE-3`
- `P-IDE-4`
- `T-1`
- `T-2`
- `T-3`

## 设计评审时需要最终确认的问题
- 总览页的“最近操作”是否按对象类型分组
- Cube 管理页是否还需要默认显示 `View 数`
- 领域目录右侧摘要中 `关联 Cube 数` 是否固定展示
- 领域画布 `Join` 三态是否要在图例里显式解释
- `Recipe` 的“查看关联 Cube”是内联摘要还是跳详情页
