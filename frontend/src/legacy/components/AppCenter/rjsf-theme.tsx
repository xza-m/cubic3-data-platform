/**
 * 自定义 RJSF 主题 — 将所有表单控件映射到 shadcn/ui 组件
 */
import { useState } from 'react'
import type {
  FieldTemplateProps,
  ObjectFieldTemplateProps,
  TitleFieldProps,
  DescriptionFieldProps,
  BaseInputTemplateProps,
  WidgetProps,
  RegistryWidgetsType,
  TemplatesType,
  RJSFSchema,
} from '@rjsf/utils'
import { getInputProps } from '@rjsf/utils'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Templates                                                          */
/* ------------------------------------------------------------------ */

function FieldTemplate(props: FieldTemplateProps) {
  const {
    id,
    label,
    children,
    errors,
    rawErrors,
    help,
    description,
    hidden,
    required,
    displayLabel,
    schema,
  } = props

  if (hidden) return <div className="hidden">{children}</div>

  const isObject = schema.type === 'object'
  if (isObject) return children

  return (
    <div className="space-y-1.5">
      {displayLabel && label && (
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </Label>
      )}
      {children}
      {displayLabel && description}
      {rawErrors && rawErrors.length > 0 && (
        <div className="text-sm text-destructive">{errors}</div>
      )}
      {help}
    </div>
  )
}

function ObjectFieldTemplate(props: ObjectFieldTemplateProps) {
  const { title, description, properties, idSchema, uiSchema } = props
  const isRoot = idSchema.$id === 'root'
  const defaultCollapsed = uiSchema?.['ui:options']?.collapsed === true
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  if (isRoot) {
    return <div className="space-y-4">{properties.map((p) => p.content)}</div>
  }

  return (
    <div className="border rounded-lg">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="font-medium text-sm">{title}</span>
      </button>
      {!collapsed && (
        <div className="px-4 pb-4 space-y-4">
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
          {properties.map((p) => p.content)}
        </div>
      )}
    </div>
  )
}

function TitleFieldTemplate(props: TitleFieldProps) {
  const { title, id } = props
  return (
    <h4 id={id} className="font-medium text-sm">
      {title}
    </h4>
  )
}

function DescriptionFieldTemplate(props: DescriptionFieldProps) {
  const { description, id } = props
  if (!description) return null
  return (
    <p id={id} className="text-sm text-muted-foreground">
      {description}
    </p>
  )
}

function BaseInputTemplate(props: BaseInputTemplateProps) {
  const {
    id,
    type,
    value,
    disabled,
    readonly,
    autofocus,
    onBlur,
    onFocus,
    onChange,
    options,
    schema,
    rawErrors,
  } = props

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inputProps = getInputProps<any, RJSFSchema>(schema, type, options)

  return (
    <Input
      id={id}
      {...inputProps}
      className={cn(
        type === 'number' && '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
        rawErrors && rawErrors.length > 0 && 'border-destructive',
      )}
      value={value ?? ''}
      disabled={disabled}
      readOnly={readonly}
      autoFocus={autofocus}
      onChange={(e) => onChange(e.target.value === '' ? options.emptyValue : e.target.value)}
      onBlur={(e) => onBlur(id, e.target.value)}
      onFocus={(e) => onFocus(id, e.target.value)}
    />
  )
}

/* ------------------------------------------------------------------ */
/*  Widgets                                                            */
/* ------------------------------------------------------------------ */

function TextWidget(props: WidgetProps) {
  const { id, value, disabled, readonly, autofocus, onChange, onBlur, onFocus, rawErrors } = props
  return (
    <Input
      id={id}
      type="text"
      className={cn(rawErrors && rawErrors.length > 0 && 'border-destructive')}
      value={value ?? ''}
      disabled={disabled}
      readOnly={readonly}
      autoFocus={autofocus}
      onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
      onBlur={(e) => onBlur(id, e.target.value)}
      onFocus={(e) => onFocus(id, e.target.value)}
    />
  )
}

function TextareaWidget(props: WidgetProps) {
  const { id, value, disabled, readonly, autofocus, onChange, onBlur, onFocus, rawErrors, options } = props
  return (
    <Textarea
      id={id}
      className={cn('font-mono text-sm', rawErrors && rawErrors.length > 0 && 'border-destructive')}
      rows={(options.rows as number) || 4}
      value={value ?? ''}
      disabled={disabled}
      readOnly={readonly}
      autoFocus={autofocus}
      onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
      onBlur={(e) => onBlur(id, e.target.value)}
      onFocus={(e) => onFocus(id, e.target.value)}
    />
  )
}

function PasswordWidget(props: WidgetProps) {
  const { id, value, disabled, readonly, autofocus, onChange, onBlur, onFocus, rawErrors } = props
  return (
    <Input
      id={id}
      type="password"
      className={cn(rawErrors && rawErrors.length > 0 && 'border-destructive')}
      value={value ?? ''}
      disabled={disabled}
      readOnly={readonly}
      autoFocus={autofocus}
      onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
      onBlur={(e) => onBlur(id, e.target.value)}
      onFocus={(e) => onFocus(id, e.target.value)}
    />
  )
}

function SelectWidget(props: WidgetProps) {
  const { id, value, disabled, readonly, options, onChange, rawErrors } = props
  const { enumOptions = [] } = options

  return (
    <Select
      value={value != null ? String(value) : undefined}
      onValueChange={(v) => onChange(v)}
      disabled={disabled || readonly}
    >
      <SelectTrigger
        id={id}
        className={cn(rawErrors && rawErrors.length > 0 && 'border-destructive')}
      >
        <SelectValue placeholder="请选择" />
      </SelectTrigger>
      <SelectContent>
        {enumOptions.map((opt: { value: string; label: string }) => (
          <SelectItem key={opt.value} value={String(opt.value)}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function CheckboxWidget(props: WidgetProps) {
  const { id, value, disabled, readonly, label, onChange } = props
  return (
    <div className="flex items-center gap-2">
      <Switch
        id={id}
        checked={!!value}
        onCheckedChange={(checked) => onChange(checked)}
        disabled={disabled || readonly}
      />
      {label && (
        <Label htmlFor={id} className="text-sm font-normal cursor-pointer">
          {label}
        </Label>
      )}
    </div>
  )
}

function NumberWidget(props: WidgetProps) {
  const { id, value, disabled, readonly, autofocus, onChange, onBlur, onFocus, rawErrors, schema } = props
  return (
    <Input
      id={id}
      type="number"
      className={cn(
        '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
        rawErrors && rawErrors.length > 0 && 'border-destructive',
      )}
      value={value ?? ''}
      min={schema.minimum}
      max={schema.maximum}
      disabled={disabled}
      readOnly={readonly}
      autoFocus={autofocus}
      onChange={(e) => {
        const v = e.target.value
        onChange(v === '' ? undefined : Number(v))
      }}
      onBlur={(e) => onBlur(id, e.target.value)}
      onFocus={(e) => onFocus(id, e.target.value)}
    />
  )
}

/* ------------------------------------------------------------------ */
/*  Exports                                                            */
/* ------------------------------------------------------------------ */

export const templates: Partial<TemplatesType> = {
  FieldTemplate,
  ObjectFieldTemplate,
  TitleFieldTemplate,
  DescriptionFieldTemplate,
  BaseInputTemplate,
}

export const widgets: RegistryWidgetsType = {
  TextWidget,
  TextareaWidget,
  PasswordWidget,
  SelectWidget,
  CheckboxWidget,
  NumberWidget,
}
