// frontend/src/v2/pages/settings/AgentRuntimeSettings.tsx
//
// 平台级 AI Runtime 设置页。业务 Copilot 只消费运行态，不承载平台管理入口。
// 上半：提供方卡片（状态 + capability 标签 + config 编辑表单）
// 下半：Action bindings 表格（只读，含 kind 列）

import { useRef, useState } from 'react'
import { Button, Card, CardBody, CardHead, Chip, Input, Switch, Table, type TableColumn } from '@v2/components/ui'
import type {
  AgentRuntimeActionBinding,
  AgentRuntimeName,
  AgentRuntimeProviderStatus,
} from '@v2/api/agent-runtime'
import {
  useAgentRuntimeProviderConfig,
  useAgentRuntimeStatus,
  useTestAgentRuntimeProvider,
  useUpdateAgentRuntimeProviderConfig,
} from '@v2/hooks/agent-runtime'
import { t } from '@v2/i18n'

type RuntimeOperation = 'test'

interface OperationFeedback {
  tone: 'success' | 'danger'
  message: string
}

const PROVIDER_ORDER: AgentRuntimeName[] = ['openai_compatible', 'codex_sdk']

const RUNTIME_FALLBACK_LABELS: Record<string, string> = {
  openai_compatible: 'OpenAI SDK / LLM API provider',
  codex_sdk: 'Codex SDK provider',
}

/** 静态 capability 标签：按 runtime_name 映射调用形态 */
const RUNTIME_CAPABILITY_LABELS: Record<string, string[]> = {
  openai_compatible: ['agentRuntime.capability.syncCompletion', 'agentRuntime.capability.toolCall'],
  codex_sdk: ['agentRuntime.capability.asyncAgentic'],
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
  if (provider.status === 'not_verified') return 'warning'
  if (provider.status === 'disabled' || provider.status === 'unavailable') return 'danger'
  return 'neutral'
}

function formatBoolean(value: boolean): string {
  return value ? t('common.yes', '是') : t('common.no', '否')
}

function statusLabel(provider: AgentRuntimeProviderStatus): string {
  if (provider.available || provider.status === 'ready') return 'ready'
  if (provider.status === 'not_verified' && provider.configured)
    return t('agentRuntime.status.notVerified', '待连接测试')
  if (provider.status === 'missing_config') return t('agentRuntime.status.missingConfig', '缺少配置')
  if (provider.status === 'disabled') return t('agentRuntime.status.disabled', '已禁用')
  if (provider.status === 'unavailable') return t('agentRuntime.status.unavailable', '不可用')
  return provider.status
}

function availabilityLabel(provider: AgentRuntimeProviderStatus): string {
  if (provider.available) return t('agentRuntime.availability.available', '可调用')
  if (provider.status === 'not_verified' && provider.configured)
    return t('agentRuntime.status.notVerified', '待连接测试')
  if (!provider.configured) return t('agentRuntime.availability.notConfigured', '未配置')
  if (provider.status === 'disabled') return t('agentRuntime.status.disabled', '已禁用')
  return t('agentRuntime.availability.unavailable', '不可用')
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return t('agentRuntime.error.operationFailed', '操作失败，请稍后重试')
}

function providerOperations(provider: AgentRuntimeProviderStatus): string[] {
  return Array.isArray(provider.operations) ? provider.operations : []
}

function kindLabel(kind?: 'sync' | 'async'): string {
  if (kind === 'sync') return t('agentRuntime.kind.sync', '同步补全 / 工具调用')
  if (kind === 'async') return t('agentRuntime.kind.async', '异步 agentic run')
  return t('agentRuntime.kind.unknown', '—')
}

function kindTone(kind?: 'sync' | 'async') {
  if (kind === 'sync') return 'accent' as const
  if (kind === 'async') return 'violet' as const
  return 'neutral' as const
}

// ——————————————————————————————————————————————
// Config 编辑表单（单 provider 可展开/内联）
// ——————————————————————————————————————————————

interface ProviderConfigFormProps {
  runtimeName: AgentRuntimeName
  canManage: boolean
}

