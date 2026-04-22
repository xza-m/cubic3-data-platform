<!-- docs/superpowers/plans/2026-04-22-d21-legacy-references-prescan.md -->

# D+21 · `frontend/src/legacy/` 清理预扫（legacy 引用清单）

- **任务 ID**: D+21（Round 4 master plan · 清理域 · 目标 2026-05-12 左右执行）
- **当前状态**: 预扫完成 · **尚未执行删除**；结论在 §4
- **产出人**: 工程侧（Round 4 · 本次会话）

> 本文是"删 `src/legacy/` 前的地毯式引用扫描"，为未来 D+21 单独 MR 提供闭门清单。
> 删除步骤会写在独立 MR 里，本轮**不动**任何文件。

---

## 1. 目录与体量

| 指标 | 值 |
| --- | --- |
| 路径 | `frontend/src/legacy/` |
| 文件数 | **297** |
| 体量 | **3.1 MB**（源码 + 测试 + 图片基线） |
| 一级子目录 | `types / test / config / utils / components / hooks / lib` |
| 主要体量来源 | `components/{AppCenter, Semantic, FilterBuilder, FieldConfigurator, Chat, Layout, Selectors, business, ui, auth}` 与 `hooks/semantic-ia/` |

## 2. 生产代码中的"活引用"扫描

### 2.1 Import / alias（`@legacy`、`src/legacy`、`@/...`）

| 文件 | 用法 | 是否真正使用 legacy 代码 |
| --- | --- | --- |
| `frontend/vite.config.ts` | `alias['@'] → ./src/legacy` | ⚠️ **仅 alias 保留**；默认配置的 `index.html → /src/main.tsx → @v2/App`，不经过 `@/*` |
| `frontend/v2.vite.config.ts` | `mergeConfig(baseConfig, …)` | 与 `vite.config.ts` 等价（Round 3 cutover 后保留文件只为兼容 CI/Makefile 命令） |
| `frontend/tsconfig.json` | `paths['@/*'] → ./src/legacy/*` | ⚠️ **仅类型路径映射**；新代码不再写 `@/` |
| `frontend/vitest.config.ts` | `alias['@'] → ./src/legacy` + `exclude: 'src/legacy/**'` + `coverage.exclude: 'src/legacy/**'` | ⚠️ 三重映射，删 legacy 时需一并清 alias/exclude |
| `frontend/stylelint.config.js` | 含 legacy 相关忽略 | 需确认 |
| `frontend/.eslintrc.cjs:32` | `'src/legacy/**'` in `ignorePatterns` | 删除 legacy 后可去掉该 ignore |

**结论**：没有任何 `.ts/.tsx` 运行时文件 `import '...legacy...'`；引用全部是 **构建/类型配置层的 alias**。

### 2.2 存量 `@/` 别名引用（tsconfig `paths['@/*']`）

仓库里所有 `from '@/…'` 的 import **都发生在 `src/legacy/` 自身内部**（它们用 `@/` 相互引用）。没有 `src/v2/` 或 `tests/` 引用 `@/`。
→ 删除 `src/legacy/` 等价于让 `@/` 别名失效；同步删 tsconfig + vite + vitest 即可。

### 2.3 `src/main.tsx` 中的 legacy 痕迹

仅在首次渲染前做一次 **存储迁移**（v1 `localStorage.auth_token` / `theme` → v2 `sessionStorage.v2.access_token` / `localStorage.v2.theme.fallback`）。

| 是否可删 | 动作 |
| --- | --- |
| ✅ D+21 时可以删 | 原因：Round 3 cutover 已 21 天，用户登录 session 早已过期；保留只是为 migration 兜底 |
| 推荐保留方式 | 改为只读日志，若读到 legacy key 打 `obs.track('legacy_storage_present')`，再下一轮彻底删 |

## 3. 工具链中的 legacy 命令 / 配置

### 3.1 `frontend/package.json`

| scripts 行 | 现状 | D+21 动作 |
| --- | --- | --- |
| `"dev:legacy": "vite --config v2.vite.config.ts --mode legacy"` | 和 `dev:v2` 完全等价 | 删 |
| `"build:legacy": "tsc && vite build --config v2.vite.config.ts"` | 同上 | 删 |
| `"lint:legacy": "eslint src/legacy --ext ts,tsx"` | 专门给 legacy 跑 eslint | 删 |
| `"lint": "eslint . --ext ts,tsx --report-unused-disable-directives --ignore-pattern 'src/legacy/**'"` | 含 `--ignore-pattern 'src/legacy/**'` | 删 ignore 段 |

