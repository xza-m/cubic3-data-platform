# Quick Task 260701-gnt: 修复 P0(SQL-registry/YAML 断层) + 4 个 P1 — Summary

**Date:** 2026-07-01
**Status:** Complete

## 完成情况

| 项 | 状态 | Commit |
|---|---|---|
| P0：SQL-registry 发布链路与 YAML cube 仓储断层 | ✅ 已修复 + 真实端到端验证 | `b71f6079`（代码）+ `12471230`（发布证据） |
| P1-1：`_upsert_sql_registry_asset` 并发竞态 | ✅ 已修复 | `b71f6079`（与 P0 同批，两文件互不冲突） |
| P1-2：`deploy.sh` 健康检查探测端口错误 | ✅ 已修复 | `f0f0395c` |
| P1-3：README 补 CLI/skill 入口简介 | ✅ 已完成 | `4afb2bc7` |
| P1-4：清理"GitLab CI 未就位"过时措辞 | ✅ 已完成 | `4afb2bc7` |

## P0 端到端验证证据

用全新测试表 `dws_study_task_teacher_assign_scene_window_di`（source_id=1, database=df_cb_258187），
真实执行 `python -m app.interfaces.cli cube onboard --publish --yes`（经用户显式"授权发布"）：

1. **`cube list` 可见**：修复前，通过标准 proposal 发布链路发布的 cube 完全不出现在 `cube list`
   （此前 5 张 DWS 试点表即卡在这里——Postgres 治理表显示"已发布"，但 `cube list` 里 0 个）；
   修复后，`cube list` 输出里能找到 `dws_study_task_teacher_assign_scene_window_di`。
2. **YAML 仓储文件确实生成**：`app/infrastructure/semantic/cubes/dws_study_task_teacher_assign_scene_window_di.yml`
   在宿主机与容器内均存在（此前完全不存在，连草稿痕迹都没有）。
3. **intent answerability 从不可答变为可答**：
   ```
   intent answerability "各场景老师布置任务的老师数是多少" --runtime-mode official
   → {"answerability": {"state": "answerable", ...}, "route_type": "cube"}
   ```
4. 发布产出 8 个业务指标、0 blocker、0 ratio（该表无歧义分母场景）。

## 根因与修复方案（未偏离原计划）

`ModelingProposalService._apply_to_sql_registry` / `_publish_from_sql_registry` 原先只写
`semantic_assets`/`semantic_asset_revisions`/`semantic_releases` 等 Postgres 治理表，从未调用
`self._builder.apply(spec)` / `self._builder.publish(spec, ...)`——而真正被
`SemanticDefinitionService.list_cubes()` 读取的是 YAML 仓储（`ICubeRepository`）。两条治理轨道
互不相通，导致"发布成功但问数看不到、答不了"的分裂态。修复：在两个方法内追加调用
`self._builder.apply/publish`，复用既有 `cube_modeling_service.create_cube/activate_cube ->
cube_repo.save` 逻辑，不重新发明构造过程；`builder.publish` 异常正常向上抛出、不吞掉，避免
SQL registry release 已提交但 YAML 未写成功的静默分裂态。

`create_or_update_asset` 并发竞态修复：复用既有 `_lock_release_namespace` 的
`pg_advisory_xact_lock` 模式，新增 `_lock_asset_key`（不同 lock_key 前缀避免与 release 锁共享），
insert 分支 try/except `IntegrityError` 后回滚重试为 update 合并。

## 偏离原计划的实现细节

**Executor worktree 环境问题（已处理，不影响最终交付）**：本任务最初通过 `isolation="worktree"`
派生的 gsd-executor 子agent，其隔离 worktree 的 base commit 意外落在 `origin/main`（2026-06-17，
落后当前 `feat/intent-understanding-layer` 分支 142 个 commit），而非当前分支 HEAD。该 executor
在排查此问题过程中，其某个操作副作用把主仓库工作目录（非 worktree）里 63 个已提交文件的内容
覆盖成了旧版本（净变化 416 行新增/4567 行删除，包含整个 `app/interfaces/cli/` 等本轮会话核心
产出），所幸只影响未提交的工作区、git 历史零丢失。用户确认后，通过显式列出 63 个受影响路径的
`git checkout HEAD -- <paths>`（而非笼统的 `.`）完成安全恢复。随后由协调者直接在正确的当前
HEAD 上手工重新应用 executor 已经设计正确的 P0/P1-1 修复内容（对照 worktree 内提交 `ecc24ad5`
的 diff 逐处复核落地，非重新设计），并补跑全套测试确认零回归后提交。**P1-2/P1-3/P1-4 未受此
问题影响，按原计划正常执行。**

**P1-2 顺带发现并一并修复**：`README.md`/`docs/QUICK_START.md`/`docs/STARTUP_GUIDE.md` 里
Docker 模式"访问入口"章节同样引用了宿主机不可达的 `localhost:5000`（与 `deploy.sh` 同根因），
一并修正为 nginx 反代的 `:81`；本地开发模式（`flask run` 直跑）里的 `localhost:5000` 引用是
合法的，未改动。

**未修（已知、超出本任务范围）**：`docs/STARTUP_GUIDE.md` 模式 C（Docker 后端 + 本地前端）与
`docs/runbooks/local-dev.md` 同款混合模式，文档描述的 `docker compose up -d backend ... +
VITE_API_PROXY_TARGET=http://localhost:5000` 工作流按现状 compose 配置实际无法连通（同一根因，
但需要新增 `ports:` 映射或改写整个工作流描述，判断为超出"deploy 端口问题"原始请求范围），
已单独告知用户，留待后续单独处理。

## 测试证据

- 定向：`tests/unit/application/semantic/test_modeling_proposal_service.py` +
  `tests/unit/infrastructure/semantic/test_sql_asset_registry_repository.py` — 43 passed, 1 skipped
  （跳过项为需要真实 `DATABASE_URL` 的 Postgres 并发验证，非本地默认跑）。
- 语义+基础设施回归：`tests/unit/application/semantic tests/unit/infrastructure/semantic` — 597 passed, 1 skipped。
- 广义回归：`tests/unit -k "semantic or modeling or cube"` — 895 passed, 1 skipped。
- `make verify-docs` — 通过（236 个 Markdown 文件健康检查 + ADR-012 事实源口径守护）。
- 额外核实（超出计划要求的更广泛回归）：`tests/unit tests/integration/semantic` 发现 77 个
  与本任务完全无关的预置失败（`test_sql_generator.py`/`test_jobs.py`，报错均为
  `RuntimeError: Working outside of application context`，与 modeling_proposal_service /
  sql_asset_registry_repository / deploy.sh / README 均无引用关系，在单独运行时同样失败，
  判定为该测试文件既有的、与本次改动无因果关系的环境/fixture 隔离问题，未修复，仅记录供后续排查。
