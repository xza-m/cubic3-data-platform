<!-- docs/superpowers/specs/archive/README.md -->

# Specs Archive

本目录归档**已被 Master Plan 实施覆盖、暂缓、或上线后无需主动维护**的设计稿。
归档原则同 [`../../plans/archive/README.md`](../../plans/archive/README.md)。

| 文件 | 归档原因 | 后继 |
| --- | --- | --- |
| `2026-04-06-semantic-modeling-source-design.md` | 语义建模 source 抽象设计稿，已落地为 `cube_modeling_source_service` + `view_materialize_service`。 | 在线代码即文档；变更由 ADR-001 / `02-backend-workstream.md` 跟踪 |
| `2026-04-14-ontology-workbench-cube-assisted-modeling-design.md` | 对应 P04 cube 辅助建模实现稿；功能计划在 Round 4 重新评估。 | Round 4（封盘报告 §4.1 R-002）|
| `2026-04-14-ontology-workbench-object-aggregate-design.md` | 对应 P17 object aggregate 设计稿；实现已通过 `archive/ontology-object-aggregate-2026-04-14` git tag 冷藏。 | Round 4（封盘报告 §4.1 R-001）|

如需回归，将设计稿 `git mv ../<file>.md` 并在新 plan / spec 里引用本归档版本。
