import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type {
  CubeSummary,
  DomainCatalogSummary,
  DomainSummary,
  RecipeSummary,
  ViewSummary,
} from '@/api/semantic'
import { listCubes, listDomainCatalogs, listDomains, listRecipes, listViews } from '@/api/semantic'
import type { SemanticResourceTreeGroup } from '@/components/Semantic/DevTools/SemanticResourceTree'
import { getSemanticStatusLabel } from '@/lib/semantic-status'
import { buildSemanticSelection, type SemanticObjectKind } from '@/lib/semantic-workbench'

export interface UseSemanticDevToolsOptions {
  keyword?: string
  selectedKind?: SemanticObjectKind
  selectedCode?: string
  selectedName?: string
}

export interface SemanticDevToolsSelectedResource {
  kind: SemanticObjectKind
  name: string
  code: string
  pathLabel: string
  objectTypeLabel: string
  schemaLabel: string
  schemaTone: 'default' | 'accent' | 'warning'
  editorType: 'cubes' | 'views' | 'recipes' | null
  editorSupported: boolean
  actionHref: string
  highlightObjectName: string | null
  recipeMeta: {
    tags: string[]
    exampleCount: number
    relatedCubes: string[]
    status: string
  } | null
}

function getSyncMeta(status?: string | null) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'ok' || normalized === 'active') {
    return { label: '正常', tone: 'accent' as const }
  }
  if (normalized === 'warn' || normalized === 'draft') {
    return { label: '待处理', tone: 'warning' as const }
  }
  if (normalized === 'error') {
    return { label: '异常', tone: 'warning' as const }
  }
  return { label: '未记录', tone: 'default' as const }
}

function buildResourceGroups({
  catalogs,
  domains,
  cubes,
  views,
  recipes,
  keyword,
}: {
  catalogs: DomainCatalogSummary[]
  domains: DomainSummary[]
  cubes: CubeSummary[]
  views: ViewSummary[]
  recipes: RecipeSummary[]
  keyword: string
}): SemanticResourceTreeGroup[] {
  const matches = (values: Array<string | null | undefined>) => {
    if (!keyword) return true
    return values.some((value) => String(value || '').toLowerCase().includes(keyword))
  }

  return [
    {
      kind: 'cube',
      label: 'Cube',
      count: cubes.length,
      items: cubes
        .filter((item) => matches([item.title, item.name, item.domain_name, item.description]))
        .map((item) => ({
          key: item.name,
          label: item.title,
          meta: `${item.dimension_count ?? 0} 维度 · ${item.measure_count ?? 0} 指标`,
        })),
    },
    {
      kind: 'view',
      label: 'View',
      count: views.length,
      items: views
        .filter((item) => matches([item.title, item.name, item.description]))
        .map((item) => ({
          key: item.name,
          label: item.title,
          meta: `${item.cube_count ?? 0} 个 Cube · ${item.public ? '公开' : '私有'}`,
        })),
    },
    {
      kind: 'recipe',
      label: 'Recipe',
      count: recipes.length,
      items: recipes
        .filter((item) => matches([item.title, item.name, item.tags.join(' '), item.related_cubes.join(' ')]))
        .map((item) => ({
          key: item.name,
          label: item.title,
          meta: `${item.example_count} 个示例 · ${item.related_cubes.length} 个关联 Cube`,
        })),
    },
    {
      kind: 'domain',
      label: 'Domain',
      count: domains.length,
      items: domains
        .filter((item) => matches([item.name, item.code, item.catalog_name]))
        .map((item) => ({
          key: String(item.id || item.code),
          label: item.name,
          meta: `${item.cube_count ?? 0} Cubes · ${getSemanticStatusLabel(item.status)}`,
        })),
    },
    {
      kind: 'catalog',
      label: 'Catalog',
      count: catalogs.length,
      items: catalogs
        .filter((item) => matches([item.name, item.code, item.description]))
        .map((item) => ({
          key: item.code,
          label: item.name,
          meta: `${item.domain_count} 个领域 · 草稿 ${item.draft_count}`,
        })),
    },
  ]
}

/**
 * DevTools 资源树四源（与各 queryKey 与 DevTools 页面对齐）。
 */
