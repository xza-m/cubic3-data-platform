// frontend/src/v2/hooks/agent-runtime.ts
//
// 平台级 Agent Runtime 状态 hooks。

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@v2/hooks/query-client'
import {
  getAgentRuntimeStatus,
  startAgentRuntimeProvider,
  type AgentRuntimeManagementSnapshot,
  type AgentRuntimeName,
} from '@v2/api/agent-runtime'

export function useAgentRuntimeStatus() {
  return useQuery<AgentRuntimeManagementSnapshot>({
    queryKey: qk('agent-runtime', 'status'),
    queryFn: getAgentRuntimeStatus,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

export function useStartAgentRuntimeProvider() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (runtimeName: AgentRuntimeName) => startAgentRuntimeProvider(runtimeName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk('agent-runtime', 'status') })
    },
  })
}
