import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@v2/hooks/query-client'
import {
  applySemanticAssetPackageAction,
  createSemanticBuildProject,
  getSemanticBuildProject,
  getSemanticAssetPackageProposalReadiness,
  listSemanticBuildProjects,
  scanSemanticBuildProject,
  updateSemanticAssetPackage,
  type CreateSemanticBuildProjectBody,
  type ScanSemanticBuildProjectBody,
  type SemanticAssetPackageActionBody,
  type UpdateSemanticAssetPackageBody,
} from '@v2/api/semanticModelingWorkbench'

export function useSemanticBuildProjects() {
  return useQuery({
    queryKey: qk('semantic', 'modeling-workbench-projects'),
    queryFn: listSemanticBuildProjects,
  })
}

export function useSemanticBuildProject(projectId: string | undefined) {
  return useQuery({
    queryKey: qk('semantic', 'modeling-workbench-project', projectId),
    queryFn: () => getSemanticBuildProject(projectId!),
    enabled: Boolean(projectId),
  })
}

export function useSemanticAssetPackageProposalReadiness(
  projectId: string | undefined,
  packageId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: qk('semantic', 'modeling-workbench-package-readiness', projectId, packageId),
    queryFn: () => getSemanticAssetPackageProposalReadiness(projectId!, packageId!),
    enabled: enabled && Boolean(projectId) && Boolean(packageId),
    staleTime: 30_000,
  })
}

export function useCreateSemanticBuildProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateSemanticBuildProjectBody) => createSemanticBuildProject(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk('semantic', 'modeling-workbench-projects') })
    },
  })
}

export function useScanSemanticBuildProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, body }: { projectId: string; body: ScanSemanticBuildProjectBody }) =>
      scanSemanticBuildProject(projectId, body),
    onSuccess: (project) => {
      queryClient.setQueryData(qk('semantic', 'modeling-workbench-project', project.id), project)
      queryClient.invalidateQueries({ queryKey: qk('semantic', 'modeling-workbench-projects') })
    },
  })
}

export function useUpdateSemanticAssetPackage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      projectId,
      packageId,
      body,
    }: {
      projectId: string
      packageId: string
      body: UpdateSemanticAssetPackageBody
    }) => updateSemanticAssetPackage(projectId, packageId, body),
    onSuccess: (assetPackage) => {
      queryClient.invalidateQueries({
        queryKey: qk('semantic', 'modeling-workbench-project', assetPackage.project_id),
      })
      queryClient.invalidateQueries({ queryKey: qk('semantic', 'modeling-workbench-projects') })
    },
  })
}

export function useApplySemanticAssetPackageAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      projectId,
      packageId,
      body,
    }: {
      projectId: string
      packageId: string
      body: SemanticAssetPackageActionBody
    }) => applySemanticAssetPackageAction(projectId, packageId, body),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({
        queryKey: qk('semantic', 'modeling-workbench-project', variables.projectId),
      })
      queryClient.invalidateQueries({ queryKey: qk('semantic', 'modeling-workbench-projects') })
    },
  })
}
