# 数据中心模块优化 - 设计文档

**状态**: 🟢 设计中  
**创建时间**: 2026-01-22  
**更新时间**: 2026-01-22  
**负责人**: 待定

---

## 概述

本次优化针对数据中心模块的 UI/UX 问题和功能 Bug 进行修复，共涉及 8 个优化点，分为界面优化（5个）和功能修复（3个）两大类。

---

## 优化详情

### 1. 数据源创建表单优化

**问题描述**：
- 当前新建数据源的 Modal 占据整个屏幕，视觉压迫感强
- 输入框样式不统一，部分输入框缺少现代化设计元素

**设计方案**：

#### 1.1 Modal 尺寸调整
```tsx
// 修改前
<Modal fullScreen>

// 修改后
<Modal 
  width={720}
  style={{ top: 40 }}
  bodyStyle={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}
>
```

#### 1.2 输入框样式统一
- 使用 Ant Design 5.x 最新规范
- 统一 placeholder 样式
- 统一 Input 和 Select 的高度（40px）
- 统一边框圆角（8px）
- 添加 focus 状态的视觉反馈

```tsx
// 统一样式配置
const inputStyle = {
  height: '40px',
  borderRadius: '8px',
}

const formItemStyle = {
  marginBottom: '16px',
}
```

#### 1.3 表单布局优化
- 字段间距：16px
- 标签宽度：自适应
- 必填标记：统一使用红色 *
- 帮助文本：使用浅灰色

**影响文件**：
- `frontend/src/pages/GlassDatasources.tsx`（如果创建表单在此）
- 或独立的 CreateDatasourceModal 组件

---

### 2. 数据源列表筛选优化

**问题描述**：
- 搜索框和筛选按钮功能重复
- 用户需要额外点击筛选按钮才能执行筛选

**设计方案**：

#### 2.1 移除筛选按钮
```tsx
// 修改前
<Input.Search />
<Button>筛选</Button>

// 修改后
<Input.Search 
  placeholder="搜索数据源名称或类型..."
  onSearch={handleSearch}
  allowClear
/>
```

#### 2.2 实时筛选
- 输入时自动过滤列表（防抖 300ms）
- 或使用 onSearch 事件（用户按回车或点击搜索图标）

**影响文件**：
- `frontend/src/pages/GlassDatasources.tsx`

---

### 3. 数据集字段配置表格优化

**问题描述**：
- 表格占用空间过大
- 业务类型和敏感级别下拉框无法点击

**设计方案**：

#### 3.1 紧凑表格布局
```tsx
<Table
  size="small"  // 使用紧凑模式
  scroll={{ x: 1200 }}  // 启用横向滚动
  pagination={false}
  columns={[
    { title: '字段名', width: 150, fixed: 'left' },
    { title: '数据类型', width: 120 },
    { title: '业务类型', width: 150 },  // 缩小宽度
    { title: '敏感级别', width: 120 },  // 缩小宽度
    { title: '脱敏规则', width: 120 },
    { title: '字段描述', width: 200 },
    { title: '识别依据', width: 250 },
  ]}
/>
```

#### 3.2 修复下拉框交互
```tsx
// 问题原因分析：可能是 Select 组件的 onChange 事件未绑定或数据未更新

// 修复方案
<Select
  value={record.business_type}
  onChange={(value) => handleFieldChange(record.physical_name, 'business_type', value)}
  getPopupContainer={(trigger) => trigger.parentElement}  // 确保下拉框正确渲染
>
  <Option value="dimension">维度</Option>
  <Option value="metric">度量</Option>
  <Option value="partition">分区键</Option>
</Select>
```

#### 3.3 优化表格列宽
| 列名 | 旧宽度 | 新宽度 | 说明 |
|------|--------|--------|------|
| 字段名 | 自适应 | 150px | 固定左侧 |
| 数据类型 | 自适应 | 120px | 紧凑 |
| 业务类型 | 180px | 150px | 缩小 |
| 敏感级别 | 150px | 120px | 缩小 |
| 脱敏规则 | 150px | 120px | 缩小 |
| 字段描述 | 250px | 200px | 缩小 |
| 识别依据 | 300px | 250px | 缩小 |

