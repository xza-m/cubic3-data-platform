# 共享选择器组件

独立的、可复用的选择器组件，用于在整个应用中统一数据源和数据集的选择体验。

## 📦 可用组件

### DataSourceSelector - 数据源选择器

自动加载并显示所有已注册的数据源，支持搜索过滤。

#### 基础使用

```tsx
import { DataSourceSelector } from '@/components/Selectors'

function MyComponent() {
  const [dataSourceId, setDataSourceId] = useState<number>()
  
  return (
    <DataSourceSelector
      value={dataSourceId}
      onChange={setDataSourceId}
      placeholder="请选择数据源"
    />
  )
}
```

#### 高级配置

```tsx
// 只显示 PostgreSQL 和 MySQL 数据源
<DataSourceSelector
  sourceTypes={['postgresql', 'mysql']}
  value={dataSourceId}
  onChange={setDataSourceId}
/>

// 显示所有数据源（包括未激活的）
<DataSourceSelector
  activeOnly={false}
  value={dataSourceId}
  onChange={setDataSourceId}
/>

// 自定义显示格式
<DataSourceSelector
  formatLabel={(ds) => `${ds.name} [${ds.source_type}] - ${ds.description || '无描述'}`}
  value={dataSourceId}
  onChange={setDataSourceId}
/>

// 监听数据加载完成
<DataSourceSelector
  onDataLoaded={(dataSources) => {
    console.log(`加载了 ${dataSources.length} 个数据源`)
  }}
  value={dataSourceId}
  onChange={setDataSourceId}
/>
```

#### Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `activeOnly` | `boolean` | `true` | 是否只显示激活状态的数据源 |
| `sourceTypes` | `string[]` | - | 过滤数据源类型，如 `['postgresql', 'mysql']` |
| `formatLabel` | `(dataSource: DataSource) => string` | - | 自定义显示格式 |
| `onDataLoaded` | `(dataSources: DataSource[]) => void` | - | 数据加载完成回调 |
| ...其他 | `SelectProps<number>` | - | 继承 Ant Design Select 的所有属性 |

---

### DatasetSelector - 数据集选择器

自动加载并显示所有已注册的数据集，支持按数据源过滤和搜索。

#### 基础使用

```tsx
import { DatasetSelector } from '@/components/Selectors'

function MyComponent() {
  const [datasetId, setDatasetId] = useState<number>()
  
  return (
    <DatasetSelector
      value={datasetId}
      onChange={setDatasetId}
      placeholder="请选择数据集"
    />
  )
}
```

#### 高级配置

```tsx
// 只显示指定数据源的数据集
<DatasetSelector
  sourceId={1}
  value={datasetId}
  onChange={setDatasetId}
/>

// 自定义显示格式
<DatasetSelector
  formatLabel={(ds) => `${ds.dataset_name} - ${ds.description || '无描述'}`}
  value={datasetId}
  onChange={setDatasetId}
/>

// 监听数据加载完成
<DatasetSelector
  onDataLoaded={(datasets) => {
    console.log(`加载了 ${datasets.length} 个数据集`)
  }}
  value={datasetId}
  onChange={setDatasetId}
/>
```

#### Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `sourceId` | `number` | - | 过滤指定数据源的数据集 |
| `formatLabel` | `(dataset: Dataset) => string` | - | 自定义显示格式 |
| `onDataLoaded` | `(datasets: Dataset[]) => void` | - | 数据加载完成回调 |
| ...其他 | `SelectProps<number>` | - | 继承 Ant Design Select 的所有属性 |

---

## 🎯 使用场景

### 1. 应用中心配置表单

已集成到智能表单中，自动识别 `datasource_id` 和 `dataset_id` 字段。

### 2. 数据提取任务配置

```tsx
import { DataSourceSelector, DatasetSelector } from '@/components/Selectors'

function ExtractionTaskForm() {
  const [sourceId, setSourceId] = useState<number>()
  const [datasetId, setDatasetId] = useState<number>()
  
  return (
    <Form>
      <Form.Item label="数据源">
        <DataSourceSelector
          value={sourceId}
          onChange={setSourceId}
        />
      </Form.Item>
      
      <Form.Item label="数据集">
        <DatasetSelector
          sourceId={sourceId}  // 根据选择的数据源过滤
          value={datasetId}
          onChange={setDatasetId}
        />
      </Form.Item>
    </Form>
  )
}
```

### 3. 查询中心编辑器

```tsx
import { DataSourceSelector } from '@/components/Selectors'

function QueryEditor() {
  const [sourceId, setSourceId] = useState<number>()
  
  return (
    <div>
      <DataSourceSelector
        value={sourceId}
        onChange={handleDataSourceChange}
        style={{ width: 300 }}
      />
    </div>
  )
}
```

---

## 🔧 技术细节

### 特性

- ✅ **自动数据加载** - 使用 `useEffect` 钩子自动加载数据
- ✅ **搜索过滤** - 内置搜索功能，快速找到目标项
- ✅ **Loading 状态** - 数据加载时显示加载动画
- ✅ **灵活配置** - 支持多种过滤和格式化选项
- ✅ **TypeScript** - 完整的类型定义和 IntelliSense 支持
- ✅ **Ant Design** - 基于 Ant Design Select 组件

### 数据源

- `DataSourceSelector` → `/api/v1/data-center/datasources`
- `DatasetSelector` → `/api/v1/data-center/datasets`

### 默认显示格式

- **数据源**: `数据源名称 (类型)` 例如：`测试PostgreSQL (postgresql)`
- **数据集**: `数据集名称 (ID: xxx)` 例如：`销售数据集 (ID: 456)`

---

## 📝 开发指南

### 添加新的选择器

如果需要添加其他类型的选择器（如用户选择器、角色选择器等），可以参考现有组件的结构：

1. 创建新的 `.tsx` 文件
2. 定义 Props 接口（继承 `SelectProps`）
3. 使用 `useState` 和 `useEffect` 管理数据加载
4. 导出组件并在 `index.ts` 中注册

示例：

```tsx
// UserSelector.tsx
export interface UserSelectorProps extends Omit<SelectProps<number>, 'options'> {
  roleId?: number
  activeOnly?: boolean
}

export default function UserSelector({ roleId, activeOnly = true, ...props }: UserSelectorProps) {
  // 实现逻辑...
}
```

---

## 🤝 贡献

如果发现问题或有改进建议，请提交 Issue 或 Pull Request。

---

## 📄 许可

内部项目组件，遵循项目整体许可协议。
