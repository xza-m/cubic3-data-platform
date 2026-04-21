// frontend/src/v2/observability/events.ts
//
// 关键操作事件工厂。所有埋点必须经此处定义，禁止页面层散写 ObsEvent 字面量。
// 命名规范：`<domain>.<verb>`；fields 命名 snake_case。
//
// 新增事件 → 同步更新 docs/superpowers/plans/2026-04-20-platform-redesign/observability-events.yaml

import type { ObsEvent, ObsLevel } from './types'

function make(name: string, level: ObsLevel, fields?: Record<string, unknown>): ObsEvent {
  return { name, level, ts: Date.now(), fields }
}

export const ev = {
  /** 用户登录成功 */
  loginSucceeded: (username: string): ObsEvent =>
    make('auth.login_succeeded', 'info', { username }),

  /** 数据源连接测试 */
  datasourceTested: (id: number, ok: boolean, latencyMs: number): ObsEvent =>
    make('datasource.tested', 'info', {
      datasource_id: id,
      ok,
      latency_ms: latencyMs,
    }),

  /** 数据集创建（注册） */
  datasetRegistered: (id: number): ObsEvent =>
    make('dataset.registered', 'info', { dataset_id: id }),

  /** Cube 创建 */
  cubeCreated: (name: string): ObsEvent =>
    make('semantic.cube_created', 'info', { cube_name: name }),

  /** 语义诊断（DSL / SQL / NL）执行完成 */
  cubeDiagnoseRun: (
    inputKind: 'nl' | 'sql' | 'yaml',
    ok: boolean,
    durationMs: number | null,
  ): ObsEvent =>
    make('semantic.diagnose_run', 'info', {
      input_kind: inputKind,
      ok,
      duration_ms: durationMs,
    }),

  /** 本体对象/实体校验（通过发布动作触发上下游 impact 校验） */
  objectValidated: (entityType: string, entityName: string): ObsEvent =>
    make('ontology.object_validated', 'info', {
      entity_type: entityType,
      entity_name: entityName,
    }),

  /** 指标公式 dry-run */
  metricDryrun: (name: string, ok: boolean): ObsEvent =>
    make('ontology.metric_dryrun', 'info', { metric_name: name, ok }),

  /** SQL 查询执行 */
  queryExecuted: (datasourceId: number | null, durationMs: number | null): ObsEvent =>
    make('query.executed', 'info', {
      datasource_id: datasourceId,
      duration_ms: durationMs,
    }),

  /** 调度查询手动触发 */
  scheduledQueryTriggered: (id: number): ObsEvent =>
    make('query.scheduled_triggered', 'info', { scheduled_query_id: id }),

  /** 渠道测试发送 */
  channelTestSent: (id: number, ok: boolean): ObsEvent =>
    make('channel.test_sent', 'info', { channel_id: id, ok }),

  /** 应用实例启动（手动触发执行 / 启用） */
  appInstanceStarted: (id: number): ObsEvent =>
    make('app.instance_started', 'info', { instance_id: id }),

  /** 应用实例停止（禁用） */
  appInstanceStopped: (id: number): ObsEvent =>
    make('app.instance_stopped', 'info', { instance_id: id }),

  /** 用户偏好更新 */
  preferencesUpdated: (changedKeys: readonly string[]): ObsEvent =>
    make('settings.preferences_updated', 'info', {
      changed_keys: [...changedKeys],
    }),

  /** 路由跳转（页面切换） */
  navigated: (from: string | null, to: string): ObsEvent =>
    make('nav.navigated', 'debug', { from, to }),
} as const

export type EventFactory = typeof ev