**影响文件**：
- `frontend/src/components/FieldConfigurator/FieldConfigurator.tsx`

---

### 4. 页面布局统一

**问题描述**：
- 物理数据集注册页面缺少返回按钮
- 三种数据集注册页面布局不一致

**设计方案**：

#### 4.1 统一页面头部
```tsx
// 统一的头部组件
const DatasetRegisterHeader = ({ type, onBack }) => (
  <div className="register-header">
    <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
      返回
    </Button>
    <div className="title">
      <IconComponent />
      <div>
        <h2>{getTitle(type)}</h2>
        <p className="subtitle">{getSubtitle(type)}</p>
      </div>
    </div>
  </div>
);
```

#### 4.2 统一步骤条
```tsx
// 三种类型使用相同的步骤条样式
<Steps
  current={currentStep}
  items={[
    { title: '选择数据源', icon: <DatabaseOutlined /> },  // 物理表
    { title: '编写 SQL', icon: <CodeOutlined /> },         // 虚拟表
    { title: '上传文件', icon: <UploadOutlined /> },       // 文件
    { title: '填写信息', icon: <FormOutlined /> },
    { title: '配置字段', icon: <SettingOutlined /> },
    { title: '完成注册', icon: <CheckOutlined /> },
  ]}
/>
```

#### 4.3 统一按钮布局
```tsx
// 页面底部按钮
<div className="register-actions">
  <Button onClick={handlePrev}>上一步</Button>
  <Button type="primary" onClick={handleNext}>
    {isLastStep ? '完成注册' : '下一步'}
  </Button>
</div>
```

**影响文件**：
- `frontend/src/pages/GlassDatasetRegister.tsx`（物理表）
- `frontend/src/pages/SqlLabRegister.tsx`（虚拟表）
- `frontend/src/pages/FileDatasetRegister.tsx`（文件）

---

### 5. 修复 CSV 文件上传

**问题分析**：
- 错误信息：`The requested URL was not found on the server`
- 原因：文件上传路由未正确注册或路径错误

**诊断步骤**：
1. 检查前端 API 调用路径
2. 检查后端路由是否注册
3. 检查 Blueprint 是否正确挂载

**修复方案**：

#### 5.1 检查前端 API
```typescript
// frontend/src/api/files.ts
export const uploadFile = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  
  return client.post('/api/v1/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
```

#### 5.2 检查后端路由
```python
# app/interfaces/api/v1/files.py
from flask import Blueprint, request

bp = Blueprint('files', __name__, url_prefix='/api/v1/files')

@bp.route('/upload', methods=['POST'])
def upload_file():
    """上传文件"""
    # 实现上传逻辑
    pass
```

#### 5.3 确保 Blueprint 注册
```python
# app/__init__.py
from app.interfaces.api.v1 import files

def create_app():
    app = Flask(__name__)
    
    # 注册 Blueprint
    app.register_blueprint(files.bp)
    
    return app
```

**影响文件**：
- `frontend/src/api/files.ts`
- `app/interfaces/api/v1/files.py`
- `app/__init__.py`

---

### 6. 修复虚拟数据集 SQL 执行

**问题分析**：
- 错误信息：`验证失败`（具体错误待确认）
- 可能原因：SQL 验证逻辑过于严格或数据源连接失败

**修复方案**：

