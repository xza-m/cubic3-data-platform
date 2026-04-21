// frontend/tests/e2e-v2/p04-ontology-object-validation.spec.ts
//
// P4 — 本体对象编辑 Tab 输入非法字段类型 → 内联校验报错 happy path.
//
// FIXME(W4.C): the ontology object edit Tab inline validation copy is
// being finalized in W3.B (object aggregate plan). Once selectors stabilize,
// replace the placeholder assertion below with a direct check on the
// validation error text/icon.

import { test, expect } from '@playwright/test'
import { gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page, envelope } from './helpers'
import ontFx from './fixtures/ontology.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/semantic/ontology/objects?**', envelope(ontFx.objects))
  await mockJsonRoute(page, '**/api/v1/semantic/ontology/objects/student', envelope(ontFx.object_detail))
})

// FIXME(W5.G-blocked): ObjectDetail has no in-page edit tab. The "编辑"
//   button navigates to `/semantic/ontology/objects/:name/edit`, which is
//   not registered in `frontend/src/v2/routes.tsx`. Inline field-type
//   validation cannot be exercised until that editor route ships.
test.fixme('P04 本体对象 编辑Tab 字段类型校验报错 @p04', async ({ page }) => {
  await gotoV2(page, '/semantic/ontology/objects/student')
  await expect(page.getByText('student').first()).toBeVisible()
})
