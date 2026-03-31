---
phase: 2
reviewers: [gemini, claude]
reviewed_at: 2026-03-26T10:39:39+0800
plans_reviewed:
  - 02-01-PLAN.md
  - 02-02-PLAN.md
  - 02-03-PLAN.md
  - 02-04-PLAN.md
---

# Cross-AI Plan Review — Phase 2

> 说明：当前会话运行在 Codex 内，为保持 reviewer 独立性，本次未调用 `codex` CLI；`gemini` 首次调用遇到上游容量限制，收缩 prompt 后重试成功。

## Gemini Review

# Phase 2 Implementation Plan Review: Semantic Object Lifecycle and Domain Directory

## 1. Summary
The proposed implementation plan is highly disciplined and architecturally sound. It correctly prioritizes establishing the **"Domain-to-Cube" relationship truth** in the backend (Wave 1) before attempting to unify the frontend "Governance Workbench" (Wave 2). By treating `View` as a "Special Cube" and `Recipe` as a lightweight consumption asset, the plan avoids over-engineering while satisfying the requirement for a unified lifecycle experience. The focus on multi-domain projections while maintaining legacy `domain_id` compatibility ensures a smooth transition without breaking existing consumers.

---

## 2. Strengths
- **Truth Centricity:** Plan 01 correctly identifies `Domain.cubes[]` as the source of truth, moving away from the limiting "one-to-one" mental model while keeping `Cube.domain_id` for backward compatibility.
- **Pragmatic Consolidation:** Treating `View` as a "Special Cube" in the UI layer (Plan 03) achieves the goal of a unified lifecycle without the high cost of refactoring the underlying persistence models.
- **Performance Awareness:** The decision to compute multi-domain projections (`related_domain_ids`, `domain_count`) at the service layer for "Governance Views" allows for optimized batch fetching rather than recursive database calls.
- **Verification Depth:** The inclusion of visual regression (`semantic.visual.spec.ts`) and specific ADR updates ensures that architectural "drift" is prevented and the quality of the new workbench UI is locked in.

---

## 3. Concerns

### [MEDIUM] Performance of Multi-Domain Projections in List Views
- **Description:** Adding `related_domain_names` and `domain_count` to every item in the `CubeList` or `DomainCatalog` could lead to an "N+1" query problem if the `SemanticDefinitionService` doesn't use an optimized batch-join or pre-fetching strategy.
- **Impact:** Slow loading times for the Domain Directory as the number of Cubes grows.

### [LOW] Ambiguity of the "Primary" Domain ID
- **Description:** Since `Cube.domain_id` is retained as a "compatible projection," the plan doesn't specify which domain "wins" if a Cube belongs to multiple domains.
- **Impact:** Frontend editors (CubeStudio) might show inconsistent "Primary Domain" labels if the logic isn't deterministic (e.g., "first created" vs. "lexicographical").

### [LOW] Lifecycle State Transition Rules
- **Description:** The plan mentions "clear lifecycle states" (draft, active, archived) but doesn't explicitly define transition constraints (e.g., "Cannot archive a Cube if it is the only member of an Active Domain").
- **Impact:** Potential for "zombie" domains or broken metadata links if states are changed in isolation.

---

## 4. Suggestions

1. **Optimize Projections (Plan 01/02):** In `SemanticDefinitionService`, implement a `bulk_load_domain_projections(cube_ids)` method to fetch all domain mappings in a single query or equivalent batch path, rather than resolving them per cube.
2. **Define "Primary" Logic (Plan 02):** Explicitly define the legacy `domain_id` as a deterministic projection such as "First-Associated Domain" or "Owner Domain" in backend comments and tests.
3. **Standardize State UI (Plan 03):** Create a shared `SemanticStateBadge` component in the frontend to map different backend enums to unified user-facing labels.
4. **Integrity Check (Plan 01):** Add a validation or warning when archiving a Domain that still contains `active` cubes not referenced by any other active domain.

---

## 5. Risk Assessment: LOW
The plan is **Low Risk** due to:
- **Strict Scope Control:** It adheres to locked decisions and avoids unnecessary platform expansion.
- **Evolutionary Approach:** It preserves existing API contracts (`domain_id`) while adding new governance fields.
- **High Test Coverage:** The plan explicitly includes unit, integration, and E2E visual regression tests.
- **Dependency Clarity:** Wave-based execution ensures the backend foundation is solid before the UI is updated.

**Verdict:** The plans are ready for execution. Progress from `02-01-PLAN.md` immediately.

---

## Claude Review

# Phase 2 Plan Review: Semantic Object Lifecycle & Domain Directory

## Overall Assessment

The four plans form a coherent wave structure (backend → API/service → frontend → e2e/docs) that correctly prioritizes establishing the domain relationship truth before building UI on top of it. The scope is well-contained and aligned with locked decisions.

---

## 02-01: Domain Relationship Rules & Governance Summary

**Summary:** Solid foundational plan that addresses the core data model gap (multi-domain truth vs single `domain_id` projection). Correctly scoped to service layer only.

**Strengths:**
- Tackles the root cause first — all downstream plans depend on this being right
- Clear dedup rule (cross-domain OK, intra-domain duplicate forbidden)
- Preserves backward compatibility with `domain_id`

**Concerns:**
- **LOW:** No mention of how dedup handles ordering edge cases (e.g., bulk import with duplicates mid-list)
- **LOW:** No performance consideration for `related_domain_ids` computation when cube count is large

