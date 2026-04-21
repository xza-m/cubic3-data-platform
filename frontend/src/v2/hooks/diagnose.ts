// frontend/src/v2/hooks/diagnose.ts
//
// 语义诊断（B-back-9）react-query hooks。
// 与 hooks/semantic.ts 隔离以避免主线 / sub-agent 并行编辑时的写冲突。

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { qk } from '@v2/hooks/query-client'
import { ev, obs } from '@v2/observability'
import {
  getDiagnoseRun,
  listDiagnoseRuns,
  runDiagnose,
  type DiagnoseRequest,
} from '@v2/api/diagnose'

export function useDiagnoseRuns(params?: { page?: number; page_size?: number }) {
  return useQuery({
    queryKey: qk('semantic', 'diagnose-runs', params),
    queryFn: () => listDiagnoseRuns(params),
    staleTime: 5_000,
    refetchOnWindowFocus: false,
  })
}

export function useDiagnoseRun(runId: number | undefined) {
  return useQuery({
    queryKey: qk('semantic', 'diagnose-run', runId),
    queryFn: () => getDiagnoseRun(runId!),
    enabled: !!runId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
}

export function useRunDiagnose() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: DiagnoseRequest) => runDiagnose(body),
    onSuccess: (run, body) => {
      const ok = run.parse_ok !== false && run.validate_ok !== false && !run.error
      obs.track(ev.cubeDiagnoseRun(body.input_kind, ok, run.duration_ms))
      qc.invalidateQueries({ queryKey: ['semantic', 'diagnose-runs'] })
    },
  })
}
