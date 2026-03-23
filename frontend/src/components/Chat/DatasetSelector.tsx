/**
 * 数据集选择器组件 - Migrated to shadcn/ui
 */
import { useQuery } from '@tanstack/react-query'
import { getDatasets } from '../../api/datasets'
import { FormSelect } from '@/components/business'
import type { Dataset } from '@/types'

interface DatasetSelectorProps {
  value?: number
  onChange: (value: number) => void
}

export default function DatasetSelector({ value, onChange }: DatasetSelectorProps) {
  const { data: datasetsData, isLoading } = useQuery({
    queryKey: ['datasets'],
    queryFn: () => getDatasets({ page: 1, page_size: 100 })
  })

  const datasets = datasetsData?.data?.items || []

  return (
    <FormSelect
      value={value?.toString()}
      onValueChange={(val: string) => onChange(Number(val))}
      placeholder="选择数据集"
      disabled={isLoading}
      options={datasets.map((ds: Dataset) => ({
        value: ds.id.toString(),
        label: `${ds.dataset_name} - ${ds.physical_table} • ${ds.field_count || 0} 字段`
      }))}
      className="w-full"
    />
  )
}