**Suggestions:** None material — this is appropriately scoped.

**Risk: LOW**

---

## 02-02: Unified Object Summaries (Cube/View/Recipe)

**Summary:** Correctly extends the definition service to produce unified summaries. The split between Cube (full treatment), View (summary alignment), and Recipe (minimal) matches the locked decisions well.

**Strengths:**
- Respects the "View = special Cube in display, untouched underneath" decision
- Recipe stays lightweight — no scope creep
- Includes integration test for API contract

**Concerns:**
- **MEDIUM:** Plan claims `depends_on: []` (wave 1, parallel with 01), but Task 1 needs multi-domain projection fields that 02-01 produces. If 02-02 runs truly in parallel, it must either define the field shape independently or explicitly depend on 02-01.
- **LOW:** `test_view_publish_service.py` appears in verification but not in `files_modified`; clarify whether it is only run or also updated.

**Suggestions:**
- Either add `depends_on: [01]` or document that 02 defines the shared field-shape contract and 01 conforms to it.

**Risk: MEDIUM** — the parallel execution with 01 has a coupling risk on field shape.

---

## 02-03: Frontend Alignment

**Summary:** Straightforward frontend consumption of the new backend contracts. Scope is well-bounded by the "CubeStudio only edits single `domain_id`" constraint.

**Strengths:**
- Explicitly avoids multi-domain editor in CubeStudio — good scope discipline
- Covers all relevant pages including the often-forgotten `ViewDetail`
- Page-level test coverage for every modified page

**Concerns:**
- **MEDIUM:** `CubeDetail.page.test.tsx` is listed but may need to be created explicitly; call this out in the plan.
- **LOW:** The file list is large enough that execution could drift into a broad frontend refactor if not controlled carefully.

**Suggestions:**
- Consider splitting the frontend work if the diff becomes too large during execution.

**Risk: LOW**

---

## 02-04: E2E Regression & Documentation Baseline

**Summary:** Essential closing plan. Without this, Phase 2 outcomes would be invisible to future contributors.

**Strengths:**
- Ties deliverables to existing `make` targets — no new tooling needed
- ADR update is the right place for page-model decisions
- Updates both verification docs and PRD, which helps keep documentation coherent

**Concerns:**
- **MEDIUM:** `domain-catalog.spec.ts` is named as a key artifact, but the covered scenarios are not bounded in the plan.
- **LOW:** `make verify-docs` should be treated as an existing gate; verify current availability before relying on it.

**Suggestions:**
- List several concrete `domain-catalog` scenarios in the plan to prevent scope creep or thin coverage.

**Risk: LOW-MEDIUM**

---

## Cross-Plan Risk Summary

| Risk | Severity | Mitigation |
|---|---|---|
| 02-01 and 02-02 parallel execution with shared field shape | **MEDIUM** | Make 02-02 depend on 02-01, or define the shared contract up front |
| New test files not flagged as new | **LOW** | Clarify file creation in plan text |
| `make verify-docs` gate may not be stable | **LOW** | Confirm before Wave 3 |

**Overall Phase Risk: LOW-MEDIUM.** The plans are well-structured and appropriately scoped. The main actionable concern is the 01↔02 parallelism.

---

## Consensus Summary

两位 reviewer 对整体方向判断一致：Phase 2 的规划是收敛的、分 wave 合理的，最重要的优点是先把 `Domain.cubes[]` 的关系真相和兼容投影建立好，再去做前端工作台和回归闭环，没有在 `View` / `Recipe` 上过度扩张。

### Agreed Strengths

- 计划遵守了锁定决策，没有把 Phase 2 扩成底层对象模型重构。
- `Cube / Domain` 真相优先、`View` 作为特殊 `Cube`、`Recipe` 保持轻量，这个切分是合理的。
- Wave 结构清晰，后端关系治理先于前端收敛，最后再做 E2E 与文档收口。
- 验证层次完整，已经覆盖 unit、integration、页面回归与浏览器回归。

### Agreed Concerns

- **P1:** `02-01` 与 `02-02` 目前都在 Wave 1 且无依赖，但两者共享多领域投影字段契约；如果执行时真正并行，存在字段形状和实现顺序耦合风险。
- **P2:** 多领域投影字段的计算需要提前考虑列表/目录场景下的批量加载策略，否则容易在 `CubeList` / `DomainList` 形成性能问题。
- **P3:** `Cube.domain_id` 作为兼容投影字段，需要更明确的确定性规则，否则前端主投影领域的表现可能不稳定。

### Divergent Views

- `Gemini` 更关注长期治理完整性，额外指出了生命周期状态切换约束和领域归档完整性问题。
- `Claude` 更关注计划执行粒度，重点指出了 `02-02` 的依赖关系、测试文件新增说明以及 `domain-catalog.spec.ts` 的场景边界。

### Recommended Follow-Ups Before Execute

1. 将 `02-02-PLAN.md` 改成 `depends_on: [01]`，或在 plan 里明确“字段契约由 02-02 定义、02-01 只负责产出真相数据”。
2. 在 `02-02-PLAN.md` 或 `02-01-PLAN.md` 里补一句多领域投影的批量加载/缓存策略，至少避免逐 Cube 逐领域扫描成为默认实现。
3. 明确 `domain_id` 投影字段的确定性规则，并在 unit / integration 测试中显式断言。
4. 在 `02-04-PLAN.md` 里收紧 `domain-catalog.spec.ts` 的覆盖场景，避免执行时无限扩张。