function ProviderConfigForm({ runtimeName, canManage }: ProviderConfigFormProps) {
  const configQ = useAgentRuntimeProviderConfig(runtimeName)
  const updateConfig = useUpdateAgentRuntimeProviderConfig()

  const serverData = configQ.data
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [endpoint, setEndpoint] = useState<string | null>(null)
  const [model, setModel] = useState<string | null>(null)
  // apiKey 输入框：始终为空 placeholder，用户输入表示"想要更新"，不输入表示"保留现有"
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [saveFeedback, setSaveFeedback] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null)

  // 表单显示值（优先用本地草稿，否则读服务端）
  const displayEnabled = enabled ?? serverData?.enabled ?? false
  const displayEndpoint = endpoint ?? serverData?.endpoint ?? ''
  const displayModel = model ?? serverData?.model ?? ''

  // 判断服务端是否已配置 api_key（脱敏值为 "********"）
  const hasStoredApiKey = Boolean(serverData?.api_key && serverData.api_key.length > 0)

  const isDirty =
    enabled !== null ||
    endpoint !== null ||
    model !== null ||
    apiKeyInput !== ''

  async function handleSave() {
    if (!canManage) return
    setSaveFeedback(null)

    // 构建 payload：api_key 只在用户有输入时传递
    const payload = {
      enabled: displayEnabled,
      endpoint: displayEndpoint.trim() || null,
      model: displayModel.trim() || null,
      ...(apiKeyInput !== '' ? { api_key: apiKeyInput } : {}),
    }

    try {
      await updateConfig.mutateAsync({ runtimeName, payload })
      setSaveFeedback({
        tone: 'success',
        message: t('agentRuntime.config.saveSuccess', '配置已保存'),
      })
      // 保存成功后清除草稿
      setEnabled(null)
      setEndpoint(null)
      setModel(null)
      setApiKeyInput('')
    } catch (err) {
      setSaveFeedback({
        tone: 'danger',
        message: err instanceof Error ? err.message : t('agentRuntime.config.saveFailed', '保存失败，请稍后重试'),
      })
    }
  }

  function handleReset() {
    setEnabled(null)
    setEndpoint(null)
    setModel(null)
    setApiKeyInput('')
    setSaveFeedback(null)
  }

  if (configQ.isLoading) {
    return (
      <div className="text-[12px] text-3">
        {t('agentRuntime.config.loading', '正在加载配置…')}
      </div>
    )
  }

  if (configQ.isError) {
    return (
      <div className="text-[12px]" style={{ color: 'var(--danger)' }}>
        {t('agentRuntime.config.loadFailed', '配置加载失败')}
      </div>
    )
  }

  const fieldDisabled = !canManage || updateConfig.isPending

  return (
    <div className="flex flex-col gap-3 rounded border px-3 py-3" style={{ borderColor: 'var(--border)' }}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-3">
        {t('agentRuntime.config.sectionTitle', '提供方配置')}
      </div>

      {/* enabled toggle */}
      <div className="flex items-center justify-between gap-3">
        <label className="text-[12px] text-2">
          {t('agentRuntime.config.enabled', '启用')}
        </label>
        <Switch
          checked={displayEnabled}
          onChange={(v) => setEnabled(v)}
          disabled={fieldDisabled}
          ariaLabel={t('agentRuntime.config.enabledAriaLabel', '启用此 provider')}
        />
      </div>

      {/* endpoint */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] uppercase tracking-wide text-3">
          {t('agentRuntime.config.endpoint', 'Endpoint')}
        </label>
        <Input
          type="text"
          value={displayEndpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          disabled={fieldDisabled}
          placeholder={t('agentRuntime.config.endpointPlaceholder', '留空使用默认值')}
        />
      </div>

      {/* model */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] uppercase tracking-wide text-3">
          {t('agentRuntime.config.model', 'Model')}
        </label>
        <Input
          type="text"
          value={displayModel}
          onChange={(e) => setModel(e.target.value)}
          disabled={fieldDisabled}
          placeholder={t('agentRuntime.config.modelPlaceholder', '留空使用默认值')}
        />
      </div>

      {/* api_key */}
      <div className="flex flex-col gap-1">
        <label className="text-[11px] uppercase tracking-wide text-3">
          {t('agentRuntime.config.apiKey', 'API Key')}
        </label>
        <Input
          type="password"
          value={apiKeyInput}
          onChange={(e) => setApiKeyInput(e.target.value)}
          disabled={fieldDisabled}
          placeholder={
            hasStoredApiKey
              ? t('agentRuntime.config.apiKeyPlaceholderSet', '已配置，留空保留现有')
              : t('agentRuntime.config.apiKeyPlaceholderEmpty', '输入 API Key')
          }
          autoComplete="new-password"
        />
      </div>

      {/* actions */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          size="sm"
          variant="primary"
          loading={updateConfig.isPending}
          disabled={fieldDisabled || !isDirty}
          onClick={handleSave}
        >
          {t('agentRuntime.config.save', '保存配置')}
        </Button>
        {isDirty ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={updateConfig.isPending}
            onClick={handleReset}
          >
            {t('agentRuntime.config.reset', '放弃更改')}
          </Button>
        ) : null}
      </div>

      {saveFeedback ? (
        <div
          role={saveFeedback.tone === 'danger' ? 'alert' : 'status'}
          className="text-[12px]"
          style={{
            color: saveFeedback.tone === 'danger' ? 'var(--danger)' : 'var(--success)',
          }}
        >
          {saveFeedback.message}
        </div>
      ) : null}
    </div>
  )
}

