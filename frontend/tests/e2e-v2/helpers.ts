// frontend/tests/e2e-v2/helpers.ts
//
// Shared helpers for v2 (redesign) Playwright specs.
//
// Conventions:
// - All specs MUST call `prepareV2Page` in `test.beforeEach` before any
//   navigation. It plants the v2 access token in sessionStorage (so even if
//   VITE_AUTH_BYPASS is missing the ProtectedRoute is satisfied) and forces
//   light theme + Asia/Shanghai timezone for snapshot stability.
// - All `/api/v1/**` calls MUST be mocked via `mockJsonRoute` or raw
//   `page.route`. We never depend on a live backend in this suite.
// - `gotoV2(page, path)` is a thin wrapper over `page.goto` that uses
//   `domcontentloaded` to keep tests fast.

import { expect, type Page, type Route } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const ACCESS_TOKEN = 'v2-e2e-token'

export async function prepareV2Page(page: Page): Promise<void> {
  await page.addInitScript((token: string) => {
    try {
      window.sessionStorage.setItem('v2.access_token', token)
    } catch {
      // ignore storage failures (e.g. sandboxed contexts)
    }
    // Force light theme + remove any persisted dark class so tests are
    // visually deterministic regardless of OS preference.
    try {
      window.localStorage.setItem('v2.theme', 'light')
      const root = document.documentElement
      if (root && root.classList) {
        root.classList.remove('dark')
        root.setAttribute('data-theme', 'light')
      }
    } catch {
      // ignore
    }
  }, ACCESS_TOKEN)
}

/**
 * Mock a JSON route. Matches against substring or regex via Playwright's
 * `page.route` URL matcher.
 */
export async function mockJsonRoute(
  page: Page,
  urlPattern: string | RegExp,
  payload: unknown,
  init?: { status?: number },
): Promise<void> {
  await page.route(urlPattern, async (route: Route) => {
    await route.fulfill({
      status: init?.status ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    })
  })
}

/**
 * Wrap a payload in the standard envelope the v2 backend uses.
 * Most v2 hooks read `response.data.data`, but a few read `response.data`
 * directly. We default to the enveloped shape and let callers opt-out.
 */
export function envelope<T>(data: T): { code: number; message: string; data: T } {
  return { code: 0, message: 'ok', data }
}

/**
 * Default catch-all for unmocked /api/v1/** GETs so an accidental network call
 * doesn't fail with ECONNREFUSED noise — it returns an empty success envelope.
 * Playwright gives newer matching route handlers priority, so specs generally
 * install this catch-all before registering specific route mocks.
 */
export async function installApiCatchAll(page: Page): Promise<void> {
  await page.route('**/api/v1/**', async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'ok', data: { items: [], total: 0, page: 1, page_size: 20 } }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: {} }),
    })
  })
}

export async function gotoV2(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
}

// ── Accessibility helpers (W5.C) ─────────────────────────────────────────────
//
// Thin wrapper around `@axe-core/playwright` so a11y specs stay declarative.
// The helper is intentionally non-throwing — the caller decides whether the
// scan result is a hard failure (CI gate) or a soft warning (exploratory).
//
// Default tag set targets WCAG 2.0/2.1 levels A and AA, which is the bar the
// Cubic³ design system commits to (see docs/round3/W5/a11y-policy.md).

export interface AxeViolationNode {
  html: string
  target: string[]
  failureSummary?: string
}

export interface AxeViolation {
  id: string
  impact?: 'minor' | 'moderate' | 'serious' | 'critical' | null
  description: string
  help: string
  helpUrl: string
  nodes: AxeViolationNode[]
}

export interface AxeScanOptions {
  /** CSS selectors to restrict the scan to (e.g. `['[role="dialog"]']`). */
  include?: string[] | string
  /** CSS selectors to exclude from the scan. */
  exclude?: string[] | string
  /** Override the default WCAG tag set. */
  tags?: string[]
  /** Rule IDs to disable (e.g. `['color-contrast']` while a token refresh lands). */
  disableRules?: string[]
}

const DEFAULT_AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const

function normalizeSelector(value: string[] | string | undefined): string[] | null {
  if (value == null) return null
  if (typeof value === 'string') return [value]
  return value.length > 0 ? value : null
}

/**
 * Run axe-core against the current page and return the violations whose
 * impact is `serious` or `critical`. Does NOT throw — the caller chooses
 * how to react. Use {@link expectNoSeriousA11yViolations} when you want a
 * hard CI gate.
 */
export async function axeScan(
  page: Page,
  opts: AxeScanOptions = {},
): Promise<AxeViolation[]> {
  let builder = new AxeBuilder({ page }).withTags([...(opts.tags ?? DEFAULT_AXE_TAGS)])

  const include = normalizeSelector(opts.include)
  if (include) {
    for (const sel of include) {
      builder = builder.include(sel)
    }
  }
  const exclude = normalizeSelector(opts.exclude)
  if (exclude) {
    for (const sel of exclude) {
      builder = builder.exclude(sel)
    }
  }
  if (opts.disableRules && opts.disableRules.length > 0) {
    builder = builder.disableRules(opts.disableRules)
  }

  const result = await builder.analyze()
  return result.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  ) as AxeViolation[]
}

function formatViolations(violations: AxeViolation[]): string {
  if (violations.length === 0) return '(none)'
  return violations
    .map((v) => {
      const targets = v.nodes
        .slice(0, 5)
        .map((n) => `      • ${n.target.join(' >> ')}`)
        .join('\n')
      const more = v.nodes.length > 5 ? `\n      • …(+${v.nodes.length - 5} more)` : ''
      return `  ✗ [${v.impact}] ${v.id} — ${v.help}\n    ${v.helpUrl}\n    ${v.nodes.length} node(s):\n${targets}${more}`
    })
    .join('\n')
}

/**
 * Hard assertion: throws (with a readable diff) if any serious/critical
 * accessibility violation is detected.
 */
export async function expectNoSeriousA11yViolations(
  page: Page,
  opts: AxeScanOptions = {},
): Promise<void> {
  const violations = await axeScan(page, opts)
  expect(
    violations,
    `Found ${violations.length} serious/critical a11y violation(s):\n${formatViolations(violations)}`,
  ).toEqual([])
}
