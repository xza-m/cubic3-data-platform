## 1. Backend: Metadata API Extensions

- [x] 1.1 Add `list_schemas(database)` abstract method to `BaseAdapter`
- [x] 1.2 Implement `list_schemas` in PostgreSQL adapter (query `information_schema.schemata`)
- [x] 1.3 Implement `list_schemas` in MySQL adapter (return empty list — MySQL has no separate schema concept)
- [x] 1.4 Implement `list_schemas` in ClickHouse adapter (return empty list)
- [x] 1.5 Implement `list_schemas` in MaxCompute adapter (return empty list)
- [x] 1.6 Add `GET /api/v1/datasources/<id>/schemas` API endpoint
- [x] 1.7 Add `GET /api/v1/datasources/<id>/table-schema` API endpoint (exposes existing `get_table_schema` adapter method)
- [x] 1.8 Create `GetSchemasQuery` + `GetSchemasHandler` (CQRS pattern)
- [x] 1.9 Create `GetTableSchemaQuery` + `GetTableSchemaHandler` (CQRS pattern)
- [x] 1.10 Register new handlers in DI container

## 2. Frontend: API Client Layer

- [x] 2.1 Create `src/api/schema.ts` with `getSchemas()`, `getTableSchema()` functions
- [x] 2.2 Add TypeScript types for schema metadata responses in `src/types/`

## 3. Frontend: SchemaBrowser Component

- [x] 3.1 Create `src/components/business/SchemaBrowser/types.ts` — TreeNode, NodeKey, callback interfaces
- [x] 3.2 Create `src/components/business/SchemaBrowser/useSchemaTree.ts` — data hook (lazy loading, expand/collapse, search filter)
- [x] 3.3 Create `src/components/business/SchemaBrowser/SchemaTreeNode.tsx` — single node renderer with type icons
- [x] 3.4 Create `src/components/business/SchemaBrowser/SchemaContextMenu.tsx` — right-click menu (Copy name, Generate SELECT, Preview, Refresh)
- [x] 3.5 Create `src/components/business/SchemaBrowser/SchemaBrowser.tsx` — main component assembling tree + search + context menu
- [x] 3.6 Export from `src/components/business/index.ts`

## 4. Frontend: Integration

- [x] 4.1 Refactor `Editor.tsx` —— replace inline DB structure panel with `<SchemaBrowser>`, wire `onDoubleClick` to insert into Monaco editor
- [x] ~~4.2 Refactor `DatasetRegister.tsx` —— integrate `<SchemaBrowser>` for table selection~~ *Replaced by 4.3–4.6*

### 4.x Query Center ↔ Dataset Bridge (replaces SqlLabRegister)

- [x] 4.3 Create `SaveAsDatasetDialog` component — multi-step dialog: fetch field metadata via `executeSQLSmart` → fill name/description → `FieldConfigurator` → submit via `createDataset` API
- [x] 4.4 Add "Save as Virtual Dataset" button to `Editor.tsx` toolbar — enabled only after query execution succeeds
- [x] 4.5 Update `Datasets.tsx` dropdown — redirect "SQL 虚拟数据集" entry to `/queries/editor` instead of `/data-center/datasets/register/sql`
- [x] 4.6 Remove `SqlLabRegister.tsx` and its route/import from `App.tsx`

## 5. Verification

- [x] 5.1 Manual test: browse databases → tables → columns in Query Editor
- [x] 5.2 Manual test: double-click table/column inserts into SQL editor at cursor
- [x] 5.3 Manual test: right-click → Copy name, Preview data, Generate SELECT *(Radix ContextMenu timing issue resolved after 7.4 wired onPreview)*
- [x] 5.4 Manual test: search filter works on table/column names
- [x] 5.5 Manual test: Execute query → Save as Virtual Dataset → field config → register succeeds
- [x] 5.6 Frontend build with no errors (`npx vite build`)

## 6. Bug Fixes (discovered during verification)

- [x] 6.1 Fix `Editor.tsx` — unwrap API response envelope (`result.data`) before storing in tab results
- [x] 6.2 Fix `Editor.tsx` — adapt to actual API response format: `columns` is `{name, type}[]` (not `string[]`), `data` is `Record[]` (not `unknown[][]`)
- [x] 6.3 Fix `SaveAsDatasetDialog.tsx` — use sync mode (`useAsync: false`) for field metadata fetch to avoid backend async worker stuck issue

## 7. Post-Review Fixes

- [x] 7.1 Add object type filter popover (Tables/Views) — `Filter` icon was imported but not used
- [x] 7.2 Eliminate 4 `response: any` in `useSchemaTree.ts` — replaced with typed `ApiResponse<T>` casts
- [x] 7.3 Add 200ms debounce on search input — design spec required it
- [x] 7.4 Wire `onPreview` callback from `Editor.tsx` → `SchemaBrowser` → `SchemaContextMenu` to enable "Preview Data" menu item
- [x] 7.5 Add expand/collapse animations (max-height + opacity transition 200ms) for tree nodes
- [x] 7.6 Add indent guide lines (border-l gray-200) to tree node hierarchy
- [x] 7.7 Replace ChevronDown/ChevronRight swap with single ChevronRight + CSS rotation (transform 200ms)
- [x] 7.8 Add `transition-all duration-300 ease-in-out` to panel collapse/expand
- [x] 7.9 Update spec docs — mark DatasetRegister integration as deferred (replaced by SaveAsDatasetDialog)
- [x] 7.10 Add `onPreview` to `SchemaBrowserCallbacks` interface and `FilterableNodeType` to types.ts
