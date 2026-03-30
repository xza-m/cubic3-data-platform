import { Pencil } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { CubeSummary } from '@/api/semantic'
import { SemanticObjectIdentity } from '@/components/Semantic/SemanticObjectIdentity'
import { SemanticStatusBlock } from '@/components/Semantic/SemanticStatusBlock'
import { SemanticStructureSummary } from '@/components/Semantic/SemanticStructureSummary'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
  getCubeRailTone,
  getCubeSyncLabel,
  getCubeViewCountLabel,
  inferCubeCategory,
  isCubeInDomain,
} from './cubeListUtils'

interface CubeTableProps {
  cubes: CubeSummary[]
  selectedName: string
  onSelect: (name: string) => void
  selectedNames?: string[]
  onToggleSelect?: (name: string, checked: boolean) => void
  onToggleSelectAll?: (checked: boolean) => void
}

export function CubeTable({
  cubes,
  selectedName,
  onSelect,
  selectedNames = [],
  onToggleSelect,
  onToggleSelectAll,
}: CubeTableProps) {
  return (
    <div className="overflow-hidden">
      <Table className="[&_td]:align-top [&_th]:text-[10.5px] [&_th]:font-semibold [&_th]:tracking-[0.01em] [&_th]:text-[hsl(var(--workbench-muted-foreground))]">
        <TableHeader className="bg-[rgba(248,250,252,0.92)]">
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-9 w-[38px] px-2">
              <Checkbox
                checked={cubes.length > 0 && selectedNames.length === cubes.length}
                onCheckedChange={(checked) => onToggleSelectAll?.(Boolean(checked))}
                aria-label="全选当前页 Cube"
              />
            </TableHead>
            <TableHead className="w-3 p-0" />
            <TableHead className="h-9 w-[56%] px-3">Cube</TableHead>
            <TableHead className="h-9 w-[18%] px-3">状态</TableHead>
            <TableHead className="h-9 w-[18%] px-3">更新</TableHead>
            <TableHead className="h-9 w-[52px] px-2.5 text-right">动作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cubes.map((item) => {
            const selected = item.name === selectedName
            const checked = selectedNames.includes(item.name)
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
                <TableCell className="px-2 py-2.5">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) => onToggleSelect?.(item.name, Boolean(value))}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`选择 ${item.title || item.name}`}
                  />
                </TableCell>
                <TableCell className="w-3 p-0">
                  <div className={cn('h-full min-h-[72px] w-full', getCubeRailTone(item))} aria-hidden="true" />
                </TableCell>
                <TableCell className="px-3 py-3">
                  <div className="min-w-0">
                    <SemanticObjectIdentity
                      title={item.title}
                      code={item.name}
                      description={item.description}
                      meta={[
                        inferCubeCategory(item),
                        item.domain_count > 1 ? '多领域引用' : null,
                        item.domain_name || '未纳入领域',
                      ]}
                    />
                    <SemanticStructureSummary
                      className="mt-2"
                      items={[
                        { label: '维度', value: item.dimension_count },
                        { label: '指标', value: item.measure_count },
                        { label: 'View', value: getCubeViewCountLabel(item) },
                      ]}
                    />
                  </div>
                </TableCell>
                <TableCell className="px-3 py-3">
                  <SemanticStatusBlock
                    status={getCubePrimaryStatus(item)}
                    hint={attentionReasons.length ? attentionReasons.join(' · ') : getCubeSyncLabel(item)}
                    warning={attentionReasons.length > 0}
                  />
                </TableCell>
                <TableCell className="px-3 py-3">
                  <div className="text-[12px] leading-5 text-[hsl(var(--workbench-ink))]">
                    {formatSummaryTime(item.state_summary?.updated_at)}
                  </div>
                  <div
                    className="mt-1 line-clamp-1 text-[10.5px] leading-4 text-[hsl(var(--workbench-muted-foreground))]"
                    title={
                      item.state_summary?.last_published_at
                        ? `最近发布 ${formatSummaryTime(item.state_summary.last_published_at)}`
                        : (isCubeInDomain(item) ? '已纳入领域' : '未纳入领域')
                    }
                  >
                    {item.state_summary?.last_published_at
                      ? `最近发布 ${formatSummaryTime(item.state_summary.last_published_at)}`
                      : (isCubeInDomain(item) ? '已纳入领域' : '未纳入领域')}
                  </div>
                </TableCell>
                <TableCell className="px-2.5 py-2.5 text-right">
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 rounded-md p-0"
                    onClick={(event) => event.stopPropagation()}
                    data-testid={`cube-open-design-${item.name}`}
                  >
                    <Link to={`/semantic/cubes/${item.name}/edit`} aria-label={`编辑 ${item.title || item.name}`}>
                      <Pencil className="h-3.5 w-3.5" />
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
