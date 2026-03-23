# shadcn/ui 快速开始指南

## 🎯 新功能开发指南

### 1. 导入业务组件

```typescript
import { 
  FormSelect, 
  FormInput, 
  FormButton, 
  FormDatePicker,
  FormRangePicker,
  PageCard, 
  PageModal,
  PageDrawer,
  DataTable,
  Statistic,
  Badge,
  Skeleton,
  useToast
} from '@/components/business'
```

### 2. 基础表单示例

```typescript
function MyForm() {
  const [value, setValue] = useState('')
  const [date, setDate] = useState<Date>()
  const { toast } = useToast()

  const handleSubmit = () => {
    toast({ title: "提交成功！" })
  }

  return (
    <PageCard title="表单标题" description="表单描述">
      <div className="space-y-4">
        <FormInput
          placeholder="输入内容..."
          value={value}
          onChange={setValue}
        />
        
        <FormSelect
          placeholder="选择选项"
          value={value}
          onChange={setValue}
          options={[
            { label: '选项1', value: '1' },
            { label: '选项2', value: '2' },
          ]}
        />
        
        <FormDatePicker
          value={date}
          onChange={setDate}
          placeholder="选择日期"
        />
        
        <FormButton onClick={handleSubmit}>
          提交
        </FormButton>
      </div>
    </PageCard>
  )
}
```

### 3. 数据表格示例

```typescript
function MyTable() {
  const { data, isLoading } = useQuery({
    queryKey: ['items'],
    queryFn: fetchItems
  })

  const columns: DataTableColumn[] = [
    {
      key: 'name',
      title: '名称',
      dataIndex: 'name',
    },
    {
      key: 'status',
      title: '状态',
      render: (_, record) => (
        <Badge variant="secondary">{record.status}</Badge>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      render: (_, record) => (
        <FormButton 
          variant="ghost" 
          size="sm"
          onClick={() => handleEdit(record)}
        >
          编辑
        </FormButton>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={data?.items || []}
      loading={isLoading}
      pagination={{
        current: 1,
        pageSize: 20,
        total: data?.total || 0,
        onChange: (page, pageSize) => console.log(page, pageSize)
      }}
    />
  )
}
```

### 4. 模态框和抽屉示例

```typescript
function MyComponent() {
  const [modalOpen, setModalOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <>
      <FormButton onClick={() => setModalOpen(true)}>
        打开模态框
      </FormButton>
      
      <PageModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="模态框标题"
        description="这是描述"
      >
        <div>模态框内容</div>
      </PageModal>

      <PageDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="抽屉标题"
        side="right"
      >
        <div>抽屉内容</div>
      </PageDrawer>
    </>
  )
}
```

### 5. 通知提示示例

```typescript
function MyComponent() {
  const { toast } = useToast()

  const handleSuccess = () => {
    toast({
      title: "操作成功",
      description: "数据已保存",
    })
  }

  const handleError = () => {
    toast({
      title: "操作失败",
      description: "请稍后重试",
      variant: "destructive",
    })
  }

  return (
    <>
      <FormButton onClick={handleSuccess}>成功提示</FormButton>
      <FormButton onClick={handleError} variant="destructive">
        错误提示
      </FormButton>
    </>
  )
}
```

### 6. 加载状态示例

```typescript
function MyComponent() {
  const { data, isLoading } = useQuery({
    queryKey: ['data'],
    queryFn: fetchData
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  return <div>{/* 内容 */}</div>
}
```

## 🎨 样式定制

### 使用 Tailwind CSS

所有组件都支持 Tailwind CSS 类名：

```typescript
<FormButton className="bg-gradient-to-r from-blue-500 to-purple-500">
  渐变按钮
</FormButton>

<PageCard className="shadow-2xl border-2 border-blue-200">
  自定义卡片
</PageCard>
```

### 组件变体

```typescript
// Button 变体
<FormButton variant="default">默认</FormButton>
<FormButton variant="destructive">危险</FormButton>
<FormButton variant="outline">边框</FormButton>
<FormButton variant="ghost">幽灵</FormButton>

// Badge 变体
<Badge variant="default">默认</Badge>
<Badge variant="secondary">次要</Badge>
<Badge variant="destructive">危险</Badge>
<Badge variant="outline">边框</Badge>

// 尺寸
<FormButton size="sm">小按钮</FormButton>
<FormButton size="default">默认</FormButton>
<FormButton size="lg">大按钮</FormButton>
```

## 📚 参考资料

- **shadcn/ui 官方文档**: https://ui.shadcn.com
- **Tailwind CSS 文档**: https://tailwindcss.com/docs
- **业务组件源码**: `frontend/src/components/business/`
- **迁移状态**: `frontend/MIGRATION_STATUS.md`
- **已迁移示例**:
  - `pages/AppCenter/ExecutionMonitor.tsx`
  - `pages/AppCenter/AppMarket.tsx`
  - `components/AppCenter/ExecutionTable.tsx`
  - `components/AppCenter/InstanceTable.tsx`

## ⚠️ 注意事项

1. **不要混用**: 同一个文件中不要混用 Ant Design 和 shadcn/ui
2. **Toast 初始化**: `<Toaster />` 已在 `App.tsx` 中添加
3. **类型支持**: 所有组件都有完整的 TypeScript 类型
4. **响应式**: 组件默认响应式，配合 Tailwind 使用

## 🐛 常见问题

### Q: 如何替换 Ant Design 的 message?
A: 使用 `useToast` hook

```typescript
// ❌ Ant Design
import { message } from 'antd'
message.success('成功')

// ✅ shadcn/ui
import { useToast } from '@/components/business'
const { toast } = useToast()
toast({ title: "成功" })
```

### Q: 如何替换 Form?
A: 使用 react-hook-form

```typescript
import { useForm } from 'react-hook-form'

const { register, handleSubmit } = useForm()
```

### Q: Table 分页 API 不同？
A: 是的，DataTable 使用简化的 API

```typescript
pagination={{
  current: page,
  pageSize: 20,
  total: 100,
  onChange: (page, pageSize) => {}
}}
```

---

**需要帮助？** 查看已迁移的页面作为参考，或参考 `MIGRATION_STATUS.md`