### 3.2 `frontend/vite.config.ts`

- 删 alias `'@': path.resolve(__dirname, './src/legacy')`
- 更新文件头注释（现在写着 "Legacy 仍可以通过 dev:legacy / build:legacy 跑…"）

### 3.3 `frontend/v2.vite.config.ts`

- **整个文件删除**（与 `vite.config.ts` 等价；保留只为兼容旧命令）
- 或保留但删掉与 legacy 相关的文案
- 需同步 `package.json` 中所有 `--config v2.vite.config.ts` 回落到默认 `vite.config.ts`
  - 影响 `dev:v2` / `build:v2` / `test:e2e:v2` / `test:e2e:v2:smoke` / `e2e:smoke` / `perf:lhci` / `preview:v2`
- 需同步 Makefile / CI / deploy.sh（见 §3.6）

### 3.4 `frontend/tsconfig.json`

- 删 `paths['@/*'] → ./src/legacy/*`
- 保留 `paths['@v2/*']`

### 3.5 `frontend/vitest.config.ts`

- 删 alias `'@' → ./src/legacy`
- 删 `exclude: 'src/legacy/**'`
- 删 `coverage.exclude: 'src/legacy/**'`

### 3.6 `Makefile`

| 行 | 动作 |
| --- | --- |
| `verify-cutover` 注释里提到 legacy regression | 保留历史上下文注释，或简化 |
| `test-regression-platform-* (DEPRECATED)` | 删除整段 target |
| `test-regression-semantic (DEPRECATED)` | 删除整段 target |

### 3.7 `.github/workflows/frontend-ci.yml`

| 行 | 现状 | D+21 动作 |
| --- | --- | --- |
| L17 job name `v2-build (tsc + vitest + vite legacy + v2)` | 含 "vite legacy" | 改名 |
| L48–49 `Vite build · legacy` → `npx vite build` | **仍在 CI 跑 legacy build！** | 删这步，或与 v2 合并为单次 `npx vite build` |
| L51–52 `Vite build · v2` → `npx vite build --config v2.vite.config.ts --emptyOutDir` | v2 走专用 config | 配合 §3.3 一起改为 `npx vite build --emptyOutDir` |
| L54–60 `Upload v2 build artefact` path `frontend/dist-v2` | outDir = dist-v2 来自 v2 config | 改为默认 `dist` 或在 `vite.config.ts` 显式设 `outDir: 'dist-v2'` 再走单 config |
| L175 job `route-parity-check (legacy ↔ v2)` | 名称里含 legacy | 改名为 `route-parity-check` |

### 3.8 `scripts/cutover/deploy.sh`

- 第 ~65 行 `npx vite build --config v2.vite.config.ts` → 同 §3.3 合并配置后改为 `npx vite build`

### 3.9 `scripts/doc_impact_rules.json` / `scripts/verify_rules.json`

存在 `v2.vite.config.ts` 字面，D+21 一并清理。

### 3.10 `frontend/stylelint.config.js`

- 若包含 `src/legacy/**` 忽略，删除

## 4. CLAUDE.md / AGENTS.md 中的 legacy 文案

| 文件 | 位置 | 性质 | 动作 |
| --- | --- | --- | --- |
| `AGENTS.md:45` | 提到 `docs/archive/legacy/` | **不是**代码 legacy；是文档归档规范 | **保留** |
| `CLAUDE.md:86` | 同上（`docs/archive/`） | **保留** |

即 CLAUDE / AGENTS 里的"legacy"指的是文档归档规范，不要误删。

## 5. 图像 / 视觉基线

`src/legacy/` 内不含 `*.png`；`frontend/tests/e2e-node/*-snapshots/` 下的快照与 v1 pages 强耦合，但这些 spec **已在 W4 cutover 时移除**（Makefile 标 DEPRECATED）。D+21 再做一次 `frontend/tests/e2e-node/` 的 sweep：

```bash
rg -l "from '@/" frontend/tests/  # 应该为 0
rg -l "src/legacy" frontend/tests/  # 应该为 0
```