// ——————————————————————————————————————————————
// 主组件
// ——————————————————————————————————————————————

export default function AgentRuntimeSettings() {
  const statusQ = useAgentRuntimeStatus()
  const testProvider = useTestAgentRuntimeProvider()
  const [feedback, setFeedback] = useState<Record<string, OperationFeedback>>({})
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [expandedConfig, setExpandedConfig] = useState<Record<string, boolean>>({})
  const operationLock = useRef(false)
  const canManageRuntime = statusQ.data?.can_manage === true
  const operationInFlight = Boolean(pendingKey) || testProvider.isPending

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
      const result = await testProvider.mutateAsync(provider.runtime_name)
      setFeedback((prev) => ({
        ...prev,
        [provider.runtime_name]: {
          tone: 'success',
          message: successMessage(result),
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

  function toggleConfigExpand(runtimeName: string) {
    setExpandedConfig((prev) => ({ ...prev, [runtimeName]: !prev[runtimeName] }))
  }

  // Action bindings 表格列定义
  const bindingColumns: TableColumn<AgentRuntimeActionBinding>[] = [
    {
      key: 'action',
      title: t('agentRuntime.bindings.col.action', 'Action'),
      render: (row) => <span className="font-mono text-[12px]">{row.action}</span>,
    },
    {
      key: 'kind',
      title: t('agentRuntime.bindings.col.kind', '调用形态'),
      render: (row) => (
        <Chip tone={kindTone(row.kind)}>{kindLabel(row.kind)}</Chip>
      ),
    },
    {
      key: 'default_runtime',
      title: t('agentRuntime.bindings.col.defaultRuntime', '默认 Provider'),
      render: (row) => (
        <span className="font-mono text-[12px]">{row.default_runtime}</span>
      ),
    },
    {
      key: 'expose_selector',
      title: t('agentRuntime.bindings.col.exposeSelector', '可切换'),
      render: (row) => (
        <Chip tone={row.expose_selector ? 'success' : 'neutral'}>
          {row.expose_selector
            ? t('agentRuntime.bindings.switchable', '是')
            : t('agentRuntime.bindings.fixed', '固定')}
        </Chip>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      {/* 区块标题 */}
      <div>
        <h2 className="text-[15px] font-semibold text-1">
          {t('agentRuntime.page.title', 'AI Runtime')}
        </h2>
        <p className="mt-1 text-[12px] text-3">
          {t(
            'agentRuntime.page.subtitle',
            '平台统一管理 OpenAI SDK / LLM API provider 与 Codex SDK 后台任务 provider。',
          )}
        </p>
      </div>

      {/* 加载中 */}
      {statusQ.isLoading ? (
        <Card>
          <CardBody className="text-[12px] text-3">
            {t('agentRuntime.status.loading', '正在加载 AI Runtime 状态…')}
          </CardBody>
        </Card>
      ) : null}

      {/* 加载失败 */}
      {statusQ.isError ? (
        <Card>
          <CardBody className="text-[12px]" style={{ color: 'var(--danger)' }}>
            {t('agentRuntime.status.loadFailed', 'AI Runtime 状态加载失败')}
          </CardBody>
        </Card>
      ) : null}

      {/* 权限提示 */}
      {!statusQ.isLoading && !statusQ.isError && !canManageRuntime ? (
        <Card>
          <CardBody className="text-[12px] text-3">
            {t('agentRuntime.perm.readOnly', '仅平台管理员可执行连接测试和运行态诊断。')}
          </CardBody>
        </Card>
      ) : null}

      {/* 无 provider */}
      {!statusQ.isLoading && !statusQ.isError && providers.length === 0 ? (
        <Card>
          <CardBody className="text-[12px] text-3">
            {t('agentRuntime.provider.empty', '暂无可用 runtime provider。')}
          </CardBody>
        </Card>
      ) : null}

      {/* ——— 上半：提供方卡片 ——— */}
      {providers.map((provider) => {
        const providerFeedback = feedback[provider.runtime_name]
        const operations = providerOperations(provider)
        const operationsDisabled = !canManageRuntime || operationInFlight
        const capabilityKeys = RUNTIME_CAPABILITY_LABELS[provider.runtime_name] ?? []
        const configExpanded = expandedConfig[provider.runtime_name] ?? false

        return (
          <Card key={provider.runtime_name}>
            <CardHead
              title={providerLabel(provider)}
              subtitle={providerDescription(provider)}
              actions={
                <div className="flex flex-wrap items-center gap-1.5">
                  {/* capability 标签 */}
                  {capabilityKeys.map((key) => (
                    <Chip key={key} tone="accent">
                      {key === 'agentRuntime.capability.syncCompletion'
                        ? t('agentRuntime.capability.syncCompletion', '同步补全 + 工具调用')
                        : key === 'agentRuntime.capability.toolCall'
                          ? t('agentRuntime.capability.toolCall', '工具调用对话')
                          : key === 'agentRuntime.capability.asyncAgentic'
                            ? t('agentRuntime.capability.asyncAgentic', '异步 agentic run')
                            : key}
                    </Chip>
                  ))}
                  <Chip tone={statusTone(provider)}>{statusLabel(provider)}</Chip>
                </div>
              }
            />
            <CardBody className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <RuntimeField
                  label={t('agentRuntime.field.configStatus', '配置状态')}
                  value={
                    provider.configured
                      ? t('agentRuntime.field.configured', '已配置')
                      : t('agentRuntime.field.notConfigured', '未配置')
                  }
                />
                <RuntimeField
                  label={t('agentRuntime.field.availability', '可调用状态')}
                  value={availabilityLabel(provider)}
                />
                <RuntimeField
                  label={t('agentRuntime.field.providerStatus', 'Provider 状态')}
                  value={statusLabel(provider)}
                />
                <RuntimeField
                  label={t('agentRuntime.field.operations', '操作')}
                  value={operations.length > 0 ? operations.join(' / ') : t('agentRuntime.field.noOperations', '无')}
                />
              </div>
              <div
                className="rounded border px-3 py-2 text-[12px] text-2"
                style={{ borderColor: 'var(--border)' }}
              >
                {provider.message || t('agentRuntime.field.noMessage', '暂无状态说明')}
              </div>
              <RuntimeDetails provider={provider} />

              {/* 操作按钮行 */}
              <div className="flex flex-wrap items-center gap-2">
                {hasOperation(provider, 'test') ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={pendingKey === `${provider.runtime_name}:test`}
                    disabled={operationsDisabled}
                    onClick={() => runOperation(provider, 'test')}
                  >
                    {t('agentRuntime.action.test', '测试连接')}
                  </Button>
                ) : null}
                {canManageRuntime ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleConfigExpand(provider.runtime_name)}
                  >
                    {configExpanded
                      ? t('agentRuntime.action.hideConfig', '收起配置')
                      : t('agentRuntime.action.editConfig', '编辑配置')}
                  </Button>
                ) : null}
              </div>

              {/* 操作反馈 */}
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

              {/* config 编辑表单（可展开） */}
              {configExpanded ? (
                <ProviderConfigForm
                  runtimeName={provider.runtime_name}
                  canManage={canManageRuntime}
                />
              ) : null}
            </CardBody>
          </Card>
        )
      })}

      {/* ——— 下半：Action bindings 表格 ——— */}
      {actionBindings.length ? (
        <Card>
          <CardHead
            title={t('agentRuntime.bindings.title', 'Action bindings')}
            subtitle={t('agentRuntime.bindings.subtitle', '业务 action 到 runtime 的平台绑定')}
          />
          <CardBody>
            <Table<AgentRuntimeActionBinding>
              columns={bindingColumns}
              rows={actionBindings}
              rowKey={(row) => row.action}
              emptyText={t('agentRuntime.bindings.empty', '暂无 action 绑定')}
            />
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}

function RuntimeDetails({ provider }: { provider: AgentRuntimeProviderStatus }) {
  const details = provider.details && typeof provider.details === 'object' ? provider.details : {}
  const rows = ['provider', 'sdk_package', 'transport', 'project_root', 'runtime_root', 'sandbox']
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

function successMessage(result: AgentRuntimeProviderStatus): string {
  if ('message' in result && result.message) return result.message
  return t('agentRuntime.action.testSuccess', '连接测试已完成')
}
