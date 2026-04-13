import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { CubeSummary } from '@/api/semantic'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { WorkbenchCubeDraftStarter } from './WorkbenchCubeDraftStarter'

function getStatusLabel(status?: string) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'active') return '已发布'
  if (normalized === 'draft') return '草稿'
  return '未标记'
}

function getStatusVariant(status?: string): 'default' | 'secondary' | 'outline' {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'active') return 'default'
  if (normalized === 'draft') return 'secondary'
  return 'outline'
}

export function WorkbenchStartPanel({
  draftCubes,
  publishedCubes,
}: {
  draftCubes: CubeSummary[]
  publishedCubes: CubeSummary[]
}) {
  const allCubes = [...draftCubes, ...publishedCubes]

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">语义工作台</h2>
          <p className="mt-0.5 text-xs text-slate-500">选择数据源和物理表，使用 AI 辅助建模创建 Cube。</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>草稿 <strong className="text-slate-900">{draftCubes.length}</strong></span>
          <span className="h-3 w-px bg-slate-200" />
          <span>已发布 <strong className="text-slate-900">{publishedCubes.length}</strong></span>
        </div>
      </div>

      <WorkbenchCubeDraftStarter />

      {allCubes.length > 0 && (
        <section>
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h3 className="text-xs font-medium text-slate-500">最近工作</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                <th className="py-2 pr-4">名称</th>
                <th className="py-2 pr-4">状态</th>
                <th className="py-2 pr-4">数据源</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {allCubes.slice(0, 8).map((cube) => (
                <tr key={cube.name} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="py-2 pr-4">
                    <div className="font-medium text-slate-900">{cube.title || cube.name}</div>
                    <div className="font-mono text-xs text-slate-400">{cube.name}</div>
                  </td>
                  <td className="py-2 pr-4">
                    <Badge variant={getStatusVariant(cube.status)}>{getStatusLabel(cube.status)}</Badge>
                  </td>
                  <td className="py-2 pr-4 text-xs text-slate-500">{cube.table || '—'}</td>
                  <td className="py-2 text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/semantic/workbench?cube=${encodeURIComponent(cube.name)}`}>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {allCubes.length === 0 && (
        <div className="rounded-md border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
          还没有 Cube 对象。从上方选择数据源和物理表，生成第一个 Cube 草稿。
        </div>
      )}
    </div>
  )
}
