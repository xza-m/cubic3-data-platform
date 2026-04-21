<!-- docs/superpowers/plans/2026-04-21-round4-cleanup-and-i18n.md -->

# Round 4 · Cleanup & I18n & Visual Polish · Implementation Plan

> 状态：**Drafted · 待启动会评审排期**
> 作者：UI/UX 重构小组（Round 3 收口同班底）
> 最近更新：2026-04-21
> 目标节奏：**4 周（Sprint 0 + 1 + 2，含穿插 D+14/D+21/D+28 cleanup）**
> 上游：[Round 3 封盘报告](2026-04-20-platform-redesign/round3-cutover-final-report.md) §4 / §7 / §9
> 副本档：本文件即 Round 4 唯一正式 plan，不再拆子文档（R4 范围已足够聚焦）

---

## 0. North Star

> **把 Round 3 留尾的 5 类技术债（生产稳定性 / R-001 / R-002 / i18n / 清理）一次性收口，
> 让 main 在 Round 4 末（D+30）达到「无遗留 fixme · 无 placeholder · 无双轨 · 真 i18n」。**

判定本方案"成功"的硬指标：

  | 维度 | 验收线 |
  | --- | --- |
  | 生产稳定性 | T-002/T-003 修复后再次执行 `deploy.sh` 不再出现 502 / 缺 migration |
  | fixme 清零 | `rg "test\.fixme" frontend/tests/e2e-v2/` 返回 0 |
  | i18n 落地 | `frontend/src/v2/i18n/zh.json` ≥ 90% 字面覆盖；`rg "[\u4e00-\u9fa5]" pages/ \| grep -v "i18n/"` 残留 < 50 行 |
  | a11y | axe-core color-contrast 重新打开后关键 5 页 0 严重违规 |
  | legacy 退役 | `frontend/src/legacy/` 已删除；`rg "from .*legacy/" src/` 返回 0 |
  | demo 退役 | `tmp/platform-redesign/` `tmp/ontology-workbench-redesign/` 已删除 |
  | 性能 | bundle ≤ 350 KB gzipped；Lighthouse 3 次 median 稳定 |
  | OnCall 工具链 | `health_probe.sh` / `digest_oncall.py` / `incident_init.py` 三脚本可用 |

---

## 1. 三大原则

1. **生产稳定性优先**：Sprint 0 是阻塞项，未完成不进 Sprint 1。
2. **可逆 ≥ 优雅**：Round 4 内任何"删"的动作（legacy / demo / placeholder）都先做"30 天 grace + 0 引用扫描"，再 PR。
3. **不引入新业务功能**：Round 4 是收口 sprint。3 个 placeholder 路由（/extraction/config · /data-chat · /queries/visual）若无业务 PRD，**继续 placeholder**，等 Round 5 决策。

---

## 2. Sprint 0 (Week 1) · 生产稳定性 · 与 D+14 同步

### 2.1 任务清单

  | ID | 任务 | 类型 | 估算 | Owner | 验收 |
  | --- | --- | --- | --- | --- | --- |
  | T-002 | `deploy.sh` 自动跑 `flask db upgrade head` | infra · P0 | 1d | OnCall | 模拟"新表未迁移"场景，deploy.sh 能自动补迁移 |
  | T-003 | `rebuild-frontend.sh` 补 backend upstream 健康度探测 | infra · P0 | 1d | OnCall | 故意停 backend 容器，rebuild-frontend.sh 提前 fail，不再让 nginx 切到死 upstream |
  | T-004a | `scripts/cutover/health_probe.sh` 实装 | infra · P1 | 0.5d | OnCall | 探测 /api/v1/health · /metrics · 5 大模块首屏 |
  | T-004b | `scripts/cutover/digest_oncall.py` 实装 | ops · P1 | 1d | OnCall | 拉 nginx error.log + backend log + 错误率 → 日报 markdown |
  | T-004c | `scripts/cutover/incident_init.py` 实装 | ops · P1 | 0.5d | OnCall | 一键创建 incident doc + 飞书群 + checklist |
  | D+14 | 关闭回滚预案 + `rollback.sh` 加 DEPRECATED 注释 + OnCall 节奏复位 + 临时收紧告警阈值复位（A1 / A4） | ops · P1 | 1d | OnCall | 见封盘报告 §7.1 |
  | D+7 | R-003：Lighthouse `numberOfRuns` 改 3 + median；R-004：评估 lhci stubby（如有必要立 ticket） | ops · P2 | 0.5d | infra | `.github/workflows/frontend-ci.yml` lhci 段更新；CI 通过 |

  **Sprint 0 总计：5.5 day · 1 人 · 1 周完成**