→ 若非 0，插入 `src/legacy` 的 spec 需要在 D+21 MR 一并删或迁到 `tests/e2e-v2/`。

## 6. 外部引用（监控 / 埋点 / docs）

| 来源 | 内容 | 影响 |
| --- | --- | --- |
| `docs/archive/2026-01/*` | 大量 "legacy" 字面 | 无影响（archived）— 保留 |
| `docs/superpowers/plans/2026-04-20-*` | Round 1–3 过程记录 | 保留作为历史 |
| `.planning/codebase/ARCHITECTURE.md` / `STACK.md` | 可能说 `dev:v2 / build:v2` | 与 §3.3 同步更新 |

## 7. 建议的 D+21 MR 分步（单 MR / 单 commit 集）

1. **阶段 1（无行为变更）**：更新 `package.json` / `vite.config.ts` / `tsconfig.json` / `vitest.config.ts` / `.eslintrc.cjs` / `stylelint.config.js` 中所有 legacy 引用点，把 alias/路径 `@` → 指向一个空的 `src/legacy-shim/` 目录（内含 `index.ts` 抛 `throw new Error('legacy removed, use @v2/*')`），跑一遍 CI；
2. **阶段 2（删 src/legacy）**：`git rm -r frontend/src/legacy`；
3. **阶段 3（清 alias）**：删上一阶段的 `@` 别名与 tsconfig `paths['@/*']`；
4. **阶段 4（合并 vite.config）**：删 `v2.vite.config.ts`，把 `package.json` 中 `--config v2.vite.config.ts` 全部去掉；同步更新 `Makefile` / `deploy.sh` / `.github/workflows/*.yml` / `scripts/*.json`；
5. **阶段 5（清 Makefile）**：删 `test-regression-platform-*` / `test-regression-semantic` 两组 DEPRECATED target；
6. **阶段 6（清 main.tsx）**：删存储迁移代码（保留 7 天灰度后再清也可）；
7. 跑 `make verify-cutover` + `make verify-alembic`（Round 4 T-005 已接入）。

## 8. 动作清单 · 最终汇总（D+21 checklist）

- [ ] `frontend/src/legacy/` 整包删除
- [ ] `frontend/package.json`：删 3 个 legacy script（`dev:legacy` / `build:legacy` / `lint:legacy`）；`lint` 去掉 `--ignore-pattern 'src/legacy/**'`
- [ ] `frontend/vite.config.ts`：删 `'@'` alias；更新注释
- [ ] `frontend/v2.vite.config.ts`：删文件（或只做过渡）
- [ ] `frontend/tsconfig.json`：删 `paths['@/*']`
- [ ] `frontend/vitest.config.ts`：删 `'@'` alias、两个 `src/legacy/**` exclude
- [ ] `frontend/.eslintrc.cjs`：删 `ignorePatterns.src/legacy/**`
- [ ] `frontend/stylelint.config.js`：如存在 legacy 相关忽略，删
- [ ] `Makefile`：删 2 组 DEPRECATED target
- [ ] `.github/workflows/frontend-ci.yml`：删 `Vite build · legacy` 步骤；job 名字去掉 "legacy"
- [ ] `scripts/cutover/deploy.sh`：`--config v2.vite.config.ts` 统一去掉
- [ ] `scripts/doc_impact_rules.json` / `scripts/verify_rules.json`：去 `v2.vite.config.ts` 字面
- [ ] `frontend/src/main.tsx`：移除存储迁移段（可留 1 次灰度后再清）
- [ ] `.planning/codebase/*.md` / `README.md` / `frontend/v2.README.md`：把 `build:v2` / `dev:v2` 命令说明对齐统一
- [ ] 手跑 `make verify-cutover && make verify-alembic`
- [ ] D+21 MR 描述贴本文 §7 流程

## 9. 风险与回滚

- **风险**：MR 大但机械；唯一隐藏雷区是 `@/*` 别名还有外部链入（测试桩 / 文档示例）。通过阶段 1 的空 shim 能立即暴露。
- **回滚**：`git revert D+21-MR`；`src/legacy/` 目录在历史中仍可 `git show`（本 MR 不会去除历史）。

---

*D+21 · 预扫完毕；动作清单留给单独 MR。本文本身不触动任何现网行为。*
