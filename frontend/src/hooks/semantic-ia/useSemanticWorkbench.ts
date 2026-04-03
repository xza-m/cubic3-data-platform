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

function normalizeWorkbenchTab(
  requestedTab: string | null | undefined,
  fallback: SemanticWorkbenchTab,
): SemanticWorkbenchTab {
  const normalized = String(requestedTab || '').toLowerCase()

  if (normalized === 'preview' || normalized === 'sync') return 'preview'
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

export function useSemanticWorkbench(options: UseSemanticWorkbenchOptions = {}) {
  const navigate = useNavigate()
  const currentCube = options.currentCube ?? null
  const mode: SemanticWorkbenchMode = currentCube ? 'workspace' : 'start'
  const defaultTab: SemanticWorkbenchTab = currentCube?.status === 'active' ? 'preview' : 'modeling'
  const currentTab = useMemo(
    () => normalizeWorkbenchTab(options.requestedTab, defaultTab),
    [defaultTab, options.requestedTab],
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