### 2.2 Definition of Done

- [ ] 五个 P0/P1 脚本均合 main，CI 通过
- [ ] 在本地 docker compose 环境跑通"模拟生产"场景：`bash scripts/cutover/deploy.sh` 不报错（含 migration 自动跑）
- [ ] 用户今天的 502 场景重放：能在 30 s 内定位"是 backend 没起 / 是 migration 没跑 / 是 nginx 错"
- [ ] 飞书群 OnCall pin 一份《Round 4 OnCall 操作手册》

### 2.3 风险

  - **R-S0-01**：alembic 自动 upgrade 在生产可能危险（不可逆 down 的 migration）→ **缓解**：deploy.sh 加 `--skip-migrate` flag，DBA 在维护窗内决定是否手动跑

---

## 3. Sprint 1 (Week 2-3) · R-001 + R-002 收尾

### 3.1 任务清单

  | ID | 任务 | 类型 | 估算 | Owner | 验收 |
  | --- | --- | --- | --- | --- | --- |
  | R-001-P04 | 本体对象编辑 Tab 实装（字段类型校验、保存、撤销、版本对比） | feat-frontend · L1 | 5d | FE-A | `p04-ontology-object-validation.spec.ts` 去 `.fixme` + 通过 |
  | R-001-P17a | 抽取 Run 列表加重跑按钮 | feat-frontend · L1 | 1d | FE-B | UI 可见、点击触发后端 |
  | R-001-P17b | 抽取 Run 日志面板（PeekPanel 改造） | feat-frontend · L1 | 2d | FE-B | 日志流 / 滚动加载 / 高亮错误 |
  | R-001-P17c | 后端：抽取 Run rerun endpoint + 日志查询 | feat-backend · L1 | 2d | BE-A | `tests/integration/extraction/test_rerun_*.py` 通过 |
  | R-001-P17d | E2E：`p17-extraction-run-rerun.spec.ts` 去 `.fixme` | test · L1 | 1d | FE-B | 通过 |
  | R-001-OA | Object Aggregate 重做 vs cherry-pick 评估报告 | research · L1 | 3d | TL | `docs/superpowers/research/2026-04-2X-object-aggregate-decision.md` 输出决策；不实施 |
  | R-002a | Design tokens 修复：`--text-tertiary` 由 #888 → ≥ 4.5:1（建议 #6b6b6b）；`--bg-elev-1` 同步 | design · L2 | 1d | DS | Tokens 文件 PR |
  | R-002b | 重新打开 axe `color-contrast` 规则 + 跑全 5 关键页 | a11y · L2 | 1d | FE-A | `e2e-v2-a11y` job 通过 |
  | R-002c | 视觉回归：捕获新 baseline | visual · L2 | 1d | FE-A | `npm run e2e:v2:visual` 通过 |
  | D+21 | `git rm -r frontend/src/legacy/`（295 文件，已确认 0 引用）+ Makefile 引用清理 + CLAUDE.md/AGENTS.md 双轨段落删除 + `.eslintrc.cjs` legacy 例外清理 | cleanup · P2 | 1d | TL | 见封盘报告 §7.2 |

  **Sprint 1 总计：18 day · 4-5 人 · 2 周完成**

### 3.2 Definition of Done

