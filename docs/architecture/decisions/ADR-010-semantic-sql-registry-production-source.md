---
doc_type: adr
status: current
source_of_truth: primary
owner: engineering
last_reviewed: 2026-05-19
---

# ADR-010 生产语义资产采用 SQL Registry 作为事实源

## 状态

当前有效，替代 ADR-002 对生产语义资产事实源的约束。

## 背景

语义平台进入生产级发布后，单纯依赖 YAML 文件仓储无法稳定支撑多 worker 并发、发布审计、幂等回滚、Runtime 快照和上线前清理。生产链路需要可事务化、可约束、可审计的资产事实源。

## 决策

生产语义资产统一写入 PostgreSQL SQL Registry：

- `semantic_assets` 保存资产主记录。
- `semantic_asset_revisions` 保存不可变 spec revision 与 checksum。
- `semantic_asset_dependencies` 保存 revision 依赖。
- `semantic_releases` 与 `semantic_release_assets` 保存发布记录。
- `semantic_runtime_snapshots` 保存 official Runtime 只读快照。

发布链路必须先经过 Publish Gate，再创建 release record、release assets 和 active runtime snapshot。rollback 创建新的 release，不重新激活旧 snapshot。

YAML 仅保留为本地开发 fixture、示例 seed 和调试导出，不做生产双写，也不作为离线迁移输入。

## 结果与约束

- official Runtime 只读取 active SQL runtime snapshot manifest 中的 published `spec`。
- draft、Proposal 和 YAML 同名资产不得被 official Runtime fallback 命中。
- 发布、snapshot 激活、governance audit 必须处于同一事务边界。
- PostgreSQL partial unique index 保证同一 namespace 只有一个 active snapshot。
- 并发发布通过 namespace advisory lock 串行生成 `release_no` 和 `previous_release_id`。
- 上线前必须运行 `make verify-semantic-prod-strict`，补齐预生产 baseline、live smoke、fixture cleanup 和真实 PostgreSQL concurrency 验证。

## 相关文档

- [../../semantic_verification.md](../../semantic_verification.md)
- [../../prd/semantic_platform_production_refactor_spec.md](../../prd/semantic_platform_production_refactor_spec.md)
- [../backend.md](../backend.md)
