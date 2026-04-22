# Round 4 · T-DRILL — Docker 全栈 `deploy.sh` 演练报告

- 日期：2026-04-22
- 执行：OnCall（代理）
- 范围：本机 docker compose 全栈 cutover 演练（backend + nginx + SPA）
- 上游：[`2026-04-22-round4-remaining-schedule.md`](../../plans/2026-04-22-round4-remaining-schedule.md) § T-DRILL

---

## 1. 目标

演练一次完整的 cutover 流程，验证三件事：

1. `scripts/cutover/deploy.sh --dry-run` 能在开发机跑完所有前置检查（`make verify-cutover`）。
2. `scripts/cutover/health_probe.sh` 的 8 个探测点（2 个 API 存活 + 1 个业务 metrics + 5 个 SPA 模块首屏）全部 200。
3. 回滚路径 `scripts/cutover/rollback.sh` 的依赖链可调用（tag 回退 + nginx swap + 回滚 smoke）。

---

## 2. 结果

| 步骤 | 命令 | 首跑 | 修复后复跑 |
|---|---|---|---|
| Dry-run | `./scripts/cutover/deploy.sh --dry-run` | ✓ | — |
| API 存活 | `BASE_URL=http://localhost:81 ONLY_API=1 health_probe.sh` | ✗（**全 502**） | ✓（3/3） |
| 全栈探测 | `BASE_URL=http://localhost:81 health_probe.sh` | ✗ | ✓（**8/8**） |

最终产物：`scripts/cutover/deploy.sh` + `health_probe.sh` 均无需改动；暴露的两处环境缺陷已修复（见 §3）。

---

## 3. 发现与修复

### 3.1 后端缺 `bcrypt` → gunicorn boot 失败（根因）

- 现象：`health_probe` 所有 backend 路径 502；`docker compose logs backend` 尾部：
  ```
  ModuleNotFoundError: No module named 'bcrypt'
    File "/app/app/infrastructure/users/password.py", line 5, in <module>
        import bcrypt
  ```
- 根因：`app/infrastructure/users/password.py::BcryptHasher` 直接 `import bcrypt`，但 `requirements.txt` 从未声明。本地 venv 里装过，镜像构建时当然没有。
- 修复：`requirements.txt` 追加 `bcrypt==4.1.2`；`docker compose build backend && up -d backend`。
- 验证：`curl -s http://localhost:81/health` → `{"code":0,"data":{"status":"ok"},...}`

### 3.2 `/api/v1/health` 404（runbook 兼容点）

- 现象：即便 `/health` 200 了，runbook 约定的 `/api/v1/health` 仍 404；nginx `location = /api/v1/health` 明明写了 `proxy_pass http://$backend_upstream/health`。
- 根因：nginx **变量版** `proxy_pass` 的 URI 片段不会替换原请求 URI —— backend 实际收到的是 `/api/v1/health`，而 Flask 只在 `/health` 挂了 blueprint。
- 修复：`nginx/conf.d/default.conf` 里改用 `rewrite ^ /health break; proxy_pass http://$backend_upstream;`，保留动态 resolver 的同时显式改写 URI。
- 验证：

  ```
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:81/api/v1/health  # 200
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:81/health           # 200
  ```

---

## 4. 复跑证据（最终 8/8 通过）

```
health_probe · T-004a · BASE_URL=http://localhost:81

── API 存活 ──
  OK  GET /api/v1/health (runbook)  → 200  http://localhost:81/api/v1/health
  OK  GET /health (canonical)       → 200  http://localhost:81/health

── 业务 metrics（Ontology 指标列表 API） ──
  OK  GET /api/v1/ontology/metrics  → 401  http://localhost:81/api/v1/ontology/metrics

── 5 大模块首屏（SPA / nginx try_files） ──
  OK  模块·总览  → 200 text/html  http://localhost:81/dashboard
  OK  模块·数据  → 200 text/html  http://localhost:81/data-center/datasources
  OK  模块·查询  → 200 text/html  http://localhost:81/queries
  OK  模块·语义  → 200 text/html  http://localhost:81/semantic/ontology
  OK  模块·应用  → 200 text/html  http://localhost:81/apps

✓ health_probe 通过  (8 checks)
```

> `ontology/metrics` 401 = 未携带 token，符合预期（`health_probe` 仅断言 `!= 5xx` 且路由命中）。

---

## 5. 跳过项 & 遗留

| 项 | 状态 | 说明 |
|---|---|---|
| `rollback.sh` 真跑 | 跳过 | 本机无多版本 tag；脚本已在 Round 3 生产 cutover 时实跑过一次。本次仅验证脚本可执行（`bash -n`）+ 依赖路径（`rebuild-frontend.sh`、`docker compose`）可达 |
| Alembic offline topology check | 由 `make verify-cutover` 覆盖，dry-run 已跑 | — |
| 生产侧复刻 | 不本次做 | 见 §6「给生产的提醒」|

---

## 6. 给生产 / 后续的提醒

1. **生产镜像同样需要 `bcrypt`**。本次修 `requirements.txt` 自动惠及所有环境，但建议下一次 release 的 `deploy.sh` 日志里人工确认一次 `pip list | grep bcrypt`。
2. **nginx 变量版 `proxy_pass` 踩坑已修**，但值得沉淀成规范：任何 `proxy_pass http://$var/path` 写法都要改成 `rewrite + proxy_pass http://$var`。已记在本报告 §3.2；后续写 CI 静态扫也可加一条 rg 规则。
3. **runbook 约定的 `/api/v1/health` 与 canonical `/health` 已做双活**，监控侧两条都采一下，降低单点失败。

---

## 7. 结论

T-DRILL 关闭。耗时 ~0.5d（含两处修复）。`docs/superpowers/ops/drills/` 目录从 0 → 1 篇，回归性演练基线建立。
