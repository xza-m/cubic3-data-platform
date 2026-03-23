## ADDED Requirements

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

The frontend SHALL provide a business component library in `src/components/business/` that wraps shadcn/ui components with platform-specific styling and behavior.

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
