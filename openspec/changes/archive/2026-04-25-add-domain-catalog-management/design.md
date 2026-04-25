## Context
第一阶段已经证明 `catalog -> domain` 的目录心智是成立的，但实现仍属于过渡方案：

- `catalog` 目前不是独立对象
- catalog 名称与编码通过 domain 冗余维护
- 目录页还无法管理 catalog 自身

第二阶段的目标不是扩大 UI，而是把 catalog 从“归属字段”升级为“最小可治理对象”。

## Goals / Non-Goals
- Goals:
  - 引入独立可持久化的 Catalog 对象
  - 提供最小 CRUD 能力支撑目录页左侧 catalog 管理
  - 让 domain 归属引用真实 catalog，而不是复制名称
  - 让“新建领域”时可以先选 catalog
  - 保留第一阶段的目录心智和轻量实现风格
- Non-Goals:
  - 不实现多级递归 catalog 树
  - 不实现 catalog 级复杂权限、审批和发布
  - 不改变 domain canvas、compiler、query 的主业务规则
  - 不把 catalog 做成新的运行时查询边界对象

## Decisions
- Decision: Catalog 采用独立 YAML 对象持久化
  - Why: 当前 domain 已使用 YAML 仓储，实现 catalog 仓储可复用同一风格，迁移成本最低
  - Alternatives considered:
    - 继续只在 domain 上存字段
      - 缺点：catalog 无法独立治理，名称漂移无法控制
    - 直接引入数据库表
      - 缺点：对当前语义层 YAML 存储模式是过早演进

- Decision: Catalog 维持单层对象，不支持父子递归
  - Why: 当前核心需求是“按业务目录归位”，不是搭建完整知识树
  - Alternatives considered:
    - 多级树
      - 缺点：明显违背 `KISS` 和 `YAGNI`

- Decision: Domain 只保留 catalog 引用，把 catalog 名称收口到 Catalog 对象
  - Why: 避免 catalog 名称在多个 domain 上重复存储导致不一致
  - Alternatives considered:
    - 同时保留 catalog_code 和 catalog_name 为事实源
      - 缺点：违背 `DRY`

- Decision: 默认目录显式升级为真实 default catalog
  - Why: 第一阶段已存在隐式默认目录，第二阶段应将其正式化，避免迁移歧义
  - Alternatives considered:
    - 要求所有历史 domain 手工补 catalog
      - 缺点：迁移成本高，容易遗漏

## Risks / Trade-offs
- Catalog 仓储和 Domain 仓储将形成新的依赖关系
  - Mitigation: 保持 domain 只通过 `catalog_code` 引用，服务层负责拼装目录视图

- 目录页 UI 会在短期内再次调整
  - Mitigation: 保持“左 catalog / 右详情”主结构不变，只补 catalog 管理入口

- 历史 domain 数据的 catalog_name 可能与目标 catalog 对象不一致
  - Mitigation: 迁移时以 `catalog_code` 为主键，catalog 名称以新 Catalog 对象为准

## Migration Plan
1. 新增 `CatalogDefinition` 与 YAML catalog 仓储
2. 初始化真实默认 catalog
3. 为现有 domain 迁移 catalog 引用
4. 新增 `/semantic/catalogs` 的 CRUD 接口
5. 目录页补 catalog 管理入口与 domain 归属选择
6. 建模入口补“选择 catalog”能力

## Open Questions
- 是否允许删除一个仍包含 domain 的 catalog，还是强制先迁移/归档 domain
- 默认 catalog 是否允许被重命名，还是只允许编辑说明
