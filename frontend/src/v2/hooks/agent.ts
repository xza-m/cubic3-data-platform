// frontend/src/v2/hooks/agent.ts
//
// Agent 语义规划预演 hooks。

import { useMutation } from '@tanstack/react-query'
import {
  createAgentSemanticPlan,
  type AgentSemanticPlanRequest,
} from '@v2/api/agent'

export function useAgentSemanticPlan() {
  return useMutation({
    mutationFn: (body: AgentSemanticPlanRequest) => createAgentSemanticPlan(body),
  })
}
