import { ArrowRight, Bot, Layers3, Sparkles, Wand2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { CubeSummary } from '@/api/semantic'
import { WorkbenchCubeDraftStarter } from './WorkbenchCubeDraftStarter'
import { WorkbenchResumePanel } from './WorkbenchResumePanel'

export function WorkbenchStartPanel({
  draftCubes,
  publishedCubes,
}: {
  draftCubes: CubeSummary[]
  publishedCubes: CubeSummary[]
}) {
  const featuredDraft = draftCubes[0] ?? null

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-[hsl(var(--workbench-outline))] bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.12),transparent_36%),linear-gradient(135deg,#071A2F_0%,#0F2A4A_56%,#ECF6FF_170%)] shadow-[0_28px_70px_rgba(15,23,42,0.16)]">
        <div className="grid gap-6 px-5 py-6 text-white lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.8fr)] lg:px-7">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/78">
              <Sparkles className="h-3.5 w-3.5" />
              AI 优先开发流
            </div>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-[-0.05em] md:text-[2.7rem]">语义工作台</h1>
              <p className="max-w-3xl text-[1rem] leading-8 text-white/74">
                先用 AI 辅助建模起草 Cube 骨架，再在工作台里完成预览、YAML 校验与发布准备。没有当前对象时，这里就是你的开发流首屏。
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {[
                { label: '起步方式', value: 'AI 辅助建模', icon: Bot },
                { label: '最近工作', value: `${draftCubes.length} 个草稿`, icon: Wand2 },
                { label: '已发布资产', value: `${publishedCubes.length} 个 Cube`, icon: Layers3 },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.label} className="rounded-[22px] border border-white/10 bg-white/8 px-4 py-4 backdrop-blur">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-white/62">
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </div>
                    <div className="mt-3 text-lg font-semibold text-white">{item.value}</div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/8 p-5 backdrop-blur">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/62">AI 辅助建模</div>
              <div className="text-2xl font-semibold tracking-[-0.03em] text-white">从 workbench 首屏直接完成最小创建</div>
              <p className="text-sm leading-7 text-white/72">
                现在可以在首屏里直接选择数据源与物理表，生成 Cube 草稿并保存为 Draft Cube，再进入对象态继续建模。
              </p>
            </div>
            <div className="mt-5 space-y-3">
              {[
                '1. 选择数据源与物理表，生成一版最小 Cube 草稿。',
                '2. 在首屏补草稿名称与标题，并保存为 Draft Cube。',
                '3. 保存后自动进入对象态，继续补维度、指标和预览校验。',
              ].map((step) => (
                <div key={step} className="rounded-[18px] border border-white/10 bg-slate-950/16 px-4 py-3 text-sm leading-6 text-white/76">
                  {step}
                </div>
              ))}
            </div>
            {featuredDraft ? (
              <Link
                to={`/semantic/workbench?cube=${encodeURIComponent(featuredDraft.name)}`}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-white/92"
              >
                继续最近草稿
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <WorkbenchCubeDraftStarter />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <WorkbenchResumePanel
          title="继续工作"
          description="从最近的草稿或已发布对象恢复上下文，快速回到工作台对象态。"
          cubes={[...draftCubes.slice(0, 2), ...publishedCubes.slice(0, 2)]}
          emptyText="当前还没有可以继续的工作对象。"
        />
        <WorkbenchResumePanel
          title="最近草稿"
          description="优先返回尚未发布的建模草稿，继续完善推荐指标、维度和日期属性。"
          cubes={draftCubes}
          emptyText="还没有草稿对象，后续可从 AI 起始面板生成第一版。"
        />
      </section>

      <WorkbenchResumePanel
        title="最近发布"
        description="已发布对象会默认进入预览，用来查看 DSL、SQL 与执行反馈。"
        cubes={publishedCubes}
        emptyText="还没有已发布 Cube。"
      />
    </div>
  )
}
