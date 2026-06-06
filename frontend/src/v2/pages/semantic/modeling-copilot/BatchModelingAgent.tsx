import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, X } from 'lucide-react'

import { Button } from '@v2/components/ui'
import type { SemanticAssetPackage } from '@v2/api/semanticModelingWorkbench'
import { t } from '@v2/i18n'

import { BatchModelingWorkbench } from './components/BatchModelingWorkbench'
import type { BatchModelingQueueItem, BatchQueueStatus } from './batchModeling'
import { createWorkbenchCandidateTarget } from './workbenchContext'

export default function BatchModelingAgent() {
  const [selectedItem, setSelectedItem] = useState<SemanticAssetPackage | null>(null)
  const confirmationRef = useRef<HTMLElement | null>(null)
  const confirmationTitleId = 'batch-modeling-agent-confirmation-title'
  const workbenchTarget = useMemo(
    () =>
      selectedItem
        ? createWorkbenchCandidateTarget(toWorkbenchQueueItem(selectedItem), {
            projectId: selectedItem.project_id,
            mode: 'batch',
          })
        : null,
    [selectedItem],
  )

  useEffect(() => {
    if (!selectedItem) return
    confirmationRef.current?.focus()
  }, [selectedItem])

  return (
    <div className="relative min-h-full">
      <BatchModelingWorkbench onOpenBuilder={setSelectedItem} />

      {selectedItem && workbenchTarget ? (
        <aside
          ref={confirmationRef}
          className="fixed bottom-5 right-5 z-50 w-[min(420px,calc(100vw-32px))] rounded-[8px] border bg-[var(--bg-surface)] p-4 shadow-[0_18px_48px_rgba(15,23,42,0.18)]"
          style={{ borderColor: 'var(--border)' }}
          role="dialog"
          aria-modal="false"
          aria-labelledby={confirmationTitleId}
          tabIndex={-1}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="m-0 text-[12px] font-semibold text-3">
                {t('semantic.modelingWorkbench.confirmation.selected', '已选择批量候选资产')}
              </p>
              <h2 id={confirmationTitleId} className="m-0 mt-1 break-words text-[15px] font-semibold text-1">
                {selectedItem.title}
              </h2>
            </div>
            <Button
              aria-label={t('common.cancel', '取消')}
              className="shrink-0"
              size="sm"
              variant="ghost"
              onClick={() => setSelectedItem(null)}
            >
              <X size={13} aria-hidden />
            </Button>
          </div>

          <p className="m-0 mt-3 text-[12px] leading-5 text-2">
            {t(
              'semantic.modelingWorkbench.confirmation.description',
              '进入语义建设工作台后继续完成字段候选、口径确认、沙盒校验和发布门禁。',
            )}
          </p>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="default" onClick={() => setSelectedItem(null)}>
              {t('common.cancel', '取消')}
            </Button>
            <Link className="btn btn-sm btn-primary" to={workbenchTarget.pathname} state={workbenchTarget.state}>
              {t('semantic.modelingWorkbench.confirmation.open', '打开语义建设工作台')}
              <ArrowRight size={13} aria-hidden />
            </Link>
          </div>
        </aside>
      ) : null}
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
