# CUBIC3 - Bauhaus Digital 前端

这是一个基于 Bauhaus Digital 设计风格的 CUBIC3 静态前端项目。

## 🎨 设计特色

- **Bauhaus Digital 风格**：采用经典包豪斯设计原则
- **四色体系**：红色 (#E53935)、蓝色 (#1E88E5)、黄色 (#FFC107)、黑色 (#000000)
- **几何图形**：使用圆形、方形、三角形作为视觉元素
- **2px 黑色边框**：强烈的视觉对比
- **字体系统**：Space Grotesk（标题）+ Space Mono（代码/标签）

## 📦 项目结构

```
frontend-static/
├── index.html          # 主页面
├── css/
│   └── styles.css      # 样式表
├── js/
│   └── app.js          # JavaScript 逻辑
└── README.md           # 说明文档
```

## 🚀 快速开始

### 方法一：直接打开（推荐）

1. 直接在浏览器中打开 `index.html` 文件
2. 或者双击 `index.html` 文件

### 方法二：使用本地服务器

```bash
# 使用 Python
cd frontend-static
python -m http.server 8000

# 使用 Node.js http-server
npx http-server -p 8000

# 访问
open http://localhost:8000
```

## 📄 页面列表

系统包含以下 10 个页面：

1. **控制台** - 系统概览和快速操作
2. **查询中心** - SQL 查询管理
3. **数据源管理** - 数据库连接管理
4. **数据集管理** - 数据集模型管理
5. **应用市场** - 定时任务和应用管理
6. **执行监控** - 应用执行历史和状态
7. **渠道管理** - 推送渠道配置
8. **订阅管理** - 数据订阅规则
9. **智能问数** - AI 数据查询助手

## ✨ 功能特性

### 侧边栏
- **收起态**（88px）：图标导航
- **展开态**（280px）：完整菜单 + 二级导航
- 点击左上角 ☰ 按钮切换状态

### 导航系统
- 一级导航：控制台、查询中心、数据中心、应用中心、配置中心、智能问数
- 二级导航：
  - 数据中心：数据源管理、数据集管理
  - 应用中心：应用市场、执行监控
  - 配置中心：渠道管理、订阅管理

### 页面组件
- **统计卡片**：四色循环的数据指标展示
- **操作按钮**：带几何图标的交互按钮
- **数据表格**：黑色表头的信息列表
- **内容卡片**：白色卡片 + 黑色边框
- **状态标签**：成功/失败/运行中等状态指示

## 🎯 浏览器兼容性

- ✅ Chrome/Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+

## 📝 开发说明

### CSS 变量

所有颜色都使用 CSS 自定义属性定义：

```css
--color-red: #E53935;
--color-blue: #1E88E5;
--color-yellow: #FFC107;
--color-black: #000000;
--color-white: #FFFFFF;
--color-bg: #FAFAFA;
```

### 字体加载

字体通过 Google Fonts CDN 加载：
- Space Grotesk (400, 600, 700)
- Space Mono (400, 500, 700)

### 响应式设计

- 桌面端：1440px 最佳
- 平板端：768px - 1024px
- 移动端：< 768px（基础支持）

## 🔧 自定义

### 修改颜色

编辑 `css/styles.css` 中的 `:root` 变量：

```css
:root {
    --color-red: #你的颜色;
    --color-blue: #你的颜色;
    /* ... */
}
```

### 添加新页面

1. 在 `js/app.js` 的 `PageContent` 对象中添加新页面 HTML
2. 在导航菜单中添加对应的按钮
3. 设置 `data-page` 属性指向新页面

## 📄 许可证

本项目仅供演示使用。

## 🙏 致谢

- 设计灵感来源：Bauhaus 运动
- 字体提供：Google Fonts
