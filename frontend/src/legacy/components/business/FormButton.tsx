/**
 * FormButton - 统一的 Button 组件
 * 支持多种变体和加载状态
 * 使用 forwardRef 以支持 DropdownMenuTrigger 等组件的 asChild 属性
 */
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import type { ButtonProps } from "@/components/ui/button"

interface FormButtonProps extends Omit<ButtonProps, 'children'> {
  children: React.ReactNode
  loading?: boolean
  icon?: React.ReactNode
}

const FormButton = React.forwardRef<HTMLButtonElement, FormButtonProps>(
  ({ children, loading = false, disabled, icon, ...props }, ref) => {
    return (
      <Button ref={ref} {...props} disabled={disabled || loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {!loading && icon && <span className="mr-2">{icon}</span>}
        {children}
      </Button>
    )
  }
)

FormButton.displayName = "FormButton"

export { FormButton }
