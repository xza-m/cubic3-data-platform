// frontend/src/v2/api/diagnose.ts
//
// 语义诊断（B-back-9）API 客户端。
// 与 api/semantic.ts 隔离以避免主线 / sub-agent 并行编辑时的写冲突。
//
// 后端契约：app/interfaces/api/v1/semantic.py
//   POST   /api/v1/semantic/diagnose            — 同步诊断并落库
//   GET    /api/v1/semantic/diagnose/runs       — 分页历史
//   GET    /api/v1/semantic/diagnose/runs/:id   — 详情

import { apiClient } from '@v2/api/client'

// ─── 通用 envelope ─────────────────────────────────────────────────────────

interface Envelope<T> {
  code: number
  message: string
  data: T
  trace_id?: string | null
}

const get = <T>(url: string, params?: Record<string, unknown>): Promise<T> =>
  apiClient.get<Envelope<T>>(url, { params }).then((r) => r.data.data)

const post = <T>(url: string, body?: unknown): Promise<T> =>
  apiClient.post<Envelope<T>>(url, body).then((r) => r.data.data)

// ─── 类型 ──────────────────────────────────────────────────────────────────

export type DiagnoseInputKind = 'nl' | 'sql' | 'yaml'

export interface DiagnoseRun {
  id: number
  user_id: number | null
  input_kind: DiagnoseInputKind
  input_text: string
  parse_ok: boolean | null
  validate_ok: boolean | null
  sql_text: string | null
  error: string | null
  duration_ms: number | null
  created_at: string | null
}

export interface DiagnoseRunListResponse {
  items: DiagnoseRun[]
  total: number
  page: number
  page_size: number
  page_count?: number
}

export interface DiagnoseRequest {
  input_kind: DiagnoseInputKind
  input_text: string
}

// ─── API ───────────────────────────────────────────────────────────────────

export const runDiagnose = (body: DiagnoseRequest) =>
  post<DiagnoseRun>('/semantic/diagnose', body)

export const listDiagnoseRuns = (params?: { page?: number; page_size?: number }) =>
  get<DiagnoseRunListResponse>(
    '/semantic/diagnose/runs',
    params as Record<string, unknown>,
  )

export const getDiagnoseRun = (runId: number) =>
  get<DiagnoseRun>(`/semantic/diagnose/runs/${runId}`)
