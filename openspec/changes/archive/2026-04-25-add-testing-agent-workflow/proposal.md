# Change: 引入测试规则检测与分层验证工作流

## Why
当前仓库已经有统一入口、四层验证模型和 `verify-*` 交付入口，但“改了什么就该跑什么”仍主要依赖文档和人工判断。文档改动已经通过 `verify-docs -> docs-health` 部分脚本化，但前后端、跨域、语义专项的入口选择尚未机器化。若继续把路径到验证入口的细粒度规则写在文档中，会形成双份真相，并增加 agent 的判断成本。

## What Changes
- **MODIFIED** Testing Workflow：将验证模型统一为四层入口 + `verify-*` 交付入口族。
- **ADDED** Verification Rule Table：引入机器可读的规则表，负责路径模式、升级规则和目标集合映射。
- **ADDED** Verification Scope Detection：增加变更检测脚本，根据文件改动匹配最小必跑验证集合。
- **ADDED** Documentation Boundary Contract：明确 `AGENTS.md`、`docs/quality/testing.md`、`docs/runbooks/local-dev.md` 与规则脚本的职责边界。
- **ADDED** Semantic Smoke Contract：明确语义 smoke 是专项、有状态、非默认仓库 smoke。

## Impact
- Affected specs: `testing-workflow`, `frontend-ui`
- Affected code:
  - `Makefile`
  - `scripts/`
  - `docs/quality/testing.md`
  - `docs/runbooks/local-dev.md`
  - `AGENTS.md`
