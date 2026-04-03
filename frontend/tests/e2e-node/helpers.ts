import { expect, type Page } from '@playwright/test'

const AUTH_TOKEN = process.env.DOMAIN_SMOKE_AUTH_TOKEN ?? 'playwright-smoke-token'
const BASE_URL = process.env.DOMAIN_SMOKE_BASE_URL ?? 'http://127.0.0.1:3100'

export function uniqueName(prefix: string) {
  return `${prefix} ${Date.now()}`
}

export async function prepareAuthenticatedPage(page: Page) {
  await page.addInitScript((token: string) => {
    window.localStorage.setItem('auth_token', token)
  }, AUTH_TOKEN)
}

export async function gotoSemantic(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
}

async function apiRequest<T>(
  page: Page,
  path: string,
  options?: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    data?: unknown
  },
): Promise<T> {
  const response = await page.request.fetch(new URL(path, BASE_URL).toString(), {
    method: options?.method || 'GET',
    data: options?.data,
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
  })

  const payload = await response.json()
  if (!response.ok()) {
    const message = payload?.message || payload?.error || response.statusText()
    throw new Error(`请求 ${path} 失败: ${message}`)
  }
  return payload as T
}

async function findCatalogCodeByName(page: Page, catalogName: string) {
  const payload = await apiRequest<{
    data?: {
      catalogs?: Array<{ code: string; name: string }>
    }
  }>(page, '/api/v1/semantic/catalogs')

  const catalog = payload.data?.catalogs?.find((item) => item.name === catalogName)
  if (!catalog) {
    throw new Error(`未找到目录: ${catalogName}`)
  }
  return catalog.code
}

async function findFirstActiveDatasourceId(page: Page) {
  const payload = await apiRequest<{
    data?: {
      items?: Array<{ id: number; is_active?: boolean }>
    }
  }>(page, '/api/v1/data-center/datasources?is_active=true&page_size=20')

  const datasource = payload.data?.items?.find((item) => item.is_active !== false) ?? payload.data?.items?.[0]
  if (!datasource?.id) {
    throw new Error('未找到可用数据源，无法为 E2E 自动准备 Cube')
  }
  return datasource.id
}

function extractCubeNameFromHref(href: string | null) {
  if (!href) return null
  const pathname = new URL(href, BASE_URL).pathname
  const segments = pathname.split('/').filter(Boolean)
  return segments[segments.length - 1] || null
}

export async function getFirstCubeNameFromManagement(page: Page) {
  const firstEditLink = page.locator('a[href^="/semantic/cubes/"]').filter({ hasText: '编辑' }).first()
  await firstEditLink.waitFor({ state: 'visible', timeout: 10_000 })
  const href = await firstEditLink.getAttribute('href')
  const cubeName = extractCubeNameFromHref(href)
  if (!cubeName) {
    throw new Error('无法从 Cube 管理页解析 Cube 名称')
  }
  return cubeName
}

function sanitizeSchemaNodeName(name: string) {
  return name.trim().replace(/[^a-zA-Z0-9_-]+/g, '_')
}

