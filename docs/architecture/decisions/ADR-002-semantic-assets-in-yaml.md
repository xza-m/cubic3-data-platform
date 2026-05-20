---
doc_type: adr
status: superseded
source_of_truth: secondary
owner: engineering
last_reviewed: 2026-05-19
---

# ADR-002 语义定义采用 YAML 文件仓储作为主承载

## 状态

已被 [ADR-010 生产语义资产采用 SQL Registry 作为事实源](ADR-010-semantic-sql-registry-production-source.md) 在生产链路上替代。

本 ADR 仅保留历史背景：YAML 仓储曾作为 Cube、Domain、View、Recipe、Catalog 的主承载。当前生产事实源为 PostgreSQL SQL Registry；YAML 只用于本地开发 fixture、示例 seed 和调试导出，不做生产双写，也不作为离线迁移输入。

## 背景

语义中心当前需要管理多类定义对象：

- Catalog
- Cube
- Domain
- View
- Recipe

这些对象与数据源、数据集等平台事实不同，不只是关系型记录，还需要承载结构化定义、嵌套配置和较强的可读性。当前代码已经提供一组 YAML 仓储：

- `YamlCatalogRepository`
- `YamlCubeRepository`
- `YamlDomainRepository`
- `YamlViewRepository`
- `YamlRecipeRepository`

同时，数据源、数据集和其他运行事实仍然以数据库为主。

## 决策

历史阶段曾把语义定义对象的主承载形式固定为 YAML 文件仓储：

- Catalog 存在 `app/infrastructure/semantic/catalogs/`
- Cube 存在 `app/infrastructure/semantic/cubes/`
- Domain 存在 `app/infrastructure/semantic/domains/`
- View 存在 `app/infrastructure/semantic/views/`
- Recipe 存在 `app/infrastructure/semantic/recipes/`

当前生产阶段已调整为：数据库继续承载数据源、数据集、执行记录等平台事实，同时 SQL Registry 承载生产语义资产事实源；YAML 不再是生产发布链路的主事实源。

## 理由

- YAML 更适合表达层级化、可读性强的语义定义
- 文件仓储天然适合当前体量下的调试、导出和人工检查
- 每类对象独立成文件，便于按对象粒度加载、保存和删除
- 当前语义服务已经围绕这些仓储构建，继续沿用比引入数据库优先模型的迁移成本更低

## 结果与约束

正面结果：

- 语义资产和平台事实分离，职责更清楚
- 语义定义便于直接查看、版本管理和迁移
- 不必为当前阶段额外引入更重的语义元数据存储层

约束：

- Cube、Domain、View、Recipe、Catalog 的历史主事实源是 YAML；生产发布链路以 SQL Registry 为准
- 任何想恢复生产 YAML 双写或 YAML 迁移输入的方案，都应视为架构变更并单独评估
- 文件命名、目录结构和对象主键策略会影响兼容性，不能随意改动
- 仓储缓存与 reload 行为属于当前实现约束，调试和热更新场景需要显式考虑刷新

## 相关文档

- [../backend.md](../backend.md)
- [../system-overview.md](../system-overview.md)
- [../../TECH_STACK_AND_ARCHITECTURE.md](../../TECH_STACK_AND_ARCHITECTURE.md)
