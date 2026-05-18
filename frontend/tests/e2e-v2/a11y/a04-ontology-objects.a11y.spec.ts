// frontend/tests/e2e-v2/a11y/a04-ontology-objects.a11y.spec.ts
//
// W5.C — A04 axe-core scan for `/semantic/ontology/objects`.
// Object list inside the ontology workbench layout.

import { test, expect } from '@playwright/test'
import {
  envelope,
  expectNoSeriousA11yViolations,
  gotoV2,
  installApiCatchAll,
  mockJsonRoute,
  prepareV2Page,
} from '../helpers'
import ontoFx from '../fixtures/ontology.json' with { type: 'json' }
import prefFx from '../fixtures/preferences.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/access/me/preferences', envelope(prefFx.default))
  await mockJsonRoute(page, '**/api/v1/ontology/objects', envelope(ontoFx.objects))
  await mockJsonRoute(page, '**/api/v1/ontology/objects/student', envelope(ontoFx.object_detail))
})

test('A04 本体业务对象列表 无严重 a11y 违规 @a11y', async ({ page }) => {
  await gotoV2(page, '/semantic/ontology/objects')

  await expect(page.getByText('学生').first()).toBeVisible()

  await expectNoSeriousA11yViolations(page)
})
