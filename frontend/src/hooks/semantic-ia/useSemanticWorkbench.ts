import { useCallback, useMemo } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { createCubeRevision, type CubeDraftPayload } from '@/api/semantic'

export type SemanticWorkbenchMode = 'start' | 'workspace'
export type SemanticWorkbenchTab = 'modeling' | 'preview'

export interface SemanticWorkbenchCubeRef {
  name: string
  status?: CubeDraftPayload['status'] | null
}

export interface UseSemanticWorkbenchOptions {
  currentCube?: SemanticWorkbenchCubeRef | null
  requestedTab?: string | null
}

export function normalizeSemanticWorkbenchTab(
  mode: SemanticWorkbenchMode,
  requestedTab: string | null | undefined,
  fallback: SemanticWorkbenchTab,
): SemanticWorkbenchTab {
  if (mode === 'start') return 'modeling'

  const normalized = String(requestedTab || '').toLowerCase()

  if (normalized === 'preview' || normalized === 'sync' || normalized === 'compiler') return 'preview'
  if (normalized === 'modeling' || normalized === 'editor') return 'modeling'

  return fallback
}

export function buildSemanticWorkbenchHref(
  cubeName?: string | null,
  tab?: SemanticWorkbenchTab,
): string {
  const params = new URLSearchParams()

  if (cubeName) {
    params.set('cube', cubeName)
  }
  if (tab) {
    params.set('tab', tab)
  }

  const query = params.toString()
  return query ? `/semantic/workbench?${query}` : '/semantic/workbench'
}

export function buildOntologyWorkbenchHref(
  tab?: 'objects' | 'properties' | 'metrics' | 'relations' | 'actions' | 'glossary' | 'policies' | null,
  entity?: string | null,
): string {
  const params = new URLSearchParams()

  if (tab) {
    params.set('tab', tab)
  }
  if (entity) {
    params.set('entity', entity)
  }

  const query = params.toString()
  return query ? `/semantic/ontology?${query}` : '/semantic/ontology'
}

export function useSemanticWorkbench(options: UseSemanticWorkbenchOptions = {}) {
  const navigate = useNavigate()
  const currentCube = options.currentCube ?? null
  const mode: SemanticWorkbenchMode = currentCube ? 'workspace' : 'start'
  const defaultTab: SemanticWorkbenchTab = currentCube?.status === 'active' ? 'preview' : 'modeling'
  const currentTab = useMemo(
    () => normalizeSemanticWorkbenchTab(mode, options.requestedTab, defaultTab),
    [defaultTab, mode, options.requestedTab],
  )

  const createRevisionMutation = useMutation({
    mutationFn: async (name: string) => (await createCubeRevision(name)).data,
    onSuccess: (draft) => {
      navigate(buildSemanticWorkbenchHref(draft.name, 'modeling'))
    },
  })

  const startRevision = useCallback(
    (name: string) => createRevisionMutation.mutateAsync(name),
    [createRevisionMutation],
  )

  return {
    currentCube,
    mode,
    defaultTab,
    currentTab,
    workspaceHref: buildSemanticWorkbenchHref(currentCube?.name, currentTab),
    startRevision,
    isStartingRevision: createRevisionMutation.isPending,
  }
}
