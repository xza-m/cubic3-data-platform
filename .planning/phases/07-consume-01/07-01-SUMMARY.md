---
phase: 07-consume-01
plan: 01
subsystem: semantic-release
tags: [tdd-red, semantic, release, manifest-accumulation]
requires: []
provides:
  - "发布累积缺陷的 RED 测试基线（坐实改前整盘替换，作为 Plan 02 GREEN 验收钩子）"
affects:
  - tests/unit/application/semantic/test_semantic_release_accumulation.py
tech-stack:
  added: []
  patterns:
    - "TDD RED：面向改后 GREEN 行为编写断言，按现状运行时 FAILED 坐实缺陷"
    - "测试侧放行 binding gate（binding_matrix_checker stub）隔离与本期改点正交的发布期断链校验"
key-files:
  created:
    - tests/unit/application/semantic/test_semantic_release_accumulation.py
  modified: []
decisions:
  - "Test 2 在测试侧关闭 binding gate，确保 RED 坐实「active manifest 被整盘替换」而非「gate 拦截 ontology」"
metrics:
  duration: ~4m
  completed: 2026-06-26
  tasks: 1
  files: 1
---

# Phase 7 Plan 01: 发布累积 RED 测试 Summary

为「发布累积」缺陷写下 RED 测试（D4 硬要求）：连续发布两个 cube 后 active manifest 只剩最后一个，坐实 `publish` 每次整盘替换、不累积 namespace 既有 active 资产。三个测试以「期望累积」的 GREEN 形态编写，按现状运行 Test 1/Test 2 FAILED、Test 3（去重护栏）PASSED。

## What Was Built

新建 `tests/unit/application/semantic/test_semantic_release_accumulation.py`（179 行，3 个测试函数），复用 `test_semantic_release_service.py` 的装配范式（`SqlAssetRegistryRepository(db_session)` + `SemanticReleaseService(repo)`），每个测试用独立 namespace（`qa_accum_1/2/3`）隔离、idempotency_key 唯一：

- **Test 1 `test_publish_accumulates_assets_across_namespace`**：连发 `cube_a`、`cube_b`，断言改后 active manifest 同含两者。改前 active manifest 只含 `cube_b` → FAILED（坐实不累积）。
- **Test 2 `test_publish_keeps_comment_ontology_in_active_manifest`**：先发 comment ontology（`asset_type="ontology"`, `asset_key="student_comment"`），再发答题 cube（`dws_study_student_answer_kb_stat_di`），断言改后两类资产共存。改前 comment ontology 被整盘替换、不在 active manifest → FAILED（坐实整盘替换）。
- **Test 3 `test_publish_dedups_same_asset_key_newest_wins`**：同 `asset_key` 发布 v1、v2（`force_new_revision=True`），断言该 key 仅 1 条且 `spec_checksum == v2`。去重护栏，改前即 PASSED。

## RED 证明（pytest 实际输出）

```
$ PYTHONPATH=. /Users/xuan/miniconda3/bin/python -m pytest --no-cov -q -p no:cacheprovider \
    tests/unit/application/semantic/test_semantic_release_accumulation.py

    assert keys == {"cube_a", "cube_b"}
E   AssertionError: assert {'cube_b'} == {'cube_a', 'cube_b'}
    assert ("ontology", "student_comment") in typed_keys
E   AssertionError: assert ('ontology', 'student_comment') in {('cube', 'dws_study_student_answer_kb_stat_di')}
FAILED tests/unit/application/semantic/test_semantic_release_accumulation.py::test_publish_accumulates_assets_across_namespace
FAILED tests/unit/application/semantic/test_semantic_release_accumulation.py::test_publish_keeps_comment_ontology_in_active_manifest
========================= 2 failed, 1 passed in 0.50s =========================
```

**计数行：`2 failed, 1 passed`** — Test 1（`{'cube_b'}` 缺 `cube_a`）与 Test 2（comment ontology 被答题 cube 替换、不在 manifest）按现状 FAILED，坐实「不累积 / comment 被整盘替换」缺陷；Test 3 去重护栏 PASSED。RED 成立。

## Acceptance Criteria 核验

| 准则 | 结果 |
|---|---|
| 文件存在（`test -f`） | exit=0 OK |
| 三个测试函数（`grep -c "^def test_"`） | `3` |
| 引用 `get_active_snapshot` 与 `asset_manifest_json` | 均 exit=0 OK |
| RED 证明（输出含 `failed`，Test 3 PASSED） | `2 failed, 1 passed` OK |
| 不触碰生产代码（`git diff --name-only app/ \| wc -l`） | `0` OK |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test 2 RED 坐实了错误的缺陷，已修正为坐实「整盘替换」**
- **Found during:** Task 1（首轮运行）
- **Issue:** 计划 `<interfaces>` 假定 `SemanticReleaseService(repo)` 可直接发布 comment ontology spec，但事实源代码显示构造函数默认装配真实 `check_binding_matrix`（`semantic_release_service.py:34-37`）。该 gate 在 `publish` 第一步（:117，早于 manifest 构建）对 ontology object 强制 `cube_bindings` 唯一 primary 绑定，否则抛 `SemanticBindingGateError: object_binding_missing`。首轮运行 Test 2 确实 FAILED，但失败原因是 gate 在 publish 第一步报错，**根本走不到累积断言**——RED 指向了「gate 拦截」而非计划要坐实的「active manifest 被整盘替换」。
- **Fix:** 在每个测试装配处显式传入放行的 `binding_matrix_checker` stub（`_allow_binding_gate(specs, *, active_catalog=None)`，签名匹配 `check_binding_matrix(specs, active_catalog=...)` 的真实调用形态）。理由：本期主改点是 `publish` 的 manifest 累积逻辑，与发布期断链校验完全正交（gate 已由 `test_publish_gate_service.py` 专项覆盖）。修正后 Test 2 走到累积断言，FAILED 输出变为 `assert ('ontology', 'student_comment') in {('cube', 'dws_study_student_answer_kb_stat_di')}`，正确坐实 comment ontology 被答题 cube 发布整盘替换。
- **Files modified:** `tests/unit/application/semantic/test_semantic_release_accumulation.py`（仅测试文件；生产代码零改动，`git diff app/`=0）
- **Commit:** a2952e2

## Self-Check: PASSED

- FOUND: tests/unit/application/semantic/test_semantic_release_accumulation.py
- FOUND: commit a2952e2（`git log --oneline | grep a2952e2`）
- `git diff --name-only app/` = 0（生产代码零改动，符合 TDD-RED 约束）

## Notes for Plan 02 (GREEN)

- Plan 02 修复 `publish`（约 :138-163）：构建 `release_assets`/`manifest_assets` 时先取 namespace 当前 active release 的 assets（`get_active_release_id` → `list_release_assets` → 各自 `get_revision`），与本批 `revisions` 按 `asset_key` 合并（dict 以 asset_key 为键，prev 先放、本批覆盖），即可让这三个测试全部 PASSED。
- **GREEN 验收钩子**：改后跑同一命令应得 `3 passed`。本文件的 binding gate stub 仅关闭与累积正交的断链校验，不影响累积逻辑验证；若 Plan 02 需要同时验证「带真实 gate 的 ontology 累积」，应在另一专项测试中携带合法 `cube_bindings`（指向同批或 active manifest 内含对应维度的 cube），不要混入本累积测试。
