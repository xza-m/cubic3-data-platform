# frontend-ui Specification

## Purpose
Defines the UI component library and design system for the frontend application, migrated from Ant Design to shadcn/ui for better performance and customization.
## Requirements
### Requirement: shadcn/ui Integration

The frontend SHALL use shadcn/ui as the primary UI component library, providing a modern, customizable, and performant user interface.

#### Scenario: Component installation
- **WHEN** a developer needs a new UI component
- **THEN** they can install it via `npx shadcn@latest add [component]`
- **AND** the component is copied to `src/components/ui/` with full ownership

#### Scenario: Component customization
- **WHEN** a developer needs to customize a UI component
- **THEN** they can directly edit the component file in `src/components/ui/`
- **AND** the changes apply immediately without framework restrictions

#### Scenario: Bundle size
- **WHEN** the frontend application is built for production
- **THEN** the total bundle size SHALL be less than 300KB gzipped
- **AND** the bundle SHALL include only the components actually used in the application

### Requirement: Business Component Library
The frontend SHALL provide a business component library in `src/components/business/` and domain-focused workbench modules in `src/components/Semantic/` that wrap shadcn/ui components with platform-specific styling and behavior.

#### Scenario: Consistent form components
- **WHEN** a developer builds a form
- **THEN** they can use `FormSelect`, `FormInput`, `FormDatePicker`, and `FormButton` from `@/components/business`
- **AND** these components automatically apply consistent styling, sizing, and validation patterns

#### Scenario: Reusable data table
- **WHEN** a page needs to display tabular data
- **THEN** they can use the `DataTable` component from `@/components/business`
- **AND** it SHALL support sorting, filtering, pagination, row selection, and bulk actions

#### Scenario: Standard page layouts
- **WHEN** a page needs common UI patterns (cards, modals, drawers)
- **THEN** they can use `PageCard`, `PageModal`, and `PageDrawer` from `@/components/business`
- **AND** these components provide consistent spacing, shadows, and animations

#### Scenario: Semantic workbench modules
- **WHEN** a developer implements pages inside the semantic center
- **THEN** they SHALL prioritize shared semantic workbench modules such as page shell, page header, status banner, action bar, inspector panel, and empty state
- **AND** they SHALL extend those modules before inventing a conflicting page-level composition

### Requirement: Form Management with React Hook Form

The frontend SHALL use React Hook Form for all form state management and validation.

#### Scenario: Form creation
- **WHEN** a developer creates a new form
- **THEN** they SHALL use the `useForm` hook from `react-hook-form`
- **AND** they SHALL use shadcn/ui Form components (`<FormField>`, `<FormItem>`, `<FormControl>`)
- **AND** they SHALL use Zod schemas for validation rules

#### Scenario: Form submission
- **WHEN** a user submits a form
- **THEN** the form validates all fields according to the Zod schema
- **AND** it displays field-level error messages using shadcn/ui form error components
- **AND** it only submits if all validations pass

#### Scenario: Complex form fields
- **WHEN** a form includes complex fields (multi-select, date ranges, file uploads)
- **THEN** the field components integrate seamlessly with React Hook Form's Controller
- **AND** they maintain consistent validation and error handling

### Requirement: Responsive Design
The frontend SHALL provide a fully responsive user interface that adapts to different screen sizes.

#### Scenario: Mobile view (< 768px)
- **WHEN** the application is viewed on a mobile device
- **THEN** navigation collapses to a hamburger menu
- **AND** tables display in card format or horizontally scrollable containers
- **AND** forms stack vertically with full-width inputs
- **AND** all interactive elements have touch-friendly sizes (min 44x44px)

#### Scenario: Tablet view (768px - 1280px)
- **WHEN** the application is viewed on a tablet
- **THEN** layout uses 2-column grids where appropriate
- **AND** navigation is visible but condensed
- **AND** tables show with horizontal scrolling if needed

