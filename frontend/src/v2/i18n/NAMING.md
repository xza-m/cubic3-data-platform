<!-- frontend/src/v2/i18n/NAMING.md -->

# i18n key 命名规范（Round 4 · T-001b）

> 单一真值来源。所有 `t(key, fallback)` 的 `key` 必须遵循此规范；
> CI gate（`npm run i18n:coverage` + `npm run i18n:keys`）按本文件的正则做 lint。
>
> **中文单语言**：产品已收敛为中文单语言，仓库不再维护 `en.json`；
> `t()` 的键值层保留用于文案治理，静态 key 必须存在于 `zh.json`。

## 1. 总体形态

```
<domain>.<page|component>.<element>[.<modifier>]
```

点号分隔、无空格、无中划线。首字母小写或数字；单词内可 `_` 或 `camelCase`（**新代码统一 snake_case**，历史 camelCase 不做追溯）。

正则（T-001e CI gate 用）：`^[a-z0-9][A-Za-z0-9_]*(\.[a-z0-9][A-Za-z0-9_]*){1,3}$`

- 段数 2–4（1–3 个点）
- 首字符：小写字母或数字（`404.desc`、`api.v1.deprecated` 皆合法）
- 段内：允许 `[a-zA-Z0-9_]`，不允许中划线 / 空格

例：

| 类型 | 例子 |
| --- | --- |
| 页面标题 | `data.datasources.title` |
| 按钮 | `common.action.save` |
| 表单 label | `settings.landing.label` |
| 错误提示 | `settings.landing.error.invalid_path` |
| 空态 | `queries.scheduled.empty.title` / `…empty.desc` |
| Toast | `settings.save.success` / `settings.save.error` |
| A11y aria-label | `a11y.table.density` |

## 2. domain 枚举（只允许这 10 个）

| domain | 含义 | 对应 `src/v2/pages/` 路径 |
| --- | --- | --- |
| `common` | 跨页通用（按钮 / 状态 / 占位符） | — |
| `a11y` | 无障碍专用（纯 aria / sr-only） | — |
| `nav` | 侧栏 / 面包屑 / 导航标签 | `layout/` |
| `settings` | 偏好设置 | `settings/` |
| `data` | 数据中心（连接 / 数据资产 / 同步任务 / 同步记录） | `data/` |
| `queries` | 查询工坊（历史 / 计划 / 存档 / Console） | `queries/` |
| `semantic` | 语义（域 / 本体 / Cube / 视图） | `semantic/` |
| `apps` | 应用中心（市场 / 实例 / 执行） | `apps/` |
| `config` | 配置中心（用户 / 角色 / 审计） | `config/` |
| `auth` | 登录 / 授权 / 错误页 | `Login.tsx` / `Forbidden.tsx` / `NotFound.tsx` |
| `dataCenter` | 数据中心壳层（概览 / 连接 / 资产 / 同步 / 影响） | `data/DataCenter.tsx` 及 `data/_shared/data-center-*` |

不允许自创新 domain；新模块先改本文件再提 PR。

> 历史包袱说明：`zh.json` 中还存在一批按页面命名的历史 domain
> （如 `queryConsole`、`queryVisual`、`channel`、`subscription`、`domain`、`cube`、`access` 等）。
> 这些 key 已被大量调用方引用，**不做追溯重命名**；新增 key 优先归入上表 domain，
> 在既有历史 domain 页面内补充文案时允许沿用该页面前缀，保持同页一致性。

## 3. page / component 段

- **页面**：以路由文件名（小写 + 下划线）为主干，复数同义化：
  - `QueriesScheduled.tsx` → `queries.scheduled`
  - `QueriesScheduledDetail.tsx` → `queries.scheduled_detail`
- **共享内容组件**（`_shared/*-content.tsx`）：去掉 `-content` 后缀：
  - `saved-query-content.tsx` → `queries.saved`
  - `extraction-run-detail-content.tsx` → `data.extraction_run_detail`
- **小组件**（`components/`）：用 `common.<component>`：
  - `PeekPanel.tsx` → `common.peek_panel`
  - `ErrorBoundary.tsx` → `common.error_boundary`

## 4. element 段

固定词表（优先复用，不要造词）：

| element | 典型用途 |
| --- | --- |
| `title` | 页面 / 卡片 / 对话框标题 |
| `subtitle` / `desc` | 副标题 / 说明 |
| `label` | 表单字段名 |
| `placeholder` | 输入框占位符 |
| `help` | 辅助说明 |
| `empty` | 空态（`empty.title` / `empty.desc` / `empty.cta`） |
| `error` | 错误 / 校验提示 |
| `tab` | 标签页名 |
| `column` | 表格列头 |
| `action` | 按钮 / 链接动作 |
| `status` | 状态标签（枚举值见下） |
| `tooltip` | tooltip 文本 |
| `toast` | toast 文案 |
| `confirm` | 确认对话框文本 |
| `aria` | 纯 aria-label / sr-only |

## 5. modifier 段

用于枚举值 / 变体，例如：

- `common.status.success` / `…running` / `…failed` / `…pending`
- `queries.scheduled.priority.p0` / `…p1` / `…p2`
- `common.action.save` / `…cancel` / `…delete` / `…reset`

## 6. 值模板变量

`t()` 的第三个参数 `vars` 用 `{name}` 占位。键里禁止塞变量，把变量留给模板：

```ts
t('data.dataset.rows_count', '共 {n} 行', { n: total })
// zh.json: { "data.dataset.rows_count": "共 {n} 行" }
```

## 7. Fallback 约定

- `t()` 的 `fallback` 必须**与 `zh.json` 对应值一致**（或是它的合理简写）。
- 静态 key 必须存在于 `zh.json`；`npm run i18n:keys` 校验，缺失可用 `npm run i18n:keys -- --fix` 回填。
- `fallback` 禁止使用反引号模板字面量；变量一律走 `vars` 参数（见 §6），`i18n:keys` 会拦截违规。

## 8. 评审流程

1. 写代码时先查 `zh.json`，复用已有 key；
2. 找不到就按本规范新增 key + 中文文案（中文单语言，无需 en 占位）；
3. 提 PR 时把新增 key 整理到 PR 描述里，reviewer 抽查是否命中上面的 domain / element / modifier 词表；
4. 同一 PR 不得跨 domain 新增 > 20 个 key，超出需拆。

## 9. 违规白名单（允许硬编码中文）

- 单元测试内的断言字符串（`expect(...).toBe('加载中…')`）
- 埋点 `obs.track()` 的 `label` 字段（跟随 BI/分析习惯）
- Prettier 长到无法拆分的注释块 / 代码注释

上述范围内硬编码中文不计入 T-001e coverage gate。