- [ ] `rg "test\.fixme" frontend/tests/e2e-v2/` 返回 0
- [ ] axe-core 关键 5 页 0 严重违规（含 color-contrast）
- [ ] 视觉 baseline 已更新提交
- [ ] `frontend/src/legacy/` 不在 git 历史可见路径
- [ ] R-001 Object Aggregate 决策文档评审完成（决议是 sprint 2/3 实施 or 永久搁置）

### 3.3 风险

  - **R-S1-01**：P04 编辑 Tab 涉及 ontology versioning，可能比 5d 估算更复杂 → **缓解**：D-3 切片 spike，必要时切到 sprint 2
  - **R-S1-02**：color-contrast 修复可能引发视觉 regression（按钮 / chip / 图标对比都受影响）→ **缓解**：DS 一周内 token 评审 + 全模块视觉 review

---

## 4. Sprint 2 (Week 3-4, 与 Sprint 1 后半重叠) · I18n + 视觉收口

### 4.1 任务清单

  | ID | 任务 | 类型 | 估算 | Owner | 验收 |
  | --- | --- | --- | --- | --- | --- |
  | T-001a | 工具：写 `frontend/scripts/i18n-extract.mjs` AST 抽取所有中文字面 | infra · L1 | 1d | FE-C | 输出 `i18n-keys.json` 候选清单 |
  | T-001b | 人工评审 + 归类：domain.action.modifier 命名规范 | docs · L1 | 1d | FE-C+TL | `docs/superpowers/specs/2026-04-2X-i18n-key-conventions.md` |
  | T-001c | 全平台批量替换：先 5 大模块（dashboard/data/queries/semantic/apps），用 `t()` 包裹 | feat-frontend · L1 | 4d | FE-C | `rg "[\u4e00-\u9fa5]" pages/` 残留 < 50 行 |
  | T-001d | `zh.json` ≥ 90% 字面覆盖；`en.json` 占位（机翻 + 待人工 review） | docs · L2 | 1d | FE-C | i18n 工具不报 missing key |
  | T-001e | CI 守门：`scripts/checks/i18n-coverage.py` 加 lint，硬编码中文 ≥ 阈值即 fail | infra · L1 | 1d | infra | CI job 上线 |
  | A-1 | `prefers-reduced-motion` 支持（PeekPanel / 路由切换 / spinner 都尊重） | design · L2 | 2d | FE-A | 系统设置开启动画偏好后，无非必要动画 |
  | A-2 | `prefers-contrast: more` 高对比度主题（基于 R-002 tokens 派生） | design · L2 | 2d | DS | 系统设置高对比度后视觉切换 |
  | D+28 | `git rm -rf tmp/platform-redesign/ tmp/ontology-workbench-redesign/`；`uiv2.pen` 归档；`platform-redesign/` README 加 `[ARCHIVED · v2 LIVE]` 徽章；Round 4 backlog 评审 | cleanup · P2 | 1d | TL | 见封盘报告 §7.3 |

  **Sprint 2 总计：13 day · 3-4 人 · 2 周完成**

### 4.2 Definition of Done

