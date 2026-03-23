# 组件样式统一指南

本文档说明如何在整个平台统一控制组件样式。

## 三层样式控制体系

### 1. Ant Design 主题配置（最高优先级）✅

**位置**: `src/theme/antdConfig.ts`

**用途**: 全局统一控制所有 Ant Design 组件的基础样式

**优点**:
- ✅ 一次配置，全局生效
- ✅ 类型安全
- ✅ 不需要手动添加类名
- ✅ 性能最优

**示例**:
```typescript
export const antdTheme: ThemeConfig = {
  token: {
    controlHeight: 32,  // 统一所有控件高度
    colorPrimary: '#6366f1',
  },
  components: {
    Select: {
      controlHeight: 32,
    },
    DatePicker: {
      controlHeight: 32,
    },
  },
}
```

**使用方式**:
在 `App.tsx` 中通过 `ConfigProvider` 包裹：
```tsx
import { ConfigProvider } from 'antd'
import { antdTheme } from './theme/antdConfig'

<ConfigProvider theme={antdTheme}>
  <YourApp />
</ConfigProvider>
```

---

### 2. 包装组件（推荐使用）✅

**位置**: `src/components/Common/`

**用途**: 封装常用组件，添加统一的业务逻辑和样式

**优点**:
- ✅ 集中管理样式和行为
- ✅ 易于维护和升级
- ✅ 可以添加额外的业务逻辑
- ✅ 类型安全

**示例**:
```tsx
// src/components/Common/FilterSelect.tsx
export default function FilterSelect(props: SelectProps) {
  return (
    <Select
      {...props}
      size="middle"
      className={`filter-select ${props.className || ''}`}
    />
  )
}
```

**使用方式**:
```tsx
import { FilterSelect, FilterOption } from '@/components/Common'

<FilterSelect placeholder="筛选应用类型">
  <FilterOption value="app1">应用1</FilterOption>
</FilterSelect>
```

---

### 3. 全局 CSS 覆盖（兜底方案）

**位置**: `src/index.css`

**用途**: 处理主题配置无法覆盖的样式细节

**优点**:
- ✅ 灵活性最高
- ✅ 可以处理复杂的样式需求

**缺点**:
- ❌ 可能被其他样式覆盖
- ❌ 维护成本高
- ❌ 需要使用 !important

**示例**:
```css
/* 仅在主题配置无法满足时使用 */
.filter-select .ant-select-selector {
  height: 32px !important;
}
```

---

## 使用建议

### ✅ 推荐做法

1. **优先使用主题配置**
   ```tsx
   // ✅ 好：通过主题配置统一控制
   // 在 antdConfig.ts 中配置即可，无需每次都设置
   <Select placeholder="选择" />
   ```

2. **使用包装组件**
   ```tsx
   // ✅ 好：使用封装的组件
   import { FilterSelect } from '@/components/Common'
   <FilterSelect placeholder="选择" />
   ```

3. **添加语义化类名**
   ```tsx
   // ✅ 好：使用语义化类名
   <Select className="filter-select" />
   ```

### ❌ 避免的做法

1. **不要每次都设置内联样式**
   ```tsx
   // ❌ 不好：重复设置样式
   <Select style={{ height: '32px' }} />
   <Select style={{ height: '32px' }} />  // 重复！
   ```

2. **不要每次都设置 size**
   ```tsx
   // ❌ 不好：如果主题已配置，无需重复
   <Select size="middle" />
   ```

3. **避免分散的 CSS 覆盖**
   ```tsx
   // ❌ 不好：在多个组件文件中写 CSS
   // Component1.css
   .my-select { height: 32px; }
   // Component2.css
   .another-select { height: 32px; }  // 重复！
   ```

---

## 现有组件迁移

### 迁移步骤

1. **使用包装组件替换原生组件**
   ```tsx
   // 之前
   import { Select } from 'antd'
   <Select size="middle" className="filter-select" />
   
   // 之后
   import { FilterSelect } from '@/components/Common'
   <FilterSelect />  // 更简洁！
   ```

2. **移除重复的样式设置**
   ```tsx
   // 之前
   <Select 
     size="middle" 
     style={{ height: '32px' }}
     className="w-full filter-select"
   />
   
   // 之后
   <FilterSelect className="w-full" />
   ```

---

## 创建新的包装组件

当需要统一某类组件样式时：

```tsx
// src/components/Common/YourComponent.tsx
import { ComponentType, ComponentProps } from 'antd'

export default function YourComponent(props: ComponentProps) {
  return (
    <ComponentType
      {...props}
      size="middle"  // 统一大小
      className={`your-component ${props.className || ''}`}
    />
  )
}
```

---

## 常见问题

### Q: 主题配置 vs 包装组件，应该用哪个？

**A**: 优先使用主题配置，复杂场景使用包装组件

- **主题配置**: 适合统一基础样式（颜色、尺寸、圆角等）
- **包装组件**: 适合添加业务逻辑或复杂样式

### Q: 为什么组件高度还是不一致？

**A**: 检查以下几点：

1. 是否在 `antdConfig.ts` 中配置了 `controlHeight`
2. 是否有内联 `style` 覆盖了主题配置
3. 是否有 CSS `!important` 覆盖了样式
4. 浏览器是否缓存了旧样式（尝试硬刷新）

### Q: 如何调试样式问题？

**A**: 

1. 打开浏览器开发者工具
2. 检查元素的 Computed Styles
3. 查看哪个样式规则覆盖了预期样式
4. 根据优先级调整（主题 → 包装组件 → CSS）

---

## 检查清单

在提交代码前，请确认：

- [ ] 新组件是否使用了包装组件或主题配置
- [ ] 是否移除了重复的 `size`、`style` 属性
- [ ] 是否添加了语义化的类名
- [ ] 是否避免了内联样式
- [ ] 样式是否在不同页面保持一致

---

## 参考资源

- [Ant Design 主题配置文档](https://ant.design/docs/react/customize-theme-cn)
- [ConfigProvider API](https://ant.design/components/config-provider-cn)
- 项目主题配置: `src/theme/antdConfig.ts`
- 通用组件: `src/components/Common/`
