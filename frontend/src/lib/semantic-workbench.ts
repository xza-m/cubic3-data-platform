export type SemanticWorkbenchMode = 'ide' | 'visual-model' | 'playground'

export type SemanticObjectKind = 'catalog' | 'domain' | 'cube' | 'view' | 'recipe'

export interface SemanticSelectionState {
  mode: SemanticWorkbenchMode
  kind: SemanticObjectKind
  id?: string | null
  name?: string | null
  code?: string | null
}

export function buildSemanticSelection(
  mode: SemanticWorkbenchMode,
  kind: SemanticObjectKind,
  values: Partial<Omit<SemanticSelectionState, 'mode' | 'kind'>> = {},
): SemanticSelectionState {
  return {
    mode,
    kind,
    id: values.id ?? null,
    name: values.name ?? null,
    code: values.code ?? null,
  }
}
