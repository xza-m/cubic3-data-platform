## Context

现有语义层已基本落地，但实现与最初 PRD 存在明显偏差：

- 编译器未完整执行 `relationship`、`public`、`max_range_days`、`enum_source`
- JOIN 目标 Cube 的 `default_filters` 注入位置错误，可能改变 LEFT JOIN 语义
- View 发布产物缺少语义来源追溯
- Drift 只检查维度字段，不检查 JOIN / View / 动态枚举
- 测试覆盖有基础，但还没有围绕“生产主路径”定义验收闭环
- API 层承担了过多 View 发布细节，不利于测试和职责边界控制

本次设计聚焦“生产基础可用”，优先服务 `DataAgent`，查询中心与 DevTools 共用同一套语义后端接口。设计上坚持“不做真实物化持久化”和“按当前架构分层实现”两条硬约束。

## Goals / Non-Goals

- Goals:
  - 让语义定义成为可执行合同，而不是静态 YAML
  - 让 `DSL -> SQL` 的核心编译行为稳定且可验证
  - 让执行、逻辑发布、漂移检测形成最小生产闭环
  - 让语义层实现保持测试友好和单一职责
  - 以真实业务用例完成验收
- Non-Goals:
  - 权限治理
  - 可视化建模器
  - 预聚合与缓存优化
  - 多方言完整抽象
  - 真正物化持久化
  - 独立 metastore / registry 平台化建设

## Decisions

- Decision: 保持 YAML 作为语义定义的单一事实源
  - Why: 当前仓库已围绕 YAML 仓储、前端编辑和 Agent few-shot 构建，不需要再引入数据库建模元存储

- Decision: 先补 Compiler 语义正确性，再扩 API 和前端
  - Why: 语义层的核心价值在于“正确生成统一口径 SQL”，不是 UI 丰富度

- Decision: View 只做逻辑发布，不做真正物化持久化
  - Why: 当前项目已有 `Dataset.virtual` 作为下游消费对象；发布编译后的 SQL 和字段映射即可满足消费复用，不需要创建物理结果表

- Decision: 保持当前分层架构，不引入额外编译平台
  - Why: 当前项目已经是典型的 `domain / application / infrastructure / interfaces` 结构，继续沿这条路径补强最符合 `KISS` 和 `YAGNI`

- Decision: `default_filters` 分层注入
  - 主 Cube 进入 `WHERE`
  - JOIN 目标 Cube 进入对应 `JOIN ... ON`
  - Why: 保持 LEFT JOIN 语义稳定，避免误过滤

- Decision: `1:N` JOIN 默认视为风险路径
  - Why: 当前系统没有成熟的 fan-out 聚合框架；与其默默产出错误指标，不如显式拒绝或受控聚合

- Decision: `public` 先作为消费曝光约束，而不是权限约束
  - Why: 这轮不做治理，但要避免内部语义对象被 Agent 和前端默认暴露

- Decision: 新增统一 `semantic query` 执行入口
  - Why: Agent、DevTools、未来查询中心都应共享同一条编译执行链路，避免协议分叉

- Decision: 逻辑发布必须保留语义来源，但不保存结果数据
  - Why: View 发布不是普通虚拟数据集创建，必须能回溯到语义对象和字段映射；但本轮不需要真正物化结果

- Decision: 将定义、查询、发布、漂移检测按应用服务拆分
  - Why: 语义层后续会继续扩展，若继续把逻辑堆在单个 service 或 API 文件，会破坏单一职责并增加测试成本

- Decision: 测试优先覆盖主链路，不引入超前抽象
  - Why: 当前最重要的是交付“可验证闭环”，不是建设完整语义平台产品

## Risks / Trade-offs

- 风险: `1:N` JOIN 拒绝策略会减少部分当前可查询场景
  - Mitigation: 本轮优先保证正确性；后续再补安全聚合或桥表建模

- 风险: `enum_source` 解析依赖外部数据源，测试复杂
  - Mitigation: 服务层使用可替换 Inspector / Loader，单测以 stub 驱动

- 风险: 前端最小闭环可能无法满足完整产品预期
  - Mitigation: 明确本轮只交付“查看、校验、编译执行、物化、漂移观测”

- 风险: 若继续保留 API 层中的发布编排，后续实现仍会职责漂移
  - Mitigation: 明确将 View 发布主逻辑下沉到应用层服务，API 只保留入参与响应封装

## Migration Plan

1. 先修改 Compiler 与实体合同，建立稳定的单测矩阵
2. 下沉 View 发布逻辑，形成 Definition / Query / Publish / SchemaSync 四类应用职责
3. 再扩 REST API，使 Agent / DevTools 走同一路径
4. 最后补前端最小联调和真实业务验收测试

## Open Questions

- `1:N` JOIN 本轮采用“直接拒绝”还是“仅对白名单指标启用受控聚合”
- `View.public=false` 是否需要在调试接口中通过参数显式暴露
- 发布元数据优先挂在现有 `Dataset` 元字段中，还是引入最小独立发布记录表