#### Scenario: Desktop view (> 1280px)
- **WHEN** the application is viewed on a desktop
- **THEN** layout uses full multi-column grids
- **AND** sidebar navigation is always visible
- **AND** tables show all columns without scrolling (where feasible)

#### Scenario: Semantic workbench responsive priority
- **WHEN** semantic center pages render on narrower viewports
- **THEN** filters, preview panels, resource rails, and inspectors SHALL collapse or reorder without hiding critical actions
- **AND** the current object, current state, and next action SHALL remain visible without requiring hover-only interaction

### Requirement: Accessibility
The frontend SHALL meet WCAG 2.1 Level AA accessibility standards.

#### Scenario: Keyboard navigation
- **WHEN** a user navigates using only a keyboard
- **THEN** all interactive elements are accessible via Tab key
- **AND** focus indicators are clearly visible
- **AND** keyboard shortcuts match common patterns (Esc closes modals, Enter submits forms)

#### Scenario: Screen reader support
- **WHEN** a user navigates using a screen reader
- **THEN** all interactive elements have appropriate ARIA labels
- **AND** form fields have associated labels or aria-describedby
- **AND** loading states and dynamic content changes are announced

#### Scenario: Color contrast
- **WHEN** UI elements are displayed
- **THEN** all text has a contrast ratio of at least 4.5:1 (7:1 for large text)
- **AND** interactive elements have sufficient contrast in all states (default, hover, focus, disabled)

#### Scenario: Semantic center action discoverability
- **WHEN** semantic center pages expose row actions, object actions, or modeling actions
- **THEN** those actions SHALL remain discoverable on keyboard and touch interfaces
- **AND** the UI SHALL NOT rely on hover-only affordances for core operations

### Requirement: Component Theming

The frontend SHALL support consistent theming across all UI components via Tailwind CSS configuration.

#### Scenario: Theme token application
- **WHEN** a component is rendered
- **THEN** it uses theme tokens from `tailwind.config.js` for colors, spacing, and typography
- **AND** developers can update the theme in one place to affect all components

#### Scenario: Custom color schemes
- **WHEN** the platform requires a different color scheme
- **THEN** developers can update the `primary`, `secondary`, and `accent` color palettes in Tailwind config
- **AND** all components automatically apply the new colors

#### Scenario: Dark mode (future)
- **WHEN** dark mode support is added
- **THEN** all components use Tailwind's dark mode classes
- **AND** the theme switches seamlessly without page reload

### Requirement: Performance Optimization

The frontend SHALL load and render efficiently to provide a smooth user experience.

#### Scenario: Initial page load
- **WHEN** a user first accesses the application
- **THEN** the First Contentful Paint (FCP) SHALL occur within 1.5 seconds
- **AND** the Time to Interactive (TTI) SHALL be within 3 seconds
- **AND** the total JavaScript bundle size SHALL be less than 300KB gzipped

#### Scenario: Page navigation
- **WHEN** a user navigates between pages
- **THEN** the new page SHALL render within 500ms
- **AND** there SHALL be no visible layout shift (CLS < 0.1)

#### Scenario: Large data tables
- **WHEN** a table displays more than 100 rows
- **THEN** it uses virtualization or pagination to limit DOM nodes
- **AND** scrolling remains smooth (60fps)

### Requirement: Component Documentation

The frontend SHALL maintain documentation for all reusable components.

#### Scenario: Component usage guide
- **WHEN** a developer needs to use a component
- **THEN** they can find usage examples in `frontend/COMPONENT_STYLE_GUIDE.md`
- **AND** the documentation includes TypeScript prop definitions
- **AND** the documentation shows common use cases with code examples

#### Scenario: Design patterns
- **WHEN** a developer implements a common UI pattern (filters, forms, tables)
- **THEN** they can reference documented patterns in the style guide
- **AND** the patterns include best practices for accessibility and performance

### Requirement: Migration from Ant Design

The frontend SHALL completely remove Ant Design and migrate all components to shadcn/ui.

