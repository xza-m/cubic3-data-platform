# Design Baseline — Round 2 Visual Contract

This folder contains fullPage screenshots of the `tmp/platform-redesign/` demo at **1440 × 900 px viewport**.
They serve as the **visual design contract** for Round 2 (W2-W5) frontend implementation.

## What This Is

Each PNG captures one route of the platform-redesign Vite demo — the authoritative reference for how every page should look when implemented in `frontend/src/v2/`.
Screenshots were taken with all API calls mocked to empty-success responses so pages render their layout/UI chrome rather than real data.

## Capture Details

| Field | Value |
|---|---|
| Captured | 2026-04-21 |
| Commit | `56a7773` (branch: `main`) |
| Source | `tmp/platform-redesign/` |
| Viewport | 1440 × 900 |
| Routes | 46 captured / 0 failed |
| Total size | ~4.7 MB |
| Script | `scripts/capture_demo_baseline.mjs` |

## Filename Convention

Filenames are derived from routes by replacing `/` with `__` and stripping the leading `__`:

  ```
  /data-center/datasources      → data-center__datasources.png
  /semantic/ontology/objects    → semantic__ontology__objects.png
  /semantic/cubes/demo_cube     → semantic__cubes__demo_cube.png
  ```

Parameterised seeds used: `:id=1`, `:name=demo_cube`, `:code=demo_app`.

## How to Regenerate

  ```bash
  # 1. Start the demo preview server
  cd tmp/platform-redesign
  npm install          # if node_modules is missing
  npm run build        # if dist/ is stale
  npx vite preview --port 3010 --host 127.0.0.1 &

  # 2. Run the capture script from repo root
  cd ../..
  node scripts/capture_demo_baseline.mjs

  # 3. Stop the server
  pkill -f "vite preview --port 3010"
  ```

Prerequisites: `frontend/node_modules/playwright` must be installed (it is, as part of the normal `frontend/` install).

## How W2-W5 Domain Agents Should Use This

1. **Before implementing a page** — open the corresponding PNG to understand the expected layout, components, spacing, and data patterns.
2. **During implementation** — use the PNG as a pixel reference for component arrangement, navigation state, and typographic hierarchy.
3. **During code review** — a reviewer should open the PNG alongside a browser screenshot of the v2 implementation and visually diff them. Key things to check:
   - Navigation sidebar active state matches the route
   - Page-level heading and breadcrumb are correct
   - Primary list / table / canvas occupies the right area
   - Detail panels / peek panels open on the correct side
   - Action buttons (Create, Edit, Delete) are positioned correctly
   - Loading/empty states follow the same pattern as the demo
4. **If a PNG looks empty (< 20 KB)** — the seed param didn't match a mocked entity. Use the page-level layout (shell, sidebar, top bar) as the reference and verify the detail area separately in the live demo.

## Index of All Baseline Images

| File | Route |
|---|---|
| `login.png` | `/login` |
| `dashboard.png` | `/dashboard` |
| `data-center__datasources.png` | `/data-center/datasources` |
| `data-center__datasources__1.png` | `/data-center/datasources/1` |
| `data-center__datasets.png` | `/data-center/datasets` |
| `data-center__datasets__1.png` | `/data-center/datasets/1` |
| `data-center__datasets__register.png` | `/data-center/datasets/register` |
| `data-center__datasets__register__table.png` | `/data-center/datasets/register/table` |
| `data-center__datasets__register__file.png` | `/data-center/datasets/register/file` |
| `extraction-tasks.png` | `/extraction-tasks` |
| `extraction-tasks__1.png` | `/extraction-tasks/1` |
| `extraction__config.png` | `/extraction/config` |
| `extraction__runs.png` | `/extraction/runs` |
| `extraction__runs__1.png` | `/extraction/runs/1` |
| `data-chat.png` | `/data-chat` |
| `queries.png` | `/queries` |
| `queries__visual.png` | `/queries/visual` |
| `queries__my.png` | `/queries/my` |
| `queries__my__1.png` | `/queries/my/1` |
| `queries__history.png` | `/queries/history` |
| `queries__history__1.png` | `/queries/history/1` |
| `queries__scheduled.png` | `/queries/scheduled` |
| `queries__scheduled__1.png` | `/queries/scheduled/1` |
| `apps.png` | `/apps` |
| `apps__demo_app.png` | `/apps/demo_app` |
| `executions.png` | `/executions` |
| `executions__1.png` | `/executions/1` |
| `config__channels.png` | `/config/channels` |
| `config__channels__1.png` | `/config/channels/1` |
| `config__subscriptions.png` | `/config/subscriptions` |
| `config__subscriptions__1.png` | `/config/subscriptions/1` |
| `semantic__ontology.png` | `/semantic/ontology` |
| `semantic__ontology__objects.png` | `/semantic/ontology/objects` |
| `semantic__ontology__objects__new.png` | `/semantic/ontology/objects/new` |
| `semantic__ontology__objects__demo_cube.png` | `/semantic/ontology/objects/demo_cube` |
| `semantic__ontology__metrics.png` | `/semantic/ontology/metrics` |
| `semantic__ontology__relations.png` | `/semantic/ontology/relations` |
| `semantic__ontology__governance.png` | `/semantic/ontology/governance` |
| `semantic__workbench.png` | `/semantic/workbench` |
| `semantic__cubes.png` | `/semantic/cubes` |
| `semantic__cubes__new.png` | `/semantic/cubes/new` |
| `semantic__cubes__demo_cube__edit.png` | `/semantic/cubes/demo_cube/edit` |
| `semantic__cubes__demo_cube.png` | `/semantic/cubes/demo_cube` |
| `semantic__domains.png` | `/semantic/domains` |
| `semantic__domains__1.png` | `/semantic/domains/1` |
| `semantic__views__demo_cube.png` | `/semantic/views/demo_cube` |
