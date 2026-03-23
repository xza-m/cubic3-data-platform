import { ArrowUpRight, Blocks, Eye } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { CubeSummary, MaterializeStatus, ViewSummary } from '@/api/semantic'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  formatSummaryTime,
  getCubeAttentionReasons,
  getCubePrimaryStatus,
  getCubePublishLabel,
  getCubeRailTone,
  getCubeSourceLabel,
  getCubeSyncLabel,
  inferCubeCategory,
  isCubeInDomain,
  isCubeSourceBound,
  getViewPublishLabel,
} from './cubeListUtils'

type ObjectKind = 'cube' | 'view'

interface CubeTableProps {
  kind: ObjectKind
  cubes: CubeSummary[]
  views: ViewSummary[]
  selectedName: string
  materializeStatusMap?: Record<string, MaterializeStatus>
  onSelect: (name: string) => void
}

export function CubeTable({
  kind,
  cubes,
  views,
  selectedName,
  materializeStatusMap,
  onSelect,
}: CubeTableProps) {
  if (kind === 'view') {
    return (
      <div className="overflow-hidden">
        <Table>
          <TableHeader className="bg-[rgba(248,250,252,0.92)]">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[42%]">View</TableHead>
              <TableHead>可见性</TableHead>
              <TableHead>引用</TableHead>
              <TableHead>发布状态</TableHead>
              <TableHead className="w-[130px] text-right">动作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {views.map((item) => {
              const selected = item.name === selectedName
              return (
                <TableRow
                  key={item.name}
                  className={cn(
                    'cursor-pointer border-b border-[hsl(var(--workbench-outline))] bg-transparent',
                    selected && 'bg-[hsl(var(--workbench-accent-soft))]/60',
                  )}
                  onClick={() => onSelect(item.name)}
                  data-testid={`cube-management-item-${item.name}`}
                >
                  <TableCell className="py-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-lg border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface-2))] p-2 text-[hsl(var(--workbench-muted-foreground))]">
                        <Eye className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-[hsl(var(--workbench-ink))]">
                          {item.title}
                        </div>
                        <div className="mt-1 truncate font-mono text-xs text-[hsl(var(--workbench-muted-foreground))]">
                          {item.name}
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs leading-5 text-[hsl(var(--workbench-muted-foreground))]">
                          {item.description || '当前 View 还没有补充说明。'}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{item.public ? '公开' : '私有'}</TableCell>
                  <TableCell>{item.cube_count} 个 Cube</TableCell>
                  <TableCell>{getViewPublishLabel(item, materializeStatusMap?.[item.name])}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="rounded-full px-3"
                      onClick={(event) => event.stopPropagation()}
                      data-testid={`cube-open-design-${item.name}`}
                    >
                      <Link to={`/semantic/views/${item.name}`}>
                        查看
                        <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    )
  }

  return (
    <div className="overflow-hidden">
      <Table>
        <TableHeader className="bg-[rgba(248,250,252,0.92)]">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-3 p-0" />
            <TableHead className="w-[26%]">对象</TableHead>
            <TableHead>当前状态</TableHead>
            <TableHead>来源绑定</TableHead>
            <TableHead>领域归属</TableHead>
            <TableHead>模型结构</TableHead>
            <TableHead>最近变更</TableHead>
            <TableHead className="w-[130px] text-right">动作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cubes.map((item) => {
            const selected = item.name === selectedName
            const attentionReasons = getCubeAttentionReasons(item)

            return (
              <TableRow
                key={item.name}
                className={cn(
                  'cursor-pointer border-b border-[hsl(var(--workbench-outline))] bg-transparent',
                  selected && 'bg-[hsl(var(--workbench-accent-soft))]/60',
                )}
                onClick={() => onSelect(item.name)}
                data-testid={`cube-management-item-${item.name}`}
              >
                <TableCell className="w-3 p-0">
                  <div className={cn('h-full min-h-[112px] w-full', getCubeRailTone(item))} aria-hidden="true" />
                </TableCell>
                <TableCell className="py-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-lg border border-[hsl(var(--workbench-outline))] bg-[hsl(var(--workbench-surface-2))] p-2 text-[hsl(var(--workbench-muted-foreground))]">
                      <Blocks className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[hsl(var(--workbench-ink))]">
                        {item.title}
                      </div>
                      <div className="mt-1 truncate font-mono text-xs text-[hsl(var(--workbench-muted-foreground))]">
                        {item.name}
                      </div>
                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-[hsl(var(--workbench-muted-foreground))]">
                        {item.description || '当前 Cube 还没有补充业务说明。'}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-2">
                    <Badge variant="outline" className="border-transparent bg-[hsl(var(--workbench-panel))] text-[hsl(var(--workbench-ink))]">
                      {getCubePrimaryStatus(item)}
                    </Badge>
                    <div className="text-xs leading-5 text-[hsl(var(--workbench-muted-foreground))]">
                      {getCubePublishLabel(item)} / {getCubeSyncLabel(item)}
                    </div>
                    {attentionReasons.length ? (
                      <div className="text-xs leading-5 text-[hsl(var(--semantic-warn))]">
                        {attentionReasons.join(' · ')}
                      </div>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm text-[hsl(var(--workbench-ink))]">{getCubeSourceLabel(item)}</div>
                  <div className="mt-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">
                    {isCubeSourceBound(item) ? '来源已确认' : '需要补充来源绑定'}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm text-[hsl(var(--workbench-ink))]">
                    {item.domain_name || '未归属领域'}
                  </div>
                  <div className="mt-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">
                    {isCubeInDomain(item) ? '已纳入领域治理' : '建议补充领域归属'}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm text-[hsl(var(--workbench-ink))]">
                    {item.dimension_count} 维度 / {item.measure_count} 指标
                  </div>
                  <div className="mt-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">
                    {inferCubeCategory(item)}
                    {typeof item.join_count === 'number' ? ` · ${item.join_count} Join` : ''}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm text-[hsl(var(--workbench-ink))]">
                    {formatSummaryTime(item.state_summary?.updated_at)}
                  </div>
                  <div className="mt-1 text-xs text-[hsl(var(--workbench-muted-foreground))]">
                    {item.state_summary?.last_published_at ? `最近发布 ${formatSummaryTime(item.state_summary.last_published_at)}` : '尚无发布记录'}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="rounded-full px-3"
                    onClick={(event) => event.stopPropagation()}
                    data-testid={`cube-open-design-${item.name}`}
                  >
                    <Link to={`/semantic/cubes/${item.name}/edit`}>
                      设计
                      <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
