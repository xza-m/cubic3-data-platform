/**
 * FormSelect - 统一的 Select 组件
 * 用于表单和筛选器场景
 */
import { useState } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"

export interface SelectOption {
  label: string
  value: string
  disabled?: boolean
  desc?: string // 可选描述
  badge?: string // 可选徽章
}

interface FormSelectProps {
  value?: string
  onValueChange?: (value: string) => void
  onChange?: (value: string) => void // 向后兼容的别名
  options: SelectOption[]
  placeholder?: string
  className?: string
  disabled?: boolean
  searchable?: boolean // 是否支持搜索
  renderOption?: (option: SelectOption) => React.ReactNode // 自定义选项渲染
  id?: string // HTML id属性
}

export function FormSelect({
  value,
  onValueChange,
  onChange,
  options,
  placeholder = "请选择",
  className,
  disabled,
  searchable = false,
  renderOption,
  id,
}: FormSelectProps) {
  const [searchTerm, setSearchTerm] = useState("")
  
  // 优先使用 onValueChange，向后兼容 onChange
  const handleValueChange = onValueChange || onChange

  // 过滤选项（如果启用搜索）
  const filteredOptions = searchable && searchTerm
    ? options.filter(option =>
        option.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        option.value.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : options

  return (
    <Select value={value} onValueChange={handleValueChange} disabled={disabled}>
      <SelectTrigger className={className} id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {searchable && (
          <div className="flex items-center border-b px-3 pb-2">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Input
              placeholder="搜索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8 border-0 text-[0.875rem] leading-5 focus-visible:ring-0 focus-visible:ring-offset-0"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
        )}
        {filteredOptions.length === 0 ? (
          <div className="py-6 text-center text-[0.875rem] leading-5 text-gray-500">
            没有找到匹配项
          </div>
        ) : (
          filteredOptions.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {renderOption ? renderOption(option) : option.label}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  )
}

// Export SelectOption type for convenience
export type { SelectOption as FormSelectOption }
