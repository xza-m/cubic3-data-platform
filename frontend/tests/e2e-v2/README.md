<!-- frontend/tests/e2e-v2/README.md -->

# v2 (Platform Redesign) E2E — Playwright

Happy-path Playwright suite covering the redesign rollout's P1~P22 user
journeys. Runs against the **v2 dev server** (port 3001) launched by Vite.

## How to run locally

```bash
cd frontend

npm run test:e2e:v2          # run all 22 specs
npm run test:e2e:v2:smoke    # Day 0 minimal smoke set (P1, P2, P3, P7, P21)
```

Filter by tag:

```bash
npx playwright test --config tests/e2e-v2/playwright.config.ts --grep '@p20'
```

Open the HTML report:

```bash
npx playwright show-report playwright-report-v2
```

## How to update snapshots

Visual regression is **out of scope** for W4.C — that lives under W5.F. No
baseline screenshots are checked in. If you need a one-off screenshot for
debugging, use `await page.screenshot({ path: '...' })` inside the spec but do
not commit the asset.

## Tag conventions

Each spec carries a single `@pNN` tag in its title:

- `@p01` … `@p22` — one tag per P-id from
  `docs/superpowers/plans/2026-04-20-platform-redesign/01-frontend-workstream.md` §3
- Combine with `--grep` for ad-hoc subsets, e.g. `--grep '@p07|@p11'`

## Fixture conventions

- `fixtures/*.json` — one file per backend domain. Each file exports the
  canonical mock payload(s) every spec in that domain reuses (list, detail,
  test result, etc.).
- Specs import fixtures via `import x from './fixtures/foo.json' assert
  { type: 'json' }` — TypeScript's JSON module imports.
- Wrap responses in the standard envelope (`{ code: 0, message: 'ok',
  data: ... }`) using the `envelope()` helper from `helpers.ts`.
- Always call `installApiCatchAll(page)` **before** registering specific
  routes. Playwright runs route handlers in LIFO order, so specifics added
  later take precedence and the catch-all only fires for unmocked URLs.

## VITE_AUTH_BYPASS dependency

The `webServer` entry in `playwright.config.ts` launches the v2 dev server
with `VITE_AUTH_BYPASS=1`. This makes
`frontend/src/v2/pages/ProtectedRoute.tsx` render the protected outlet
unconditionally, so specs do not need to drive a real login flow.

As a belt-and-braces measure, `prepareV2Page()` also plants
`sessionStorage.v2.access_token` so the bypass flag is not strictly
required if you want to point this suite at a different server.

## Adding a new spec

1. Pick the next `@pNN` tag (or reuse one for an additional scenario).
2. Create `pNN-short-name.spec.ts` at this directory's root.
3. Use `prepareV2Page` + `installApiCatchAll` in `test.beforeEach`.
4. Mock all `/api/v1/**` calls the page makes via `page.route` /
   `mockJsonRoute`.
5. Assert at least 2 visible signs of success — visible element + URL,
   toast text, etc.
6. Title in Chinese for readability with the `@pNN` tag at the end.

## CI

Workflow `.github/workflows/frontend-ci.yml` runs the suite as the
`e2e-v2` job, triggered after `v2-build` succeeds. On failure the HTML
report uploads as the `playwright-report-v2` artifact.
