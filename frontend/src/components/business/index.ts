/**
 * Business Components - 统一导出
 * 这些组件是对 shadcn/ui 组件的业务封装
 */

// Form Components
export { FormSelect, type FormSelectOption } from './FormSelect'
export { FormInput, FormPassword, FormSearch, FormTextarea } from './FormInput'
export { FormButton } from './FormButton'
export { FormDatePicker, FormRangePicker, FormRangeDatePicker } from './FormDatePicker'
export type { FormDatePickerProps, FormRangePickerProps } from './FormDatePicker'

// Layout Components
export { PageCard } from './PageCard'
export { PageModal } from './PageModal'
export { PageDrawer } from './PageDrawer'
export { PageTabs, PageTabsContent, PageTabsList, PageTabsTrigger } from './PageTabs'

// Data Display
export { DataTable, type DataTableColumn, type DataTableProps } from './DataTable'
export { Statistic } from './Statistic'

// Schema Browser
export { default as SchemaBrowser } from './SchemaBrowser/SchemaBrowser'
export type { SchemaBrowserProps } from './SchemaBrowser/types'

// Dialogs
export { default as SaveAsDatasetDialog } from './SaveAsDatasetDialog'

// Re-export commonly used shadcn/ui components for convenience
export { Badge } from '@/components/ui/badge'
export { Skeleton } from '@/components/ui/skeleton'
export { Separator } from '@/components/ui/separator'
export { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
export { Checkbox } from '@/components/ui/checkbox'
export { Switch } from '@/components/ui/switch'
export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip'
export { useToast } from '@/hooks/use-toast'
export { Toaster } from '@/components/ui/toaster'
