/**
 * FormInput - 统一的 Input 组件
 * 支持多种变体：text, password, search, textarea
 */
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { Search } from "lucide-react"

interface BaseInputProps {
  value?: string
  onChange?: ((value: string) => void) | ((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void)  // Support both types
  placeholder?: string
  className?: string
  disabled?: boolean
}

// Text Input
interface FormInputProps extends BaseInputProps {
  type?: "text" | "email" | "number" | "tel" | "url"
  min?: number
  max?: number
}

export function FormInput({
  value,
  onChange,
  type = "text",
  placeholder,
  className,
  disabled,
  min,
  max,
}: FormInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onChange) {
      // Support both (value: string) => void and (e: ChangeEvent) => void
      try {
        (onChange as (value: string) => void)(e.target.value);
      } catch {
        (onChange as (e: React.ChangeEvent<HTMLInputElement>) => void)(e);
      }
    }
  };
  
  return (
    <Input
      type={type}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      min={min}
      max={max}
    />
  )
}

// Password Input
export function FormPassword({
  value,
  onChange,
  placeholder = "Enter password",
  className,
  disabled,
}: BaseInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onChange) {
      try {
        (onChange as (value: string) => void)(e.target.value);
      } catch {
        (onChange as (e: React.ChangeEvent<HTMLInputElement>) => void)(e);
      }
    }
  };
  
  return (
    <Input
      type="password"
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
    />
  )
}

// Search Input
export function FormSearch({
  value,
  onChange,
  placeholder = "Search...",
  className,
  disabled,
}: BaseInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onChange) {
      try {
        (onChange as (value: string) => void)(e.target.value);
      } catch {
        (onChange as (e: React.ChangeEvent<HTMLInputElement>) => void)(e);
      }
    }
  };
  
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className={cn("pl-9", className)}
        disabled={disabled}
      />
    </div>
  )
}

// Textarea
interface FormTextareaProps extends BaseInputProps {
  rows?: number
}

export function FormTextarea({
  value,
  onChange,
  placeholder,
  className,
  disabled,
  rows = 3,
}: FormTextareaProps) {
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (onChange) {
      try {
        (onChange as (value: string) => void)(e.target.value);
      } catch {
        (onChange as (e: React.ChangeEvent<HTMLTextAreaElement>) => void)(e);
      }
    }
  };
  
  return (
    <Textarea
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      rows={rows}
    />
  )
}