#### Scenario: Zero Ant Design dependencies
- **WHEN** the migration is complete
- **THEN** `package.json` SHALL NOT contain `antd`, `@ant-design/icons`, or `@rjsf/antd`
- **AND** no files import from 'antd'
- **AND** the production bundle SHALL NOT include any Ant Design code

#### Scenario: Feature parity
- **WHEN** all pages are migrated
- **THEN** all existing functionality works identically to before
- **AND** no user workflows are broken
- **AND** all form validations behave the same

#### Scenario: Visual consistency
- **WHEN** all components are migrated
- **THEN** the UI maintains consistent spacing, sizing, and styling
- **AND** all components follow the same design language
- **AND** the overall aesthetic is modern and cohesive

### Requirement: Platform Workbench Design Baseline
The frontend SHALL use a single platform workbench design baseline derived from the semantic center workbench language.

#### Scenario: Shell and page consistency
- **WHEN** a user navigates between login, platform overview, semantic center, data inventory, and analysis pages
- **THEN** the pages SHALL feel like the same product
- **AND** they SHALL share the same typography, spacing, surface hierarchy, and status language

#### Scenario: Canonical page models
- **WHEN** a new platform page is added or an existing page is refactored
- **THEN** it SHALL map to one of the five canonical page models
- **AND** it SHALL NOT invent a separate layout language

### Requirement: Platform Shell Contract
The frontend SHALL provide a low-noise global shell that supports navigation without competing with page content.

#### Scenario: Header behavior
- **WHEN** the authenticated shell renders
- **THEN** the top navigation SHALL show the current first-level module, a global search entry, notifications, and the current user
- **AND** it SHALL NOT render decorative background treatments or unrelated status summaries

#### Scenario: Sidebar behavior
- **WHEN** the sidebar renders
- **THEN** it SHALL focus on navigation groups and current location
- **AND** it SHALL NOT render promotional cards, health banners, or secondary dashboards

### Requirement: Platform Overview Page Model
The frontend SHALL implement the dashboard as an `Overview` page model rather than a generic admin welcome page.

#### Scenario: Platform overview content
- **WHEN** a user opens the dashboard
- **THEN** the page SHALL prioritize current platform asset counts, current work domains, and active blockers
- **AND** it SHALL NOT render a welcome hero, generic KPI card matrix, or activity feed as the primary content

### Requirement: Platform Layout Verification
The frontend SHALL provide targeted verification for the platform shell and overview pages.

#### Scenario: Platform layout verification script
- **WHEN** a developer changes `AppLayout`, `Login`, or `Dashboard`
- **THEN** they SHALL be able to run a single verification command
- **AND** that command SHALL include type checks, unit tests, targeted visual regression, and a shell navigation E2E

### Requirement: Semantic Workbench Pages SHALL Share Frontend View Models
Semantic center pages SHALL use shared frontend view models and state abstractions instead of page-local ad hoc data shaping.

#### Scenario: Reuse object summary model
- **WHEN** a semantic center page renders an object list, preview, or inspector
- **THEN** it SHALL consume a shared summary model such as `SemanticObjectSummary`
- **AND** it SHALL NOT redefine the same object identity fields independently on each page

#### Scenario: Reuse governance and structure summaries
- **WHEN** a semantic center page needs lifecycle, binding, drift, or structure information
- **THEN** it SHALL consume shared abstractions such as governance state, structure summary, and workbench context items
- **AND** those abstractions SHALL support reuse across inventory, studio, canvas, and developer pages

### Requirement: Semantic Workbench Pages SHALL Use Functional Copy
Semantic center page copy SHALL describe function, current state, or available action, and SHALL NOT use step-by-step process narration as default descriptive text.

#### Scenario: Render page header description
- **WHEN** a semantic page renders its header description
- **THEN** the description SHALL summarize what the module is for
- **AND** it SHALL NOT default to “先…再…” or other workflow narration

#### Scenario: Render panel description
- **WHEN** a semantic page renders panel descriptions, empty states, or inspector summaries
- **THEN** the copy SHALL explain what the panel shows or maintains
- **AND** it SHALL avoid redundant process instructions unless the panel is explicitly an onboarding surface