- [ ] i18n CI lint 上线，main 不再允许新增硬编码中文
- [ ] zh.json 字面 ≥ 90% 覆盖（`pages/` 内）
- [ ] 系统设置切换 reduced-motion / high-contrast，前端正确响应
- [ ] tmp/* demo 退役
- [ ] platform-redesign/ 文件夹标记 ARCHIVED

### 4.3 风险

  - **R-S2-01**：批量 t() 替换可能触发隐式样式 bug（`<span>{文本}</span>` → `<span>{t('xxx')}</span>` 在 React fragment 内可能 break）→ **缓解**：依赖 e2e-v2 happy 30 全绿 + visual baseline
  - **R-S2-02**：英文翻译质量未保证 → **缓解**：本期 en.json 仅占位 + 机翻，正式英文化留 Round 5

---

## 5. Sprint 3 候选（不在本 plan 估算，由 PM 在 Sprint 2 末决策）

  | 主题 | 内容 | 触发条件 |
  | --- | --- | --- |
  | **C 用户偏好扩展** | 暗黑模式正式上线 / 紧凑模式 / 默认落地页 / 个性化 nav | 数据团队验证一周以上有需求 |
  | **D 后端 B-back-10+** | 业务 PRD 驱动；候选：作业流（cron 编排）、数据血缘 viewer、cube 级权限 | 业务方提 PRD |
  | **Placeholder 实装** | /extraction/config · /data-chat · /queries/visual | 对应业务 PRD 落地 |
  | **R-001-OA 实施** | 取决于 Sprint 1 评估报告结论 | 评估报告判 GO |

---

## 6. 跨 Sprint 共享事项

### 6.1 PR / 提交规范

  - 每个任务 ID 至少 1 个独立 PR；PR title 格式：`[R4-Sprint-X] <ID>: <一句话>`
  - PR description 引用本 plan 行；附带验收截图 / 命令输出
  - **不允许合 main**：未通过 `make verify-cutover` 的 PR

### 6.2 分支策略

  - 主分支 `main`（所有 PR target）
  - 单任务分支命名：`r4/<sprint>/<id>-<slug>`，例：`r4/s1/r-001-p04-object-edit-tab`
  - Sprint 末打 tag：`r4-sprint-{0,1,2}-end`

### 6.3 Verify-cutover 复用

  - Round 4 不重新设计闸门，全部沿用 `make verify-cutover`
  - 但 Sprint 0 完成后 verify-cutover 应升级为 v2：补 alembic dryrun + nginx upstream 探测

### 6.4 文档更新规则

  - 每个 sprint 末更新本 plan 的"实际完成"列
  - Sprint 2 末写 `round4-final-report.md`，附在 `docs/superpowers/plans/2026-04-21-round4/`（如本 plan 拆分需要）
  - 任何 spec 改动落到 `docs/superpowers/specs/`，不落到本 plan

---

## 7. 时间表（理想节奏）

  ```text
  W1  ── Sprint 0 (生产稳定性) ─────────────────────────────────── D+14 同步
  W2  ── Sprint 1 (R-001/R-002) ───────────────┬──────────────── D+21 同步
  W3  ── Sprint 1 续 + Sprint 2 起 ────────────┴── Sprint 2 (i18n)
  W4  ── Sprint 2 续 ──────────────────────────────────────────── D+28 同步
  W5  ── 缓冲（spillover + Sprint 3 启动会）
  ```

---

## 8. 决策签字（启动会）

  - [ ] 范围确认：Sprint 0/1/2 是否全 GO，或砍哪些
  - [ ] Sprint 3 候选优先级（PM 决策）
  - [ ] 资源到位：FE 至少 3 人 / BE 至少 1 人 / DS 至少 1 人 / OnCall 1 人
  - [ ] 与 Round 5 主题边界：Round 4 不引入新业务功能；Round 5 起做新业务

---

## 9. 关联

  - 上游封盘：[round3-cutover-final-report.md](2026-04-20-platform-redesign/round3-cutover-final-report.md)
  - 上游主架构：[00-architecture.md](2026-04-20-platform-redesign/00-architecture.md)
  - 上游 cutover 流程：[04-cutover-and-migration.md](2026-04-20-platform-redesign/04-cutover-and-migration.md) §7
  - i18n ADR：[adr/003-i18n-tooling.md](../../adr/003-i18n-tooling.md)
  - 错误上报 ADR：[adr/002-frontend-error-reporting.md](../../adr/002-frontend-error-reporting.md)
  - 调度器 ADR：[adr/001-scheduled-query-runner.md](../../adr/001-scheduled-query-runner.md)
  - 冷藏 tag：`archive/ontology-object-aggregate-2026-04-14`（Sprint 1 R-001-OA 评估对象）

---

_本 plan 起草于 2026-04-21，对应 main HEAD `8a4457c`（Round 3 cutover merge commit）。_
