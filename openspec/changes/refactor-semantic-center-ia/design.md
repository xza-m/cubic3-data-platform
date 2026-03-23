## Context
本次变更只处理语义中心前端的信息架构和交互边界，不改变语义查询编译、运行时绑定、领域发布校验等后端主规则。

现状中的主要问题不是能力缺失，而是页面职责没有完全冻结：

- 列表页、详情页、画布页和 Studio 页互相回流
- `Cube` 与 `View` 的业务认知和页面结构不一致
- 领域对象仍然是扁平列表，缺少正式的 `catalog -> domain` 目录层
- “领域目录”与“领域管理”本质上展示同一对象，职责重叠
- 画布布局以双侧栏为中心，而不是以建模区域为中心

## Goals / Non-Goals
- Goals:
  - 冻结语义中心一级导航和页面职责
  - 统一语义模型入口，保留 `kind` 差异但不拆一级对象
  - 将领域入口升级为正式的轻量 `catalog -> domain` 目录页
  - 将单领域生命周期管理合并进目录详情区
  - 保留独立“领域建模”模块承接创建和画布入口
  - 提升领域画布的中心建模优先级
  - 统一 Drift 状态说明和反馈体验
- Non-Goals:
  - 不修改语义层 DSL、Compiler、Query API 行为
  - 不在本次提案中处理 View 物化策略变更
  - 不在本次提案中实现真实目录权限体系
  - 不实现多级递归 catalog 树
  - 不实现 catalog 级审批、发布或复杂权限规则

## Decisions
- Decision: `Cube` 与 `View` 统一纳入“语义模型管理”
  - Why: 产品认知上 `View` 属于特殊语义模型，拆成一级页面会增加导航复杂度
  - Alternatives considered:
    - 单独拆出 `View 管理`
      - 缺点：与现有业务认知不一致，放大心智负担

- Decision: `Cube Studio` 保持独立，不纳入 `DevTools`
  - Why: Studio 属于建模主流程，不是运行调试工具
  - Alternatives considered:
    - 合并到 `DevTools`
      - 缺点：建模与调试混用，违背单一职责

- Decision: 新建语义模型时 `domain_id` 应可选
  - Why: 单模型建模应先完成来源绑定和基础定义，再决定是否纳入某个领域
  - Alternatives considered:
    - 强制先选领域
      - 缺点：把单模型管理绑定到领域建模前置条件，增加创建阻力

- Decision: 领域入口采用目录化结构，而非平铺卡片
  - Why: 目录结构更适合承载分类、层级和后续增长
  - Alternatives considered:
    - 保留卡片列表
      - 缺点：规模增长后检索和定位成本过高

- Decision: Catalog 采用轻量两层 `catalog -> domain`，不做多级树
  - Why: 当前阶段主要问题是“按业务归位”，而不是构建复杂的目录治理体系
  - Alternatives considered:
    - 保留纯扁平 domain 列表
      - 缺点：随着领域数量增长，目录页无法表达业务归属
    - 直接实现多级递归 catalog 树
      - 缺点：明显超出当前阶段需求，违背 `KISS` 和 `YAGNI`

- Decision: 独立“领域管理”工作区取消，单领域管理回归领域目录
  - Why: 目录定位与单领域生命周期维护属于同一上下文，拆开只会放大认知成本
  - Alternatives considered:
    - 保留独立“领域管理”页
      - 缺点：与目录页信息重复，违背单一职责和去重原则

- Decision: “领域建模”保留独立模块
  - Why: 建模画布、Join 配置、发布校验应与目录浏览和单领域管理分离
  - Alternatives considered:
    - 将建模入口并回目录页
      - 缺点：目录页会再次承担重操作工作流，回到职责混用问题

- Decision: 领域画布改为“中心画布优先”，侧栏可折叠或抽屉化
  - Why: 画布是建模主对象，信息面板不应挤占主要可视区域
  - Alternatives considered:
    - 保留左右常驻侧栏
      - 缺点：桌面端横向空间浪费严重，复杂领域下操作受限

## Risks / Trade-offs
- 导航和路由命名调整会带来一定迁移成本
  - Mitigation: 第一阶段允许保留原路由别名或重定向，先冻结职责再清理命名

- “统一语义模型管理”后，页面需支持 `kind` 差异化展示
  - Mitigation: 统一列表与详情壳，按 `kind` 控制字段区块

- 目录化领域管理可能需要新的前端数据结构
  - Mitigation: 第一阶段仅引入轻量两层模型，允许旧数据先挂在默认 catalog 下

- Catalog 新数据模型会影响领域创建与读取接口
  - Mitigation: 保持旧 `/domains` 能力兼容，同时新增 catalog 维度字段和查询入口，逐步迁移前端

## Migration Plan
1. 冻结一级导航，只保留“语义模型管理 / 领域目录 / 领域建模 / 开发者工具”
2. 取消独立“领域管理”概念，将单领域管理动作迁回目录详情区
3. 新增轻量 `catalog -> domain` 数据模型，并让旧 domain 数据可挂在默认 catalog 下
4. 调整领域目录为“左侧 catalog 与 domain 列表 / 右侧当前领域详情与管理”
5. 保留独立“领域建模”入口，承接创建领域草稿和进入画布
6. 将 `CubeStudio` 改为允许空 `domain_id`
7. 将 `DomainCanvas` 调整为中心画布优先布局
8. 将 Drift 说明收敛到统一摘要和检测页

## Open Questions
- 默认 catalog 的命名和迁移策略是否统一为“未分类领域”或“默认目录”
- “语义模型管理”是否保留现有 `/semantic/cubes` 路由命名，还是后续统一升级为 `/semantic/models`
