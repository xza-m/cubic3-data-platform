---
phase: 3
reviewers: [gemini, claude]
reviewed_at: 2026-03-26T15:05:03+0800
plans_reviewed:
  - 03-01-PLAN.md
  - 03-02-PLAN.md
  - 03-03-PLAN.md
  - 03-04-PLAN.md
---

# Cross-AI Plan Review — Phase 3

> 说明：当前会话运行在 Codex 内，为保持 reviewer 独立性，本次未调用 `codex` CLI。`claude` 默认模型首次请求返回 `429` 限流，降级 `sonnet` 后也未稳定产出正文，因此本次只有 `gemini` 形成有效 reviewer 输出。

## Gemini Review

This review evaluates Implementation Plans **03-01 through 03-04** for the **CUBIC3 Phase 3: Semantic Runtime and Query Trust**.

---

### 1. Summary
The plan is a highly surgical and disciplined approach to consolidating semantic execution logic. Instead of building a new "Query Center," it focuses on **convergence**: standardizing the backend response into a "Trust Evidence Package" and making `DevTools` the single, authoritative entry point for all runtime actions (compile, query, materialize, drift detection). It avoids infrastructure bloat by using local storage for debug history and prioritizes "explorable" results over complex visualizations.

### 2. Strengths
*   **Architectural Discipline:** Strictly enforces Decision **D-01** (DevTools as the only entry point), which prevents the "feature fragmentation" common in brownfield projects.
*   **KISS/YAGNI Adherence:** Choosing browser local storage for `DevTools` history instead of a new backend table avoids unnecessary DB schema migrations, permission logic, and storage costs for transient debug data.
*   **Contract-First Verification:** Plan 01 focuses entirely on the "Evidence Package" (SQL, hashes, error codes), ensuring that the frontend isn't just "guessing" why a query failed.
*   **Reproducibility:** Including the `definition_hash` and `dsl_snapshot` in the debug history ensures that "Replay" is actually accurate, even if the underlying object has changed since the last run.

### 3. Concerns

#### **[HIGH] Definition Hash Consistency & Staleness**
*   **Issue:** Plan 02/03 relies on `definition_hash` to identify versioning. If the user has a local history item with `Hash A` and the current object in the DB is `Hash B`, the UI needs a clear "Stale" indicator.
*   **Risk:** Users might attempt to "Replay" a query and be confused when the results differ from the history because the underlying Cube/View definition was modified by someone else in the interim.

#### **[MEDIUM] Deep Linking Complexity**
*   **Issue:** Plan 03 moves operations from `Detail` pages to `DevTools`. A simple link to `/devtools` is insufficient for a good UX.
*   **Risk:** The "Jump to DevTools" action must support deep linking to the specific **Object Type** (Cube/View), **Object ID**, and **Tab** (Compile/SchemaSync). If the navigation state isn't handled correctly, users will lose context, leading to friction.

#### **[MEDIUM] Error Code Standardization**
*   **Issue:** Plan 01 introduces `error_code`.
*   **Risk:** Without a predefined "Error Catalog" (e.g., `SEMANTIC_001: Missing Join`, `DB_002: Connection Timeout`), the `hint` field will remain a messy string. The plan should specify a basic Enum or mapping strategy to ensure the UI can display distinct icons or "Hints" based on the error type.

#### **[LOW] Local Storage Overflow**
*   **Issue:** Storing `dsl_snapshot` and `sample_rows` in `localStorage` can quickly hit the ~5MB browser limit if results are large or history is long.
*   **Risk:** Silent failures when saving history. A simple "Last 20 entries" or "Clear History" mechanism should be explicit in the `DevTools` implementation.

### 4. Suggestions
1.  **Contextual Replay:** When replaying from history, if the `definition_hash` in history differs from the current live version, show a "Definition has changed" warning with a "Diff" button to see what changed (if possible).
2.  **The "Copy Evidence" Button:** Add a "Copy Debug Bundle" button in `DevTools` that exports the entire Evidence Package (SQL + Metadata + Hash) to the clipboard. This is invaluable for internal bug reporting (QRY-02).
3.  **Explicit Deep-Link Schema:** Ensure the React Router/State logic for `DevTools` accepts query params like `?targetType=view&targetId=123&action=sync` to automate the transition from `ViewDetail`.
4.  **Error Category Mapping:** In Plan 01, ensure the `SemanticQueryService` categorizes errors into at least three buckets: `Syntax/DSL Error` (user fixable), `Upstream/DB Error` (data source issue), and `System/Compile Error` (platform issue).