#### 6.1 检查 SQL 验证逻辑
```python
# app/interfaces/api/v1/sql_lab.py

@bp.route('/validate', methods=['POST'])
def validate_sql():
    """验证 SQL 语法"""
    data = request.json
    sql_query = data.get('sql_query', '').strip()
    
    # 基础验证
    if not sql_query:
        return jsonify({'valid': False, 'error': 'SQL 不能为空'})
    
    if not sql_query.upper().startswith('SELECT'):
        return jsonify({'valid': False, 'error': '仅支持 SELECT 查询'})
    
    # 危险操作检查
    dangerous_keywords = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'TRUNCATE']
    sql_upper = sql_query.upper()
    for keyword in dangerous_keywords:
        if keyword in sql_upper:
            return jsonify({'valid': False, 'error': f'不允许使用 {keyword} 操作'})
    
    return jsonify({'valid': True})

@bp.route('/execute', methods=['POST'])
def execute_sql():
    """执行 SQL 查询"""
    data = request.json
    source_id = data.get('source_id')
    sql_query = data.get('sql_query')
    limit = data.get('limit', 100)
    
    # 验证参数
    if not source_id or not sql_query:
        return jsonify({'code': -1, 'message': '参数不完整'})
    
    # 获取数据源
    datasource = get_datasource(source_id)
    if not datasource:
        return jsonify({'code': -1, 'message': '数据源不存在'})
    
    # 执行查询
    try:
        adapter = AdapterFactory.create(datasource)
        result = adapter.execute_query(sql_query, limit=limit)
        return jsonify({'code': 0, 'data': result})
    except Exception as e:
        return jsonify({'code': -1, 'message': str(e)})
```

#### 6.2 优化错误提示
```typescript
// frontend/src/pages/SqlLabRegister.tsx
const handleExecute = async () => {
  try {
    const result = await executeSql({
      source_id: selectedSource,
      sql_query: sqlQuery,
      limit: 100,
    });
    
    if (result.code === 0) {
      setPreviewData(result.data);
      message.success('执行成功');
    } else {
      message.error(`执行失败: ${result.message}`);
    }
  } catch (error) {
    message.error(`执行失败: ${error.message}`);
    console.error('SQL execution error:', error);
  }
};
```

**影响文件**：
- `app/interfaces/api/v1/sql_lab.py`
- `frontend/src/pages/SqlLabRegister.tsx`

---

## 实施优先级

| 优先级 | 优化项 | 类型 | 估计工时 |
|--------|--------|------|----------|
| **P0** | CSV 文件上传修复 | Bug | 2h |
| **P0** | SQL 执行失败修复 | Bug | 2h |
| **P0** | 字段属性不可修改 | Bug | 1h |
| **P1** | 数据源表单优化 | UI | 2h |
| **P1** | 页面布局统一 | UI | 3h |
| **P2** | 筛选按钮移除 | UI | 0.5h |
| **P2** | 字段表格紧凑化 | UI | 1h |
| **P2** | 输入框样式统一 | UI | 1.5h |

**总计**: 约 13 小时（2 个工作日）

---

## 技术方案

### 前端技术栈
- React 18
- TypeScript
- Ant Design 5.x
- Tailwind CSS

### 后端技术栈
- Python 3.11
- Flask
- SQLAlchemy

### 样式规范
- 使用 Glass Morphism 设计语言
- 遵循现有的样式系统
- 确保响应式布局

---

## 测试计划

### 功能测试
- [ ] CSV 文件上传（小文件、大文件、边界情况）
- [ ] SQL 执行（有效 SQL、无效 SQL、危险 SQL）
- [ ] 字段属性修改（业务类型、敏感级别）

### UI 测试
- [ ] 数据源创建表单（不同屏幕尺寸）
- [ ] 数据源列表筛选（搜索功能）
- [ ] 字段配置表格（紧凑布局、下拉框交互）
- [ ] 三种数据集注册流程（布局一致性）

### 浏览器兼容性
- [ ] Chrome（最新版本）
- [ ] Firefox（最新版本）
- [ ] Safari（最新版本）

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 样式修改影响其他页面 | 中 | 使用 scoped 样式或 CSS Modules |
| API 修复引入新 Bug | 中 | 充分的单元测试和集成测试 |
| 表格性能问题 | 低 | 使用虚拟滚动（如需要） |

---

## 下一步

1. Review 本设计文档
2. 开始实施（按优先级）
3. 逐项测试验证
4. 更新用户文档
