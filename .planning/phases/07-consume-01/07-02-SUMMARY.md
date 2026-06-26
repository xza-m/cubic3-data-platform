---
phase: 07-consume-01
plan: 02
subsystem: semantic-release
tags: [tdd-green, semantic, release, manifest-accumulation, baseline-rebuild]
requires:
  - "07-01：发布累积缺陷的 RED 测试基线（本 Wave 让其转 GREEN）"
provides:
  - "publish 按 asset_key 累积合并 active manifest（A+B 同在、新覆盖旧）"
  - "compatibility 声明累积口径（removed 恒空、不再误判 breaking）"
  - "rollback_to 累积护栏（恢复全量 release 无重复 asset_key）"
  - "rebuild_active_baseline 可重复执行的基线重建 service 方法（答题 cube + comment cube 合并发全量 active release）"
affects:
  - app/application/semantic/semantic_release_service.py
  - tests/unit/application/semantic/test_semantic_release_service.py
  - tests/unit/application/semantic/test_semantic_baseline_rebuild.py
tech-stack:
  added: []
  patterns:
    - "TDD GREEN：让 Plan 01 RED 转 GREEN，按 (asset_type, asset_key) 合并去重的累积发布"
    - "抽出 _merge_prev_active_with_revisions / _build_assets_from_merged 私有 helper 供 publish 与 rebuild 共用，守住改动最小"
    - "rollback_to 生产代码零改动，仅加护栏测试坐实累积下不回归"
key-files:
  created:
    - tests/unit/application/semantic/test_semantic_baseline_rebuild.py
  modified:
    - app/application/semantic/semantic_release_service.py
    - tests/unit/application/semantic/test_semantic_release_service.py
decisions:
  - "D1 publish 累积：构建 release_assets/manifest_assets 前先取 namespace 当前 active release 全量 assets，与本批 revisions 按 (asset_type, asset_key) 合并（prev 先放、本批覆盖），prev_id 为空时退化为原行为"
  - "compatibility removed 恒空：累积模型下发布不移除资产，level 不再因 removed 判 breaking；同步把既有 compatibility 测试第三段改累积口径"
  - "D2 rollback_to 生产代码零改动：复制 target 全量已自洽，仅加护栏测试坐实无重复 asset_key"
  - "D3 rebuild_active_baseline：读指定 asset 集合各取 current_revision_id 的 revision，合并发全量 active release；缺失 fail-loud；可重复执行；不写迁移/YAML"
metrics:
  duration: ~9m
  completed: 2026-06-26
  tasks: 3
  files: 3
---

# Phase 7 Plan 02: 发布累积 GREEN + 实现 Summary

实现「发布累积」（D1 核心），让 Plan 01 的 RED 测试转 GREEN：`publish` 构建新 release 的 assets 时先取 namespace 当前 active release 全量 assets，与本批 `revisions` 按 `(asset_type, asset_key)` 合并去重（新覆盖旧），消除「每次发布整盘替换、活菜单只剩 1 个 cube」的结构缺陷；同步修复 `compatibility` 累积口径（removed 恒空、不再误判 breaking）、为 `rollback_to` 加累积护栏（生产代码零改动）、新增可重复执行的 `rebuild_active_baseline` 基线重建 service 方法。改动仅 3 文件、消费侧零改动、未写 YAML、未加迁移。

## What Was Built

### Task 1: publish 按 asset_key 累积合并（GREEN 核心）
把 `publish`（原 :138-163 只遍历本批 revisions）的 manifest/release_assets 构建替换为「prev active 全量 ∪ 本批，按 (asset_type, asset_key) 合并去重」。抽出两个私有 helper 供 publish 与 rebuild 共用：

publish 改点（合并段）：
```python
# D1 发布累积：先取 namespace 当前 active release 的全量 assets，再用本批
# revisions 按 (asset_type, asset_key) 覆盖去重，避免每次发布整盘替换 active
# manifest（活菜单只剩最后一个 cube）。prev_id 为空（首次发布）时退化为只含本批。
merged_assets = self._merge_prev_active_with_revisions(
    namespace=namespace,
    revisions=revisions,
)
release_assets, manifest_assets = self._build_assets_from_merged(
    merged_assets,
    release_id=release.id,
)
```

`_merge_prev_active_with_revisions`：`get_active_release_id(namespace)` → `list_release_assets(prev_id)` → 各 `get_revision(asset.revision_id)` 拿 spec_json/spec_checksum；以 `(asset_type, asset_key)` 为键先放 prev（孤儿 revision 防御性跳过），再用本批 revisions 覆盖（保留 `get_asset_by_id` 缺失校验）。`prev_id` 为空时仅含本批 → 行为与改前一致。
`_build_assets_from_merged`：从合并 dict 生成 release_assets + manifest_assets（manifest 形状不变：spec 经 `_activated_spec`、status="published"）。

### Task 2: compatibility 累积口径 + rollback 护栏
- `_build_compatibility_declaration`：`removed` 从「previous.keys() - current.keys()」改为恒空 `list[str] = []`，docstring 更新为累积口径说明；`level = "breaking" if removed else "compatible"` 在 removed 恒空下恒为 compatible。`added`/`changed` 保留。
- 调整 `test_publish_declares_compatibility_against_previous_manifest` 第三段：发 cube_b 后 cube_a 因累积保留 → `level == "compatible"`、`removed_assets == []`、`added_assets == ["cube:cube_b"]`（前两段 added/changed 不变）。
- 新增 `test_rollback_to_accumulated_release_has_no_duplicate_keys`：连发 cube_a、cube_b（累积含 a+b）、cube_a v2，rollback 到含 a+b 的 release，断言 active manifest asset_key 集合 == {cube_a, cube_b} 且无重复 (type,key)。**rollback_to 生产逻辑零改动**（diff 不含 rollback_to 函数体改动）。