### Requirement: Semantic Center Management Pages SHALL Focus On Search And Overview
语义中心中的管理页 SHALL 只承担对象检索、筛选和概况查看职责，且 SHALL NOT 在首屏混入设计能力。

#### Scenario: Browse cubes from Cube 管理
- **WHEN** 用户打开 `Cube 管理`
- **THEN** 页面 SHALL 提供搜索、筛选、列表和当前 Cube 预览
- **AND** 页面 SHALL NOT 在首屏展示 DSL 编辑、快速查询构建器或无上下文的跨工作区跳转

#### Scenario: Browse domains from 领域管理
- **WHEN** 用户打开 `领域管理`
- **THEN** 页面 SHALL 提供 Catalog 树、领域列表和当前领域概况
- **AND** 页面 SHALL NOT 在首屏同时展示当前领域编辑大表单和新建另一个领域的大表单

### Requirement: Semantic Center Design Pages SHALL Focus On Editing And Publishing
语义中心中的设计页 SHALL 只承担对象定义、关系编排和发布职责，且 SHALL NOT 在首屏混入目录台账、对象浏览台账或消费验证能力。

#### Scenario: Edit a cube in Cube 设计
- **WHEN** 用户进入 `Cube 设计`
- **THEN** 页面 SHALL 围绕基础信息、维度、指标和校验反馈组织
- **AND** 页面 SHALL NOT 将领域关系、查询验证或目录浏览作为主流程

#### Scenario: Model a domain in 领域设计
- **WHEN** 用户进入 `领域设计`
- **THEN** 页面 SHALL 围绕 Cube 库、画布、Inspector 和发布动作组织
- **AND** 页面 SHALL NOT 混入目录长列表、查询器或 YAML 编辑器

### Requirement: Semantic Center Pages SHALL Keep A Single Primary Task On First Screen
语义中心四个核心页面 SHALL 在首屏只呈现单一主任务，并 SHALL 使用唯一主按钮和受控次按钮表达当前动作。

#### Scenario: First screen shows one primary task
- **WHEN** 用户首次进入任一核心页面
- **THEN** 其首屏 SHALL 只围绕当前任务展示上下文与主操作
- **AND** 页面 SHALL NOT 通过大段说明文案解释页面职责

#### Scenario: Primary actions stay bounded
- **WHEN** 页面渲染主操作区域
- **THEN** 页面 SHALL 只有一个主按钮
- **AND** 页面 MAY 额外提供一个次按钮
- **AND** 页面 SHALL NOT 将多个跨工作区跳转同时作为主操作

### Requirement: Semantic Center Navigation SHALL Preserve Only Valid Workflow Jumps
语义中心页面之间 SHALL 只保留顺主流程跳转，并 SHALL 移除会破坏页面边界理解的无效跳转。

#### Scenario: Management pages jump only into design pages
- **WHEN** 用户在 `Cube 管理` 或 `领域管理` 中执行主操作
- **THEN** 目标页面 SHALL 分别进入 `Cube 设计` 或 `领域设计`
- **AND** 页面 SHALL NOT 将技术工作区或其他对象工作区作为业务主 CTA

#### Scenario: Design pages return to their management context
- **WHEN** 用户在 `Cube 设计` 或 `领域设计` 中执行返回动作
- **THEN** 页面 SHALL 返回对应的管理页上下文
- **AND** 页面 SHALL NOT 要求用户通过无关工作区回流

### Requirement: Semantic Center SHALL Maintain Layout And Workflow Regression Coverage
语义中心 SHALL 为四个核心页面提供布局职责、主操作和关键流程的自动化回归覆盖。

#### Scenario: Unit and interaction coverage
- **WHEN** 前端执行页面与组件测试
- **THEN** 测试 SHALL 验证管理页不混入设计能力
- **AND** 测试 SHALL 验证设计页不混入管理能力
- **AND** 测试 SHALL 验证主按钮唯一、关键摘要不重复

