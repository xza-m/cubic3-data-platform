## Context
当前语义中心已经拆出 `Cube 管理 / Cube 详情 / Cube Studio / Domain 画布` 四类入口，但 `Domain` 仍缺少两个基础能力：
1. 生命周期不完整，导致“创建领域”与“发布领域”语义混淆。
2. 结构重复检测缺失，容易产生多个语义等价的 `domain_*.yml`，加重维护负担。

同时，领域画布的职责边界已经明确：画布是领域关系建模工作台，不再负责物理表发现和单 Cube 建模。因此本次设计需要把领域创建进一步收缩成“极简草稿创建”，把复杂性留在画布和发布时校验里。

## Goals / Non-Goals
- Goals:
  - 将 `Domain` 生命周期收口为 `draft -> active -> archived`
  - 将 `create_domain` 收口为只输入 `name`
  - 发布时基于领域结构指纹阻止完全重复的领域发布
  - 保持画布职责单一，避免重新混入 Cube Studio 行为
  - 完成后端单测、集成测试、前端类型检查和构建闭环
- Non-Goals:
  - 不在领域创建主链路引入 LLM
  - 不在第一阶段实现复杂“高相似度”推荐算法
  - 不把领域关系回写到 `cube/*.yml`
  - 不引入审批流、版本分支或真实物化

## Decisions
- Decision: Domain 创建仅要求 `name`
  - Why: 用户最难的是提前命名 `code` 和填写说明，领域真正的业务含义由画布关系决定。
  - Alternatives considered:
    - 创建时手工填写 `code/name/description`：维护成本高，和画布建模顺序冲突。
    - 创建时用 LLM 生成所有元数据：主链路不确定、难测试。

- Decision: Domain 生命周期采用 `draft -> active -> archived`
  - Why: 需要显式区分“草稿建模中”和“已发布可消费”的领域对象。
  - Alternatives considered:
    - 仅 `active | archived`：无法表达建模草稿状态，用户心智混乱。

- Decision: 重复检测使用 `Domain Fingerprint`
  - Why: 名称重复不能代表结构重复，真正的风险是多个结构完全相同的领域 YAML。
  - Alternatives considered:
    - 只做名称唯一：无法防止结构重复。
    - 一上来做图相似度算法：复杂度高，第一阶段收益低。

- Decision: 发布期硬拦截，编辑期预留软提示
  - Why: 发布是唯一必须保证语义资产稳定性的关口；编辑期提示可以后续增强。
  - Alternatives considered:
    - 只在发布时检测：可行，但用户反馈较晚；本次先保留扩展点。

## Domain Fingerprint 模型
`Domain Fingerprint` 由以下归一化数据计算：
- 排序后的 `cubes`
- 排序后的 `joins`
- 每条 Join 的：
  - `source_cube`
  - `target_cube`
  - `source_field`
  - `target_field`
  - `join_type`
  - `cardinality`
  - `aggregation_strategy`

归一化后使用稳定 JSON 序列化并计算 SHA1/等价哈希，作为：
- 发布期重复领域硬校验依据
- registry 中的领域结构摘要
- 后续编辑期相似领域提示的基础数据

## API / UX 调整
### 后端
- `POST /api/v1/semantic/domains`
  - 输入：`{ "name": "答题分析" }`
  - 输出：自动生成 `code/id/status=draft`
- `POST /api/v1/semantic/domains/:id/publish`
  - 执行结构校验、重复检测、激活领域
- `GET /api/v1/semantic/domains/:id`
  - 返回 `status`、`fingerprint summary`、发布摘要

### 前端
- `DomainList`
  - 只保留一个输入框：`领域名称`
  - 主按钮文案调整为：`创建草稿`
  - 创建成功后直接跳到对应领域画布
- `DomainCanvas`
  - 顶部明确显示当前领域状态
  - 发布时展示校验失败原因，包括“结构完全重复”

## Risks / Trade-offs
- 风险: 自动生成 `code` 可能与历史领域冲突
  - Mitigation: 后端统一 slug 化并冲突后自动追加后缀，保持稳定且可预测
- 风险: 只做完全重复检测，仍可能出现高度相似领域
  - Mitigation: 本次先保证不出现完全重复领域；后续若需要，可基于 `fingerprint` 和交集率补充软提示
- 风险: 领域创建过于极简，可能缺少描述信息
  - Mitigation: `description` 允许为空，后续在发布后手工补充或辅助生成，不阻塞主链路

## Migration Plan
1. 扩展 `DomainDefinition.status` 为 `draft | active | archived`
2. 调整 `create_domain` 输入模型，仅接受 `name`
3. 后端统一生成 `code/id/status=draft`
4. 在 `publish_domain` 中加入指纹计算和重复检测
5. 扩展 registry 持久化 `domain_fingerprint`
6. 调整前端 `DomainList` 表单和创建成功跳转逻辑
7. 增加后端单测、API 集成测试、前端类型检查/构建验证

## Testability Constraints
- 指纹计算逻辑必须在应用服务内可单测，不依赖 Flask request context
- `create_domain`、`publish_domain`、重复检测和状态流转必须有单测
- API 集成测试必须覆盖：创建草稿、发布成功、重复发布失败
- 前端必须通过 `tsc` 和 `build`，并确保领域创建页不再依赖手工输入 `code`