### 5. Overall Risk Assessment: **LOW**

The plans are well-ordered and focus on "tightening" existing logic rather than introducing high-risk new infrastructure. The dependency chain (Backend → DevTools Frontend → Integration → Verification) is logical. As long as the **Deep Linking** from Detail pages to DevTools is implemented smoothly, the transition to a "Single Entry Point" model will be successful without sacrificing UX.

**Verdict:** **APPROVED** (with recommendation to address the "Stale Hash" UI state and Deep-Link parameters).

---

## Claude Review

未形成有效 reviewer 输出。

- 首次调用默认模型返回 `429`：

```text
API Error: 429 {"error":{"type":"new_api_error","message":"当前模型 claude-opus-4-6 负载已经达到上限，请稍后重试 ..."},"type":"error"}
```

- 降级 `sonnet` 重试后未稳定产出正文，因此不把这次结果计入有效 reviewer。

---

## Consensus Summary

由于本次只有 `gemini` 形成有效 reviewer 输出，严格意义上不存在“双 reviewer 交叉共识”。下面的总结以 `gemini` 的高信号反馈作为当前可执行结论，并明确标注缺少第二个独立 reviewer 复核。

### Agreed Strengths

- 当前 Phase 3 的拆分是收敛型而不是扩张型，符合“`DevTools` 单一正式入口”的锁定决策。
- 用本地轻量历史而不是后端新表，符合 `KISS / YAGNI`，避免把调试历史做成平台功能。
- `03-01` 先做证据包契约，再做前端闭环和页面收敛，依赖顺序是合理的。
- `definition_hash + dsl_snapshot` 的组合是 Phase 3 可回放、可追踪的关键基础。

### Agreed Concerns

- **P1:** 需要在 `03-02 / 03-03` 中显式处理“历史记录定义哈希与当前对象定义不一致”的 stale 场景，否则回放结果会让用户困惑。
- **P2:** 详情页跳到 `DevTools` 不能只给一个笼统链接，必须有稳定的深链参数，至少覆盖对象类型、对象标识和目标标签页。
- **P3:** `error_code` 不能只停留在自由字符串，最好在 `03-01` 中明确成最小分类映射，否则前端很难稳定展示错误语义。
- **P4:** 本地调试历史要明确上限和清理策略，避免 `localStorage` 容量静默失败。

### Divergent Views

- 无。当前只有 `gemini` 成功返回完整 review，`claude` 未形成有效正文。

### Recommended Follow-Ups Before Execute

1. 在 [03-02-PLAN.md](/Users/xuan/Work/cursor_projects/cubic3-data-platform/.planning/phases/03-semantic-runtime-and-query-trust/03-02-PLAN.md) 里补一句：回放历史若 `definition_hash` 与当前 live 定义不一致，前端必须给出 stale 提示。
2. 在 [03-03-PLAN.md](/Users/xuan/Work/cursor_projects/cubic3-data-platform/.planning/phases/03-semantic-runtime-and-query-trust/03-03-PLAN.md) 里把详情页跳转到 `DevTools` 的深链参数写清楚，避免执行阶段各写各的。
3. 在 [03-01-PLAN.md](/Users/xuan/Work/cursor_projects/cubic3-data-platform/.planning/phases/03-semantic-runtime-and-query-trust/03-01-PLAN.md) 里明确 `error_code` 的最小分类规则，而不是只说“新增字段”。
4. 在 [03-02-PLAN.md](/Users/xuan/Work/cursor_projects/cubic3-data-platform/.planning/phases/03-semantic-runtime-and-query-trust/03-02-PLAN.md) 里锁定本地历史条数上限和清理行为，避免实现时范围漂移。
