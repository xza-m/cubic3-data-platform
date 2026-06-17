import { useNavigate } from 'react-router-dom'

import type { SemanticAssetPackage } from '@v2/api/semanticModelingWorkbench'

import { BatchModelingWorkbench } from './components/BatchModelingWorkbench'
import type { BatchModelingQueueItem, BatchQueueStatus } from './batchModeling'
import { createWorkbenchCandidateTarget } from './workbenchContext'

export default function BatchModelingAgent() {
  const navigate = useNavigate()

  function handleOpenBuilder(item: SemanticAssetPackage) {
    const target = createWorkbenchCandidateTarget(toWorkbenchQueueItem(item), {
      projectId: item.project_id,
      mode: 'batch',
    })
    navigate(target.pathname, { state: target.state })
  }

  return (
    <div className="relative min-h-full">
      <BatchModelingWorkbench onOpenBuilder={handleOpenBuilder} />
    </div>
  )
}

function toWorkbenchQueueItem(item: SemanticAssetPackage): BatchModelingQueueItem {
  return {
    id: item.id,
    title: item.title,
    target: item.target,
    source: item.source,
    grain: item.grain,
    confidence: item.confidence,
    risk: item.risk,
    status: toWorkbenchQueueStatus(item.status),
    primaryAction: item.primary_action === 'open_builder' ? 'open_builder' : 'defer',
    evidence: item.evidence,
    modelingSource: item.modeling_source,
  }
}

function toWorkbenchQueueStatus(status: SemanticAssetPackage['status']): BatchQueueStatus {
  if (status === 'needs_scope' || status === 'high_risk' || status === 'deferred') return status
  return 'ready_for_review'
}
