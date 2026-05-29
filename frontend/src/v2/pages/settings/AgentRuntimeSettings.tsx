// frontend/src/v2/pages/settings/AgentRuntimeSettings.tsx
//
// 平台级 AI Runtime 设置页。业务 Copilot 只消费运行态，不承载平台管理入口。

import { useRef, useState } from 'react'
import { Button, Card, CardBody, CardHead, Chip } from '@v2/components/ui'
import type {
  AgentRuntimeName,
  AgentRuntimeOperationResult,
  AgentRuntimeProviderStatus,
} from '@v2/api/agent-runtime'
import {
  useAgentRuntimeStatus,
  useRestartAgentRuntimeProvider,
  useStartAgentRuntimeProvider,
  useTestAgentRuntimeProvider,
} from '@v2/hooks/agent-runtime'

type RuntimeOperation = 'test' | 'start' | 'restart'

interface OperationFeedback {
  tone: 'success' | 'danger'
  message: string
}

const PROVIDER_ORDER: AgentRuntimeName[] = ['openai_compatible', 'codex_app_server']

const RUNTIME_FALLBACK_LABELS: Record<string, string> = {
  openai_compatible: 'OpenAI SDK / LLM API provider',
  codex_app_server: 'Codex app-server provider',
}

function providerLabel(provider: AgentRuntimeProviderStatus): string {
  return provider.label || RUNTIME_FALLBACK_LABELS[provider.runtime_name] || provider.runtime_name
}

function providerDescription(provider: AgentRuntimeProviderStatus): string {
  const fallback = RUNTIME_FALLBACK_LABELS[provider.runtime_name]
  return fallback ? `${fallback} · ${provider.runtime_name}` : provider.runtime_name
}

function hasOperation(provider: AgentRuntimeProviderStatus, operation: RuntimeOperation): boolean {
  const operations = providerOperations(provider)
  if (operation === 'test') {
    return operations.includes('test') || operations.includes('test_connection')
  }
  return operations.includes(operation)
}

function statusTone(provider: AgentRuntimeProviderStatus) {
  if (provider.available) return 'success'
  if (!provider.configured) return 'warning'
  if (provider.status === 'disabled' || provider.status === 'unavailable') return 'danger'
  return 'neutral'
}

function formatBoolean(value: boolean): string {
  return value ? '是' : '否'
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return '操作失败，请稍后重试'
}

function providerOperations(provider: AgentRuntimeProviderStatus): string[] {
  return Array.isArray(provider.operations) ? provider.operations : []
}

