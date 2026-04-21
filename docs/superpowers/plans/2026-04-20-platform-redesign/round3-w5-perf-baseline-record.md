`# Round 3 · W5.D · 性能预算与 Lighthouse 基线 (2026-04-21)`

```markdown
# Round 3 · W5.D · 性能预算与 Lighthouse CI 基线

> 主线工作流·2026-04-21
> 配套：`docs/superpowers/plans/2026-04-20-platform-redesign/02-architecture.md`
> 上游：W4.A（cutover）· W4.B（CSS tokens）

## 1. 目标

| 维度 | 目标 |
| --- | --- |
| v2 bundle gzip 总量 | ≤ 350 KB（hard ceiling） |
| 单 chunk gzip | 见 `bundle_budget.py::BUDGETS` + 默认上限 30 KB |
| Lighthouse Performance | ≥ 0.80（error） |
| Lighthouse Accessibility | ≥ 0.90（error） |
| Lighthouse Best Practices | ≥ 0.85（warn） |
| Lighthouse SEO | ≥ 0.80（warn） |

## 2. 改动

### 2.1 `scripts/checks/bundle_budget.py`

收紧后的预算：

  ```python
  BUDGETS = {
    "index":         40_000,   # 实测 25 127 → 60% headroom
    "react-vendor":  90_000,   # 实测 77 483 → 15% headroom
    "query-vendor":  25_000,   # 实测 14 656 → 65% headroom
    "icons":         30_000,   # lucide-react manualChunks 桶
    "semantic":       5_000,   # 语义域 chunk header（保留）
  }
  PER_CHUNK_DEFAULT_CAP = 30_000   # 未列入 BUDGETS 的 chunk 兜底
  TOTAL_BUDGET = 350_000
  ```

实测（2026-04-21）：

  ```text
  total gzip = 281 331 / 350 000  (80% utilization)
  index        25 127 / 40 000   PASS
  query-vendor 14 656 / 25 000   PASS
  react-vendor 77 483 / 90 000   PASS
  ```

### 2.2 `lighthouserc.json`

- 通过 `vite preview` 在 `:4173` 启动静态托管（SPA fallback 内置）。
- 5 条关键 URL：`/`、`/data-center/datasources`、`/semantic/cubes`、
  `/semantic/ontology/objects`、`/settings`。
- `numberOfRuns: 1`（CI 速度优先；本地基线扫可改 3 取中位数）。
- 预设 `desktop`，跳过 HTTP/2、HTTPS 等部署相关审计。
- `categories:performance` & `categories:accessibility` 设为 `error`，其余 `warn`。
- 单独关闭：`color-contrast`（移交 W5.F 视觉基线刷新统一处理）、
  `errors-in-console`（mock 后端缺位时会打 404 噪音）、`csp-xss`（部署层负责）。
- 产物输出 `./.lighthouseci/`（CI artifact 上传）。

### 2.3 `frontend/package.json`

新增脚本（不引入新 devDep；用 `npx --yes @lhci/cli@0.15.x` 即时拉取）：

  ```json
  "perf:lhci":        "npm run build:v2 && cd .. && npx --yes @lhci/cli@0.15.x autorun --config=lighthouserc.json",
  "perf:lhci:assert": "cd .. && npx --yes @lhci/cli@0.15.x assert --config=lighthouserc.json"
  ```

### 2.4 CI workflow（W5 集成阶段统一合入）

> 本节由 W5 主线集成阶段统一合并到 `.github/workflows/frontend-ci.yml`，
> 与 W5.A（unit-coverage）、W5.C（e2e-v2-a11y）等并发 sub-agent 的改动一起整合，
> 避免本阶段单独写入造成多 PR 冲突。

预定 job：

  ```yaml
  perf-lhci:
    name: perf-lhci (lighthouse-ci · v2)
    needs: v2-build
    runs-on: ubuntu-latest
    timeout-minutes: 12
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
        working-directory: frontend
      - name: Build v2 with auth bypass
        run: npx vite build --config v2.vite.config.ts --emptyOutDir
        working-directory: frontend
        env:
          VITE_AUTH_BYPASS: "1"
      - name: Run Lighthouse CI
        run: npx --yes @lhci/cli@0.15.x autorun --config=lighthouserc.json
      - name: Upload Lighthouse report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: lighthouseci
          path: ./.lighthouseci
          retention-days: 14
  ```

## 3. 验证

  ```bash
  cd frontend
  npx vite build --config v2.vite.config.ts --emptyOutDir
  cd ..
  python scripts/checks/bundle_budget.py        # exit 0
  ```

输出已记录在 §2.1。

Lighthouse 本地烟测（首次基线，主线在 W5 集成前手动跑一次保留 baseline 报告）：

  ```bash
  cd frontend
  VITE_AUTH_BYPASS=1 npm run perf:lhci
  ```

## 4. 跟踪 / 后续

- W5.F 视觉基线刷新阶段重新打开 `color-contrast` 审计。
- 后端 mock：当前 lhci 跑空后端，performance 受 API 404 影响约 2 分。
  W6 之前需评估是否在 lhci 阶段加 stubby（或用 Playwright fixture 同源 mock）。
- `numberOfRuns: 1` 在 CI 中可能波动 ±5 分；如基线频繁触线，调到 3 + median。
- `bundle_budget.py` 的 `PER_CHUNK_DEFAULT_CAP=30_000` 防止隐式新 chunk 偷逃；
  新增页面如有大依赖（如 Monaco/ECharts），需先在 `BUDGETS` 显式登记。
```
