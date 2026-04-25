## 1. Implementation
- [x] 1.1 统一验证模型为四层入口与 `verify-*` 交付入口族 — 实现位于 `Makefile`（`lint` / `typecheck` / `test` / `smoke` + `verify-backend|frontend|semantic|docs|cutover` + `verify`）
- [x] 1.2 定义文档职责边界：`AGENTS.md`、`docs/quality/testing.md`、`docs/runbooks/local-dev.md`（边界规则在 `docs/quality/testing.md §1` 显式声明，`AGENTS.md §3` 明确"只定义完成标准、不维护规则表/脚本细节"）
- [x] 1.3 设计机器可读的验证规则表格式 — `scripts/verify_rules.json`（version / default_target / target_order / rules[name+kind+description+patterns+targets]）
- [x] 1.4 增加变更检测脚本，输出命中的规则、原因和建议执行目标 — `scripts/checks/changed_validation.py`（advisory + `--execute` + `--json` + `--base-ref` + `--worktree` + 升级到 `verify` 的 fail-closed 策略）
- [x] 1.5 增加统一入口用于查看或执行基于改动范围的验证集合 — `make verify-detect`（advisory）/ `make verify-changed`（execute）+ `VERIFY_FILES` / `VERIFY_BASE` / `VERIFY_CONTEXT` 参数
- [x] 1.6 明确语义 smoke 的状态契约、前置条件与升级规则 — `docs/quality/testing.md §8.2`（专项 / 非默认 / 非 hermetic / 仅在语义关键路径改动时作为交付门禁）
- [x] 1.7 更新开发者说明文档，避免文档与规则表双份真相 — 路由细则只在 `scripts/verify_rules.json`，文档保留高层契约（见 `docs/quality/testing.md §9` 与 `AGENTS.md §3` 第 51–52 行的 explicit 引用）

## 2. Tests
- [x] 2.1 验证规则表能够将文档改动映射到 `verify-docs` — `tests/unit/scripts/test_changed_validation.py::test_docs_only_routes_to_verify_docs`
- [x] 2.2 验证规则表能够将前端、后端、语义专项和跨域改动映射到正确的 `verify-*` — `test_semantic_change_routes_to_verify_semantic` / `test_semantic_backend_api_routes_to_verify_semantic` / `test_docs_and_frontend_changes_keep_scoped_targets`（covers semantic frontend / semantic backend / mixed scoped）
- [x] 2.3 验证检测结果不确定时会升级到更保守的收口入口 — `test_cross_domain_nonsemantic_change_escalates_to_repo_verify` / `test_unmatched_file_escalates_to_repo_verify`
- [x] 2.4 运行 `openspec validate add-testing-agent-workflow --strict` — close-out 时执行