#### Scenario: End-to-end and visual coverage
- **WHEN** 前端执行语义中心 E2E 与视觉回归
- **THEN** 自动化 SHALL 覆盖 `Cube 管理` 浏览、`Cube 设计` 保存、`领域管理` 浏览、`领域设计` 发布四条主链路
- **AND** 视觉基线 SHALL 覆盖四个核心页面的首屏布局

### Requirement: Semantic Frontend Verification Workflow
The semantic frontend SHALL provide a repeatable verification workflow for critical semantic center changes.

#### Scenario: Run semantic frontend verification
- **WHEN** semantic center pages, semantic API integration, or semantic route behavior are changed
- **THEN** developers MUST be able to run documented verification steps including type check, production build, and critical browser smoke tests

#### Scenario: Validate semantic critical paths in browser
- **WHEN** semantic frontend critical paths are validated
- **THEN** the workflow MUST include browser smoke checks for domain creation, domain publish, and cube draft generation

### Requirement: Ontology Relations Page Must Provide Graph + Table Dual View

The Ontology Relations page SHALL render an SVG relationship graph alongside
the relation table within a single route, so that users can see object-level
relationship structure and the underlying relation list at the same time.

#### Scenario: Render graph and list side-by-side

- **WHEN** a user navigates to `/semantic/ontology/relations`
- **THEN** the page MUST render an SVG graph whose nodes correspond to the
  unique business objects participating in relations and whose edges
  correspond to declared business relations
- **AND** the page MUST render the relation list table beside (or below on
  narrow viewports) the graph, exposing the same relation set

#### Scenario: Selection synchronization

- **WHEN** a user selects a node in the graph
- **THEN** the table MUST filter to show only relations involving that
  object
- **AND** **WHEN** a user selects a row in the table
- **THEN** the corresponding edge and its endpoints in the graph MUST be
  visually highlighted

#### Scenario: Clearing selection

- **WHEN** the user dismisses the current selection (e.g. via a clear button
  or empty-area click)
- **THEN** the table MUST return to the unfiltered view and the graph MUST
  return to a no-active-selection state

### Requirement: Ontology Relation Graph SHALL Be A Reusable Component

The Ontology workbench SHALL expose a reusable SVG graph component that
takes ontology objects and relations as input and renders them as nodes and
edges, independent of the cube join graph used elsewhere.

#### Scenario: Component takes ontology data and renders nodes / edges

- **WHEN** the component receives a list of business objects and a list of
  business relations
- **THEN** it MUST render one node per unique object and one edge per
  relation
- **AND** it MUST not depend on cube / dimension data structures

#### Scenario: Node positions are persisted

- **WHEN** a user drags a node to a new position
- **THEN** the new layout MUST be persisted in browser localStorage so the
  user sees the same arrangement on the next visit

### Requirement: Ontology Object Click MUST Open A Workbench Tab

The Ontology Objects list SHALL open business objects in the AppShell tab
strip via `useAppShell().openTab`, so that users can keep multiple objects
in parallel and switch between them without losing context.

#### Scenario: Click row opens a tab

- **WHEN** a user clicks a row in the ontology objects list
- **THEN** the system MUST call `openTab` with an id namespaced as
  `ontology-object:<name>`, a label equal to the object title (or name
  fallback), and a `to` value pointing to
  `/semantic/ontology/objects/<name>`
- **AND** the system MUST navigate to that route so the tab content is
  rendered immediately

#### Scenario: Repeated clicks reuse the same tab

- **WHEN** a user clicks the same row again
- **THEN** the system MUST NOT create a duplicate tab; it MUST activate the
  existing tab instead

#### Scenario: PeekPanel is not used for ontology object preview

- **WHEN** a user clicks a row in the ontology objects list
- **THEN** the system MUST NOT render a PeekPanel side drawer for that
  object; preview is delegated to the tab opened in the AppShell tab strip