export function useSemanticDevTools(options?: UseSemanticDevToolsOptions) {
  const catalogsQuery = useQuery({
    queryKey: ['semantic', 'catalogs'],
    queryFn: async () => (await listDomainCatalogs()).data,
  })
  const domainsQuery = useQuery({
    queryKey: ['semantic', 'domains'],
    queryFn: async () => (await listDomains()).data,
  })
  const cubesQuery = useQuery({
    queryKey: ['semantic', 'cubes'],
    queryFn: async () => (await listCubes()).data,
  })
  const viewsQuery = useQuery({
    queryKey: ['semantic', 'views'],
    queryFn: async () => (await listViews()).data,
  })
  const recipesQuery = useQuery({
    queryKey: ['semantic', 'recipes'],
    queryFn: async () => (await listRecipes()).data,
  })

  const catalogs = catalogsQuery.data?.catalogs ?? []
  const domains = domainsQuery.data?.domains ?? []
  const cubes = cubesQuery.data?.cubes ?? []
  const views = viewsQuery.data?.views ?? []
  const recipes = recipesQuery.data?.recipes ?? []
  const keyword = options?.keyword?.trim().toLowerCase() ?? ''
  const selectedKind = options?.selectedKind ?? 'cube'
  const selectedCode = options?.selectedCode ?? ''
  const selectedName = options?.selectedName ?? ''

  const isLoading =
    catalogsQuery.isLoading
    || domainsQuery.isLoading
    || cubesQuery.isLoading
    || viewsQuery.isLoading
    || recipesQuery.isLoading

  const resourceGroups = useMemo(() => buildResourceGroups({
    catalogs,
    domains,
    cubes,
    views,
    recipes,
    keyword,
  }), [catalogs, cubes, domains, keyword, recipes, views])

  const defaultSelection = useMemo(() => {
    if (cubes.length > 0) {
      return { kind: 'cube' as const, resource: cubes[0].name, file: cubes[0].name }
    }
    if (views.length > 0) {
      return { kind: 'view' as const, resource: views[0].name, file: views[0].name }
    }
    if (recipes.length > 0) {
      return { kind: 'recipe' as const, resource: recipes[0].name, file: recipes[0].name }
    }
    if (domains.length > 0) {
      return { kind: 'domain' as const, resource: String(domains[0].id || domains[0].code), file: undefined }
    }
    if (catalogs.length > 0) {
      return { kind: 'catalog' as const, resource: catalogs[0].code, file: undefined }
    }
    return null
  }, [catalogs, cubes, domains, recipes, views])

  const selectionExists = useMemo(() => {
    if (!selectedCode && !selectedName) return false

    if (selectedKind === 'cube') {
      return cubes.some((item) => item.name === selectedCode || item.name === selectedName)
    }
    if (selectedKind === 'view') {
      return views.some((item) => item.name === selectedCode || item.name === selectedName)
    }
    if (selectedKind === 'recipe') {
      return recipes.some((item) => item.name === selectedCode || item.name === selectedName)
    }
    if (selectedKind === 'domain') {
      return domains.some(
        (item) => String(item.id || item.code) === selectedCode || item.code === selectedCode || item.name === selectedName,
      )
    }

    return catalogs.some((item) => item.code === selectedCode || item.name === selectedName)
  }, [catalogs, cubes, domains, recipes, selectedCode, selectedKind, selectedName, views])

  const normalizedSelection = useMemo(() => {
    const shouldFallbackToDefault = Boolean(
      defaultSelection
      && (
        selectedKind === 'domain'
        || selectedKind === 'catalog'
        || !selectionExists
      ),
    )

    if (shouldFallbackToDefault && defaultSelection) {
      return {
        selectedKind: defaultSelection.kind,
        selectedCode: defaultSelection.resource,
        selectedName: defaultSelection.file ?? '',
      }
    }

    return { selectedKind, selectedCode, selectedName }
  }, [defaultSelection, selectedCode, selectedKind, selectedName, selectionExists])

  const selection = useMemo(() => {
    if (normalizedSelection.selectedKind === 'cube') {
      const cube = cubes.find((item) => item.name === normalizedSelection.selectedCode || item.name === normalizedSelection.selectedName)
      return cube ? buildSemanticSelection('ide', 'cube', { name: cube.title, code: cube.name }) : null
    }
    if (normalizedSelection.selectedKind === 'view') {
      const view = views.find((item) => item.name === normalizedSelection.selectedCode || item.name === normalizedSelection.selectedName)
      return view ? buildSemanticSelection('ide', 'view', { name: view.title, code: view.name }) : null
    }
    if (normalizedSelection.selectedKind === 'recipe') {
      const recipe = recipes.find((item) => item.name === normalizedSelection.selectedCode || item.name === normalizedSelection.selectedName)
      return recipe ? buildSemanticSelection('ide', 'recipe', { name: recipe.title, code: recipe.name }) : null
    }
    if (normalizedSelection.selectedKind === 'domain') {
      const domain = domains.find((item) => String(item.id || item.code) === normalizedSelection.selectedCode || item.code === normalizedSelection.selectedCode)
      return domain ? buildSemanticSelection('ide', 'domain', { name: domain.name, code: String(domain.id || domain.code) }) : null
    }
    const catalog = catalogs.find((item) => item.code === normalizedSelection.selectedCode)
    return catalog ? buildSemanticSelection('ide', 'catalog', { name: catalog.name, code: catalog.code }) : null
  }, [catalogs, cubes, domains, normalizedSelection, recipes, views])

  const selectedResource = useMemo<SemanticDevToolsSelectedResource | null>(() => {
    if (normalizedSelection.selectedKind === 'cube') {
      const cube = cubes.find((item) => item.name === normalizedSelection.selectedCode || item.name === normalizedSelection.selectedName)
      if (!cube) return null
      const syncMeta = getSyncMeta(cube.state_summary?.sync_status || cube.sync_status)
      return {
        kind: 'cube',
        name: cube.title,
        code: cube.name,
        pathLabel: `Cube / ${cube.name}`,
        objectTypeLabel: 'Cube',
        schemaLabel: syncMeta.label,
        schemaTone: syncMeta.tone,
        editorType: 'cubes',
        editorSupported: true,
        actionHref: `/semantic/cubes/${cube.name}`,
        highlightObjectName: cube.name,
        recipeMeta: null,
      }
    }
    if (normalizedSelection.selectedKind === 'view') {
      const view = views.find((item) => item.name === normalizedSelection.selectedCode || item.name === normalizedSelection.selectedName)
      if (!view) return null
      return {
        kind: 'view',
        name: view.title,
        code: view.name,
        pathLabel: `View / ${view.name}`,
        objectTypeLabel: 'View',
        schemaLabel: '仅发布后可检测',
        schemaTone: 'default',
        editorType: 'views',
        editorSupported: true,
        actionHref: `/semantic/views/${view.name}`,
        highlightObjectName: view.name,
        recipeMeta: null,
      }
    }
    if (normalizedSelection.selectedKind === 'recipe') {
      const recipe = recipes.find((item) => item.name === normalizedSelection.selectedCode || item.name === normalizedSelection.selectedName)
      if (!recipe) return null
      return {
        kind: 'recipe',
        name: recipe.title,
        code: recipe.name,
        pathLabel: `Recipe / ${recipe.name}`,
        objectTypeLabel: 'Recipe',
        schemaLabel: `${recipe.example_count} 个示例`,
        schemaTone: 'accent',
        editorType: 'recipes',
        editorSupported: true,
        actionHref: `/semantic/workbench?tab=editor&kind=recipe&resource=${recipe.name}&file=${recipe.name}`,
        highlightObjectName: recipe.name,
        recipeMeta: {
          tags: recipe.tags,
          exampleCount: recipe.example_count,
          relatedCubes: recipe.related_cubes,
          status: recipe.state_summary?.status || 'draft',
        },
      }
    }
    if (normalizedSelection.selectedKind === 'domain') {
      const domain = domains.find((item) => String(item.id || item.code) === normalizedSelection.selectedCode || item.code === normalizedSelection.selectedCode)
      if (!domain) return null
      const syncMeta = getSyncMeta(domain.state_summary?.sync_status)
      return {
        kind: 'domain',
        name: domain.name,
        code: String(domain.id || domain.code),
        pathLabel: `Domain / ${domain.code}`,
        objectTypeLabel: 'Domain',
        schemaLabel: syncMeta.label,
        schemaTone: syncMeta.tone,
        editorType: null,
        editorSupported: false,
        actionHref: `/semantic/domains/${domain.id || domain.code}`,
        highlightObjectName: domain.code,
        recipeMeta: null,
      }
    }
    const catalog = catalogs.find((item) => item.code === normalizedSelection.selectedCode)
    if (!catalog) return null
    const syncMeta = getSyncMeta(catalog.status)
    return {
      kind: 'catalog',
      name: catalog.name,
      code: catalog.code,
      pathLabel: `Catalog / ${catalog.code}`,
      objectTypeLabel: 'Catalog',
      schemaLabel: syncMeta.label,
      schemaTone: syncMeta.tone,
      editorType: null,
      editorSupported: false,
      actionHref: '/semantic/domains',
      highlightObjectName: null,
      recipeMeta: null,
    }
  }, [catalogs, cubes, domains, normalizedSelection, recipes, views])

  return {
    catalogsQuery,
    domainsQuery,
    cubesQuery,
    viewsQuery,
    recipesQuery,
    catalogs,
    domains,
    cubes,
    views,
    recipes,
    selection,
    selectedResource,
    resourceGroups,
    defaultSelection,
    resolvedSelection: normalizedSelection,
    isLoading,
  }
}
