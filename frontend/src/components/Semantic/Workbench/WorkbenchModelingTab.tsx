import { Bot, CalendarDays, Database, Gauge, Layers3, Sparkles } from 'lucide-react'
import type { CubeDetail, CubeSummary } from '@/api/semantic'

function pickRecommendedMeasures(cubeDetail?: CubeDetail) {
  if (!cubeDetail) return []
  return Object.entries(cubeDetail.measures).slice(0, 4)
}

function pickRecommendedDimensions(cubeDetail?: CubeDetail) {
  if (!cubeDetail) return []
  return Object.entries(cubeDetail.dimensions).filter(([, item]) => item.type !== 'time').slice(0, 4)
}

function pickTimeDimensions(cubeDetail?: CubeDetail) {
  if (!cubeDetail) return []
  return Object.entries(cubeDetail.dimensions).filter(([, item]) => item.type === 'time').slice(0, 3)
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: typeof Database
}) {
  return (
    <div className="rounded-[22px] border border-[hsl(var(--workbench-outline))] bg-white px-4 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-[hsl(var(--workbench-muted-foreground))]">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-3 text-lg font-semibold text-[hsl(var(--workbench-ink))]">{value}</div>
    </div>
  )
}

function RecommendationSection({
  title,
  icon: Icon,
  items,
  emptyText,
}: {
  title: string
  icon: typeof Gauge
  items: Array<[string, { title?: string; type?: string; description?: string | null; certified?: boolean }]>
  emptyText: string
}) {
  return (
    <section className="rounded-[24px] border border-[hsl(var(--workbench-outline))] bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
      <div className="flex items-center gap-2 text-[15px] font-semibold text-[hsl(var(--workbench-ink))]">
        <Icon className="h-4 w-4 text-[hsl(var(--workbench-accent))]" />
        {title}
      </div>
      {items.length > 0 ? (
        <div className="mt-4 space-y-3">
          {items.map(([key, item]) => (
            <div key={key} className="rounded-[18px] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">{item.title || key}</div>
                <div className="font-mono text-xs text-[hsl(var(--workbench-muted-foreground))]">{key}</div>
                {item.certified ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">推荐</span>
                ) : null}
              </div>
              <div className="mt-1 text-sm text-[hsl(var(--workbench-muted-foreground))]">
                {item.description || `类型：${item.type || '未标记'}`}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-[18px] border border-dashed border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] px-4 py-5 text-sm text-[hsl(var(--workbench-muted-foreground))]">
          {emptyText}
        </div>
      )}
    </section>
  )
}

export function WorkbenchModelingTab({
  cube,
  cubeDetail,
}: {
  cube: CubeSummary
  cubeDetail?: CubeDetail
}) {
  const recommendedMeasures = pickRecommendedMeasures(cubeDetail)
  const recommendedDimensions = pickRecommendedDimensions(cubeDetail)
  const timeDimensions = pickTimeDimensions(cubeDetail)
  const sourceSummary = cubeDetail?.source_binding_summary?.source_name
    || cube.source_database
    || '待选择数据源'

  return (
    <div className="space-y-5">
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div className="rounded-[24px] border border-[hsl(var(--workbench-outline))] bg-[linear-gradient(180deg,rgba(248,251,255,0.98),rgba(255,255,255,0.96))] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
          <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--workbench-accent-soft))] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[hsl(var(--workbench-accent))]">
            <Bot className="h-3.5 w-3.5" />
            建模
          </div>
          <div className="mt-4 space-y-3">
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[hsl(var(--workbench-ink))]">AI 辅助建模</h2>
            <p className="max-w-3xl text-sm leading-7 text-[hsl(var(--workbench-muted-foreground))]">
              先确认来源摘要，再采纳推荐指标、维度和日期属性。这里先承接结构化起始信息，后续再接入自动生成与会话式修改。
            </p>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <MetricCard label="来源摘要" value={sourceSummary} icon={Database} />
            <MetricCard label="推荐指标" value={`${recommendedMeasures.length} 项`} icon={Gauge} />
            <MetricCard label="推荐维度" value={`${recommendedDimensions.length} 项`} icon={Layers3} />
          </div>
        </div>

        <div className="rounded-[24px] border border-[hsl(var(--workbench-outline))] bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-[hsl(var(--workbench-ink))]">
            <Sparkles className="h-4 w-4 text-[hsl(var(--workbench-accent))]" />
            下一步建议
          </div>
          <div className="mt-4 space-y-3">
            {[
              `确认 ${cube.title} 的业务口径和主表命名。`,
              '优先补齐关键时间字段，确保预览页能直接生成时间序列查询。',
              '完成推荐项检查后，再进入 YAML 做精修与校验。',
            ].map((item) => (
              <div key={item} className="rounded-[18px] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] px-4 py-3 text-sm leading-6 text-[hsl(var(--workbench-muted-foreground))]">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <RecommendationSection
          title="推荐指标"
          icon={Gauge}
          items={recommendedMeasures}
          emptyText="当前还没有可推荐的指标。"
        />
        <RecommendationSection
          title="推荐维度"
          icon={Layers3}
          items={recommendedDimensions}
          emptyText="当前还没有可推荐的维度。"
        />
      </section>

      <section className="rounded-[24px] border border-[hsl(var(--workbench-outline))] bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
        <div className="flex items-center gap-2 text-[15px] font-semibold text-[hsl(var(--workbench-ink))]">
          <CalendarDays className="h-4 w-4 text-[hsl(var(--workbench-accent))]" />
          日期属性
        </div>
        {timeDimensions.length > 0 ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {timeDimensions.map(([key, item]) => (
              <div key={key} className="rounded-[18px] border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] px-4 py-3">
                <div className="text-sm font-semibold text-[hsl(var(--workbench-ink))]">{item.title || key}</div>
                <div className="mt-1 font-mono text-xs text-[hsl(var(--workbench-muted-foreground))]">{key}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-[18px] border border-dashed border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-panel))] px-4 py-5 text-sm text-[hsl(var(--workbench-muted-foreground))]">
            当前还没有识别到日期属性。
          </div>
        )}
      </section>
    </div>
  )
}