### Task 3: rebuild_active_baseline 基线重建 service 方法（D3）
新增 `rebuild_active_baseline(namespace, asset_keys, actor, idempotency_key, audit_writer)`：对每个 `(asset_type, asset_key)` 用 `get_asset(namespace, type, key)` 取 asset、`get_revision(asset.current_revision_id)` 取目标 revision，按 (asset_type, asset_key) 去重合并，复用 `_build_assets_from_merged` 构建 release_assets/manifest_assets，构 published release + active snapshot，`return self._release_repository.publish_with_snapshot(...)`（与 publish 同一落点，:418）。缺失 asset/revision 抛 `ValueError(f"baseline_asset_not_found: {asset_type}:{asset_key}")`。可重复执行（沿用 publish_with_snapshot 的 supersede 旧 active 行为）。

## GREEN 证明（pytest 实际计数）

```
$ ... tests/unit/application/semantic/test_semantic_release_accumulation.py
============================== 3 passed in 0.42s ===============================

$ ... tests/unit/application/semantic/test_semantic_release_service.py
============================== 11 passed in 1.35s ==============================

$ ... tests/unit/application/semantic/test_semantic_baseline_rebuild.py
============================== 3 passed in 0.40s ===============================

# 全期回归（含下游契约不回归）
$ ... test_semantic_release_accumulation.py test_semantic_release_service.py \
      test_semantic_baseline_rebuild.py test_runtime_manifest_catalog.py \
      test_runtime_semantic_tool_service.py test_runtime_snapshot_service.py
============================== 37 passed in 2.68s ==============================
```

- 累积：**3 passed**（Plan 01 三测试转 GREEN）。
- 发布服务全文件：**11 passed**（含 supersede / deprecate / revoke / rollback / compatibility 累积口径 / 单 active 不变量，均不回归）。
- 基线重建：**3 passed**（合并答题+comment cube / 可重复 / 缺失 fail-loud）。
- 全期回归（含下游契约）：**37 passed, 0 failed**（catalog / tool_service / snapshot_service 多 asset manifest 仍被正确解析）。

## Acceptance Criteria 核验

| 准则 | 结果 |
|---|---|
| 累积测试 3 passed | OK（`3 passed`） |
| publish 改点引用 prev active（`grep get_active_release_id`） | exit=0 OK |
| 合并段按 asset_key 去重（`grep merged_assets`） | exit=0 OK |
| 既有发布测试除 compatibility 不回归 | `9 passed, 1 deselected` OK |
| compatibility 全文件绿 | `11 passed` OK |
| 测试文件无 `"breaking"`（`grep -c`） | `0` OK |
| rollback 护栏测试存在 | exit=0 OK |
| rollback_to 函数体零改动（diff 不含） | OK（diff 无 rollback_to） |
| `def rebuild_active_baseline` 存在 | exit=0 OK |
| rebuild 走 publish_with_snapshot（:418） | OK |
| 基线测试 3 passed | OK |
| `baseline_asset_not_found` 断言存在 | exit=0 OK |
| 不写 YAML（diff/untracked yaml=0） | OK |
| 消费侧零改动（send_message_handler/grounding/catalog/tool_service/semantic/cubes） | OK（none） |
| 改动文件仅 3 个 | OK（semantic_release_service.py + 2 测试） |

## Deviations from Plan

None - plan executed exactly as written. Task 1/2/3 严格按 PLAN 的 `<action>` 与 `<interfaces>` 事实源契约实现；rollback_to 按 D2 保持生产代码零改动、仅加护栏测试。

## Self-Check: PASSED

- FOUND: app/application/semantic/semantic_release_service.py（含 `rebuild_active_baseline` / `merged_assets`）
- FOUND: tests/unit/application/semantic/test_semantic_baseline_rebuild.py
- FOUND: commit 470ab22（feat: publish 累积合并）
- FOUND: commit 4b990a0（fix: compatibility 累积口径 + rollback 护栏）
- FOUND: commit b35b399（feat: rebuild_active_baseline）
- git diff 仅含 semantic_release_service.py + 2 测试文件，无 *.yml/*.yaml，消费侧零改动

## Notes for Phase 8

- active runtime manifest 现已累积 namespace 内所有已发布资产，成为完整多 cube 目录。`rebuild_active_baseline(namespace, asset_keys=[("cube","dws_study_student_answer_kb_stat_di"),("cube","student_comment")], actor=..., idempotency_key=...)` 可作为一次性运维动作把答题 cube + comment cube 合并发为全量 active 起点（D3，可重复执行、非迁移）。
- 本 Wave 严格不碰消费侧：DataChat 切 official（`runtime_mode="official"`）、grounding、`GET /semantic/cubes` discovery 同源仍属 Phase 8。下游 RuntimeSemanticCatalog / RuntimeSemanticToolService 解析多 asset 已坐实不回归（37 passed）。