export default function AgentRuntimeSettings() {
  const statusQ = useAgentRuntimeStatus()
  const testProvider = useTestAgentRuntimeProvider()
  const startProvider = useStartAgentRuntimeProvider()
  const restartProvider = useRestartAgentRuntimeProvider()
  const [feedback, setFeedback] = useState<Record<string, OperationFeedback>>({})
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const operationLock = useRef(false)
  const canManageRuntime = statusQ.data?.can_manage === true
  const operationInFlight =
    Boolean(pendingKey) || testProvider.isPending || startProvider.isPending || restartProvider.isPending

  const providers = (Array.isArray(statusQ.data?.providers) ? [...statusQ.data.providers] : []).sort((a, b) => {
    const aIndex = PROVIDER_ORDER.indexOf(a.runtime_name)
    const bIndex = PROVIDER_ORDER.indexOf(b.runtime_name)
    return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex)
  })
  const actionBindings = Array.isArray(statusQ.data?.action_bindings) ? statusQ.data.action_bindings : []

  async function runOperation(provider: AgentRuntimeProviderStatus, operation: RuntimeOperation) {
    if (!canManageRuntime || operationLock.current || operationInFlight) return
    operationLock.current = true
    const key = `${provider.runtime_name}:${operation}`
    setPendingKey(key)
    setFeedback((prev) => {
      const next = { ...prev }
      delete next[provider.runtime_name]
      return next
    })
    try {
      const result =
        operation === 'test'
          ? await testProvider.mutateAsync(provider.runtime_name)
          : operation === 'start'
            ? await startProvider.mutateAsync(provider.runtime_name)
            : await restartProvider.mutateAsync(provider.runtime_name)
      setFeedback((prev) => ({
        ...prev,
        [provider.runtime_name]: {
          tone: 'success',
          message: successMessage(provider.runtime_name, operation, result),
        },
      }))
    } catch (err) {
      setFeedback((prev) => ({
        ...prev,
        [provider.runtime_name]: { tone: 'danger', message: errorMessage(err) },
      }))
    } finally {
      operationLock.current = false
      setPendingKey(null)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-[15px] font-semibold text-1">AI Runtime</h2>
        <p className="mt-1 text-[12px] text-3">
          平台统一管理 OpenAI SDK / LLM API provider 与 Codex app-server provider。
        </p>
      </div>

      {statusQ.isLoading ? (
        <Card>
          <CardBody className="text-[12px] text-3">正在加载 AI Runtime 状态…</CardBody>
        </Card>
      ) : null}

      {statusQ.isError ? (
        <Card>
          <CardBody className="text-[12px]" style={{ color: 'var(--danger)' }}>
            AI Runtime 状态加载失败
          </CardBody>
        </Card>
      ) : null}

      {!statusQ.isLoading && !statusQ.isError && !canManageRuntime ? (
        <Card>
          <CardBody className="text-[12px] text-3">
            仅平台管理员可执行连接测试、启动或重启操作。
          </CardBody>
        </Card>
      ) : null}

      {!statusQ.isLoading && !statusQ.isError && providers.length === 0 ? (
        <Card>
          <CardBody className="text-[12px] text-3">暂无可用 runtime provider。</CardBody>
        </Card>
      ) : null}

      {providers.map((provider) => {
        const providerFeedback = feedback[provider.runtime_name]
        const operations = providerOperations(provider)
        const operationsDisabled = !canManageRuntime || operationInFlight
        return (
          <Card key={provider.runtime_name}>
            <CardHead
              title={providerLabel(provider)}
              subtitle={providerDescription(provider)}
              actions={<Chip tone={statusTone(provider)}>{provider.status}</Chip>}
            />
            <CardBody className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <RuntimeField label="Configured" value={formatBoolean(provider.configured)} />
                <RuntimeField label="Available" value={formatBoolean(provider.available)} />
                <RuntimeField label="Status" value={provider.status} />
                <RuntimeField
                  label="Operations"
                  value={operations.length > 0 ? operations.join(' / ') : '无'}
                />
              </div>
              <div className="rounded border px-3 py-2 text-[12px] text-2" style={{ borderColor: 'var(--border)' }}>
                {provider.message || '暂无状态说明'}
              </div>
              <RuntimeDetails provider={provider} />
              <div className="flex flex-wrap items-center gap-2">
                {hasOperation(provider, 'test') ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={pendingKey === `${provider.runtime_name}:test`}
                    disabled={operationsDisabled}
                    onClick={() => runOperation(provider, 'test')}
                  >
                    测试连接
                  </Button>
                ) : null}
                {provider.runtime_name === 'codex_app_server' && hasOperation(provider, 'start') ? (
                  <Button
                    size="sm"
                    variant="primary"
                    loading={pendingKey === `${provider.runtime_name}:start`}
                    disabled={operationsDisabled}
                    onClick={() => runOperation(provider, 'start')}
                  >
                    启动 Codex
                  </Button>
                ) : null}
                {provider.runtime_name === 'codex_app_server' && hasOperation(provider, 'restart') ? (
                  <Button
                    size="sm"
                    loading={pendingKey === `${provider.runtime_name}:restart`}
                    disabled={operationsDisabled}
                    onClick={() => runOperation(provider, 'restart')}
                  >
                    重启
                  </Button>
                ) : null}
              </div>
              {providerFeedback ? (
                <div
                  role={providerFeedback.tone === 'danger' ? 'alert' : 'status'}
                  className="text-[12px]"
                  style={{
                    color: providerFeedback.tone === 'danger' ? 'var(--danger)' : 'var(--success)',
                  }}
                >
                  {providerFeedback.message}
                </div>
              ) : null}
            </CardBody>
          </Card>
        )
      })}

      {actionBindings.length ? (
        <Card>
          <CardHead title="Action bindings" subtitle="业务 action 到 runtime 的平台绑定" />
          <CardBody className="flex flex-col gap-2">
            {actionBindings.map((binding) => (
              <div
                key={binding.action}
                className="rounded border px-3 py-2 text-[12px]"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="font-medium text-1">{binding.action}</div>
                <div className="mt-1 text-3">
                  默认 {binding.default_runtime} · 允许{' '}
                  {Array.isArray(binding.allowed_runtimes) ? binding.allowed_runtimes.join(' / ') : '无'}
                </div>
                {binding.reason ? <div className="mt-1 text-3">{binding.reason}</div> : null}
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}

function RuntimeDetails({ provider }: { provider: AgentRuntimeProviderStatus }) {
  const details = provider.details && typeof provider.details === 'object' ? provider.details : {}
  const rows = ['transport', 'endpoint', 'project_root', 'runtime_root']
    .map((key) => [key, formatRuntimeDetailValue(details[key])] as const)
    .filter(([, value]) => value.length > 0)
  if (!rows.length) return null
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map(([key, value]) => (
        <RuntimeField key={key} label={key} value={value} />
      ))}
    </div>
  )
}

function RuntimeField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-3">{label}</div>
      <div className="mt-0.5 break-words text-[12px] text-1">{value}</div>
    </div>
  )
}

function formatRuntimeDetailValue(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return formatBoolean(value)
  return ''
}

function successMessage(
  runtimeName: AgentRuntimeName,
  operation: RuntimeOperation,
  result: AgentRuntimeProviderStatus | AgentRuntimeOperationResult,
): string {
  if ('message' in result && result.message) return result.message
  if (runtimeName === 'codex_app_server' && operation === 'start') return '已提交 Codex 启动请求'
  if (operation === 'test') return '连接测试已完成'
  if (operation === 'restart') return '重启请求已提交'
  return '操作已提交'
}