export async function selectFirstSchemaTable(page: Page) {
  await expect(page.getByRole('heading', { name: '语义工作台' })).toBeVisible()
  await expect(page.getByTestId('cube-generate-draft')).toBeVisible()

  const tableLocator = page.locator('[data-testid^="schema-node-table-"]:visible')
  const schemaLocator = page.locator('[data-testid^="schema-node-schema-"]:visible')
  const databaseLocator = page.locator('[data-testid^="schema-node-database-"]:visible')
  const collectVisibleNodeNames = async (locator: ReturnType<Page['locator']>) => {
    const names = await locator.allTextContents()
    return [...new Set(names.map((name) => name.trim()).filter(Boolean))]
  }
  const waitForTableNodes = async (timeout = 4_000) => {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      if ((await tableLocator.count()) > 0) {
        return true
      }
      await page.waitForTimeout(250)
    }
    return (await tableLocator.count()) > 0
  }

  await Promise.race([
    tableLocator.first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => null),
    schemaLocator.first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => null),
    databaseLocator.first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => null),
  ])

  if ((await tableLocator.count()) === 0) {
    await waitForTableNodes()
  }

  if ((await tableLocator.count()) === 0) {
    const databaseNames = await collectVisibleNodeNames(databaseLocator)
    for (let databaseIndex = databaseNames.length - 1; databaseIndex >= 0; databaseIndex -= 1) {
      await page
        .getByTestId(`schema-node-database-${sanitizeSchemaNodeName(databaseNames[databaseIndex])}`)
        .last()
        .click({ force: true })
      if (await waitForTableNodes()) {
        break
      }

      const schemaNames = await collectVisibleNodeNames(schemaLocator)
      for (let schemaIndex = schemaNames.length - 1; schemaIndex >= 0; schemaIndex -= 1) {
        await page
          .getByTestId(`schema-node-schema-${sanitizeSchemaNodeName(schemaNames[schemaIndex])}`)
          .last()
          .click({ force: true })
        if (await waitForTableNodes()) {
          break
        }
      }

      if ((await tableLocator.count()) > 0) {
        break
      }
    }
  }

  if ((await tableLocator.count()) === 0) {
    throw new Error('未找到可选的物理表，当前数据源下没有可见表节点')
  }

  await tableLocator.first().waitFor({ state: 'visible', timeout: 15_000 })
  await tableLocator.first().click({ force: true })
}

export async function createDomainViaUi(page: Page, domainName: string, catalogName?: string) {
  const catalogCode = catalogName ? await findCatalogCodeByName(page, catalogName) : 'default'
  const payload = await apiRequest<{
    data?: {
      id?: string
      code?: string
      name?: string
    }
  }>(page, '/api/v1/semantic/domains', {
    method: 'POST',
    data: {
      name: domainName,
      catalog_code: catalogCode,
    },
  })

  const domainId = payload.data?.id || payload.data?.code
  if (!domainId) {
    throw new Error('创建领域成功，但响应中缺少领域标识')
  }

  await gotoSemantic(page, `/semantic/domains/${domainId}`)
  await expect(page.getByTestId('domain-canvas-page')).toBeVisible()
}

export async function dragLibraryCubeToCanvas(page: Page, index = 0) {
  const cube = page.locator('[data-testid^="domain-library-cube-"]').nth(index)
  const surface = page.getByTestId('domain-canvas-surface')
  await cube.waitFor({ state: 'visible', timeout: 10_000 })
  await surface.waitFor({ state: 'visible', timeout: 10_000 })
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer())
  await cube.dispatchEvent('dragstart', { dataTransfer })
  await surface.dispatchEvent('dragover', { dataTransfer })
  await surface.dispatchEvent('drop', { dataTransfer })
}

export async function createCatalogViaUi(page: Page, catalogName: string, catalogCode: string) {
  await apiRequest(page, '/api/v1/semantic/catalogs', {
    method: 'POST',
    data: {
      name: catalogName,
      code: catalogCode,
    },
  })
}

export async function ensureCubeAvailable(page: Page) {
  await gotoSemantic(page, '/semantic/cubes')
  await expect(page.getByRole('heading', { name: 'Cube 管理' })).toBeVisible()

  const firstEditLink = page.locator('a[href^="/semantic/cubes/"]').filter({ hasText: '编辑' }).first()
  const emptyState = page.getByText('没有命中当前条件的 Cube', { exact: false })
  await Promise.race([
    firstEditLink.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => null),
    emptyState.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => null),
  ])

  if (await firstEditLink.count()) {
    return
  }

  const datasourceId = await findFirstActiveDatasourceId(page)
  const cubeName = `playwright_cube_${Date.now()}`
  const cubeTitle = uniqueName('Playwright Cube 草稿')

  await apiRequest(page, '/api/v1/semantic/cubes', {
    method: 'POST',
    data: {
      name: cubeName,
      title: cubeTitle,
      table: 'playwright.orders',
      source_id: datasourceId,
      dimensions: {
        id: {
          title: 'ID',
          type: 'string',
          sql: '{CUBE}.id',
        },
      },
      measures: {
        total_count: {
          title: '总数',
          type: 'count',
          sql: '{CUBE}.id',
        },
      },
    },
  })

  await gotoSemantic(page, '/semantic/cubes')
  await expect(page.getByRole('heading', { name: 'Cube 管理' })).toBeVisible()
}
