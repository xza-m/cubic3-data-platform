<!-- docs/superpowers/plans/2026-04-20-platform-redesign/round3-w5-visual-baseline-record.md -->

# Round 3 · W5.F — v2 Visual Baseline Record

**Date:** 2026-04-21
**Owner:** Platform redesign — Round 3 cutover (W5.F)
**Suite:** `frontend/tests/e2e-v2/visual/v2-visual.spec.ts`
**Snapshot store:** `frontend/tests/e2e-v2/visual/v2-visual.spec.ts-snapshots/`

## Why we replaced the legacy visual specs

The previous baselines lived under `frontend/tests/e2e-node/`:

  - `platform.visual.spec.ts` (+ `*-snapshots/`)
  - `semantic.visual.spec.ts` (+ `*-snapshots/`)

Those specs were authored against the **pre-redesign UI**. After the v2
cutover they no longer reflect what users see:

  - The login page (`欢迎回来`) was replaced by the v2 auth bypass and a
    different shell. The route `/login` now renders the new `AuthBypass`
    container, not the legacy form, so the heading assertions fail.
  - The dashboard heading changed from `欢迎回来, …` to
    `语义优先的数据工作台`, and the surrounding markup is entirely
    different (KPI cards, health bars, quick links).
  - Semantic routes such as `/semantic/workbench` and the original
    `/semantic/domains/:id` canvas were either renamed or rebuilt around
    the new `Cube` / `Ontology Workbench` IA.
  - Selectors like `getByTestId('semantic-workbench-title')` no longer
    exist; the v2 components either drop those test ids or render them
    differently.

The right move is **replace, not fix**: the legacy snapshots are now
deleted (both spec files and their `*-snapshots/` directories) and the
single canonical visual suite is the v2-native one below.

## New baseline — V01..V05

All 5 specs live in a single file
(`frontend/tests/e2e-v2/visual/v2-visual.spec.ts`) and run under the
existing v2 Playwright project (`tests/e2e-v2/playwright.config.ts`,
chromium / 1440×900 / `Asia/Shanghai` / `zh-CN`). Each test is tagged
`@visual`, freezes `Date` for deterministic relative timestamps, and
mocks every `/api/v1/**` call via the suite's `installApiCatchAll` +
`mockJsonRoute` helpers.

  | ID  | Route                          | Coverage                                                                        | Notes                                                                                  |
  | --- | ------------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
  | V01 | `/dashboard`                   | First-impression heading + KPI cards + recent-queries table + health-bar trio.  | Mocks `GET /api/v1/dashboard/overview` (returns `res.data` directly — not enveloped).  |
  | V02 | `/data-center/datasources`     | Datasource list page (search bar, filter chip, table with status/type columns). | Mocks `data-center/datasources?**`, `…/types`, `…/1`. Shows a single PostgreSQL row.   |
  | V03 | `/semantic/cubes`              | Pipeline Hero + grid view of Cube cards (active / draft / review states).       | Mocks `semantic/cubes**`. 3 cubes ensure all status chips render.                      |
  | V04 | `/semantic/ontology/objects`   | Ontology workbench layout (sub-nav) + business object list (`student`, `lesson`).| Mocks `ontology/objects` and `ontology/objects/student`.                              |
  | V05 | `/settings`                    | User preference form (theme segmented control, default landing, page size, density).| Mocks `users/me/preferences` returning `prefFx.default`.                          |

> The login screen is intentionally not covered: v2 uses
> `VITE_AUTH_BYPASS=1` in the test webServer, so the protected-route
> guard short-circuits. There is no "login screen" surface for end users
> in this build.

## How to refresh

When the UI legitimately changes (token tweak, layout change, copy update),
regenerate the PNGs:

```bash
cd frontend
npx playwright test --config tests/e2e-v2/playwright.config.ts visual --update-snapshots
```

Then re-run without `--update-snapshots` to confirm the new baselines are
stable:

```bash
cd frontend
npx playwright test --config tests/e2e-v2/playwright.config.ts visual
```

Commit the regenerated `.png` files alongside the code change that caused
the diff. Snapshots are version-controlled — they must NOT be added to
`.gitignore`.

## How to inspect a failing diff

When a CI run fails on `toHaveScreenshot`, Playwright writes three images
into the test output directory (`frontend/test-results/<test>/`):

  - `*-actual.png` — what the page rendered this run
  - `*-expected.png` — the committed baseline
  - `*-diff.png` — pixel-level red mask of the differences

Two convenient ways to view them:

  1.  **HTML report.** The v2 config writes to `playwright-report-v2/`:

      ```bash
      cd frontend
      npx playwright show-report playwright-report-v2
      ```

      Failing visual tests have an "Image diff" tab with side-by-side and
      slider views.

  2.  **Direct file open.** From the terminal:

      ```bash
      open frontend/test-results/<sanitized-test-name>/*-diff.png
      ```

If the diff is intentional (design update), regenerate with
`--update-snapshots`. If it is a regression, fix the UI / token / mock
that introduced the drift.

## Determinism guarantees

  - **Time:** `freezeClock(page, '2026-04-21T10:00:00+08:00')` patches
    `window.Date` so any `fmtRelative(updated_at)` (Cube list) renders a
    fixed phrase like `6 天前` instead of "just now / today".
  - **Theme:** `prepareV2Page` forces `localStorage['v2.theme'] = 'light'`
    and strips any persisted `dark` class.
  - **Locale / timezone:** Pinned by the v2 Playwright config to
    `zh-CN` + `Asia/Shanghai`.
  - **Animations:** `animations: 'disabled'` is passed on every
    `toHaveScreenshot` call (defence-in-depth in case the global default
    is ever changed).
  - **Caret:** `caret: 'hide'` removes the blinking caret in any focused
    `<input>` from the snapshot.

## Tolerances

Each shot uses `maxDiffPixels: 220`. This absorbs sub-pixel anti-aliasing
noise from font rendering on different macOS micro-versions while still
flagging real visual regressions (icon swaps, color tweaks, layout
shifts). Increase only if a stable platform diff is verified — never
blanket-bump to silence a real regression.

## File inventory

  Created:

    - `frontend/tests/e2e-v2/visual/v2-visual.spec.ts`
    - `frontend/tests/e2e-v2/visual/v2-visual.spec.ts-snapshots/v01-dashboard-chromium-darwin.png`
    - `frontend/tests/e2e-v2/visual/v2-visual.spec.ts-snapshots/v02-datasources-chromium-darwin.png`
    - `frontend/tests/e2e-v2/visual/v2-visual.spec.ts-snapshots/v03-semantic-cubes-chromium-darwin.png`
    - `frontend/tests/e2e-v2/visual/v2-visual.spec.ts-snapshots/v04-ontology-objects-chromium-darwin.png`
    - `frontend/tests/e2e-v2/visual/v2-visual.spec.ts-snapshots/v05-settings-chromium-darwin.png`

  Deleted:

    - `frontend/tests/e2e-node/platform.visual.spec.ts`
    - `frontend/tests/e2e-node/platform.visual.spec.ts-snapshots/` (2 PNGs)
    - `frontend/tests/e2e-node/semantic.visual.spec.ts`
    - `frontend/tests/e2e-node/semantic.visual.spec.ts-snapshots/` (6 PNGs)
