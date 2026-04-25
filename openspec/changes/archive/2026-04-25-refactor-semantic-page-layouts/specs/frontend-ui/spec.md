## ADDED Requirements
### Requirement: Semantic Center Management Pages SHALL Focus On Search And Overview
语义中心中的管理页 SHALL 只承担对象检索、筛选和概况查看职责，且 SHALL NOT 在首屏混入设计能力。

#### Scenario: Browse cubes from Cube 管理
- **WHEN** 用户打开 `Cube 管理`
- **THEN** 页面 SHALL 提供搜索、筛选、列表和当前 Cube 预览
- **AND** 页面 SHALL NOT 在首屏展示 DSL 编辑、快速查询构建器或无上下文的跨工作区跳转

#### Scenario: Browse domains from 领域管理
- **WHEN** 用户打开 `领域管理`
- **THEN** 页面 SHALL 提供 Catalog 树、领域列表和当前领域概况
- **AND** 页面 SHALL NOT 在首屏同时展示当前领域编辑大表单和新建另一个领域的大表单

### Requirement: Semantic Center Design Pages SHALL Focus On Editing And Publishing
语义中心中的设计页 SHALL 只承担对象定义、关系编排和发布职责，且 SHALL NOT 在首屏混入目录台账、对象浏览台账或消费验证能力。

#### Scenario: Edit a cube in Cube 设计
- **WHEN** 用户进入 `Cube 设计`
- **THEN** 页面 SHALL 围绕基础信息、维度、指标和校验反馈组织
- **AND** 页面 SHALL NOT 将领域关系、查询验证或目录浏览作为主流程

#### Scenario: Model a domain in 领域设计
- **WHEN** 用户进入 `领域设计`
- **THEN** 页面 SHALL 围绕 Cube 库、画布、Inspector 和发布动作组织
- **AND** 页面 SHALL NOT 混入目录长列表、查询器或 YAML 编辑器

### Requirement: Semantic Center Pages SHALL Keep A Single Primary Task On First Screen
语义中心四个核心页面 SHALL 在首屏只呈现单一主任务，并 SHALL 使用唯一主按钮和受控次按钮表达当前动作。

#### Scenario: First screen shows one primary task
- **WHEN** 用户首次进入任一核心页面
- **THEN** 其首屏 SHALL 只围绕当前任务展示上下文与主操作
- **AND** 页面 SHALL NOT 通过大段说明文案解释页面职责

#### Scenario: Primary actions stay bounded
- **WHEN** 页面渲染主操作区域
- **THEN** 页面 SHALL 只有一个主按钮
- **AND** 页面 MAY 额外提供一个次按钮
- **AND** 页面 SHALL NOT 将多个跨工作区跳转同时作为主操作

### Requirement: Semantic Center Navigation SHALL Preserve Only Valid Workflow Jumps
语义中心页面之间 SHALL 只保留顺主流程跳转，并 SHALL 移除会破坏页面边界理解的无效跳转。

#### Scenario: Management pages jump only into design pages
- **WHEN** 用户在 `Cube 管理` 或 `领域管理` 中执行主操作
- **THEN** 目标页面 SHALL 分别进入 `Cube 设计` 或 `领域设计`
- **AND** 页面 SHALL NOT 将技术工作区或其他对象工作区作为业务主 CTA

#### Scenario: Design pages return to their management context
- **WHEN** 用户在 `Cube 设计` 或 `领域设计` 中执行返回动作
- **THEN** 页面 SHALL 返回对应的管理页上下文
- **AND** 页面 SHALL NOT 要求用户通过无关工作区回流

### Requirement: Semantic Center SHALL Maintain Layout And Workflow Regression Coverage
语义中心 SHALL 为四个核心页面提供布局职责、主操作和关键流程的自动化回归覆盖。

#### Scenario: Unit and interaction coverage
- **WHEN** 前端执行页面与组件测试
- **THEN** 测试 SHALL 验证管理页不混入设计能力
- **AND** 测试 SHALL 验证设计页不混入管理能力
- **AND** 测试 SHALL 验证主按钮唯一、关键摘要不重复

#### Scenario: End-to-end and visual coverage
- **WHEN** 前端执行语义中心 E2E 与视觉回归
- **THEN** 自动化 SHALL 覆盖 `Cube 管理` 浏览、`Cube 设计` 保存、`领域管理` 浏览、`领域设计` 发布四条主链路
- **AND** 视觉基线 SHALL 覆盖四个核心页面的首屏布局
