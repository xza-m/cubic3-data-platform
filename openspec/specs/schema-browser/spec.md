# schema-browser Specification

## Purpose
TBD - created by archiving change add-universal-schema-browser. Update Purpose after archive.
## Requirements
### Requirement: Hierarchical Schema Tree Navigation

The SchemaBrowser component SHALL provide a unified, hierarchical tree view for browsing metadata across heterogeneous data sources. The tree structure SHALL follow the logical hierarchy: Datasource → Database → Schema (optional) → Table/View → Columns.

#### Scenario: Lazy loading of child nodes
- **WHEN** a user expands a tree node (e.g., a database node)
- **THEN** the component SHALL fetch child metadata from the backend on demand
- **AND** display a loading indicator while the request is in progress
- **AND** cache the loaded children until explicitly refreshed

#### Scenario: Schema level skipped for non-supporting sources
- **WHEN** the selected datasource is MySQL, ClickHouse, or MaxCompute
- **THEN** the tree SHALL skip the Schema level and go directly from Database to Table
- **AND** only PostgreSQL or similar sources SHALL display the Schema level

#### Scenario: Column metadata display
- **WHEN** a user expands a table node
- **THEN** the component SHALL display columns with their name, data type icon, and annotations (primary key 🔑, partition key 🧩, nullable)

### Requirement: Schema Search and Filter

The SchemaBrowser component SHALL support local keyword search to filter visible nodes.

#### Scenario: Keyword search across names
- **WHEN** a user types a keyword in the search input
- **THEN** only nodes whose name or comment contains the keyword SHALL be visible
- **AND** parent nodes of matching nodes SHALL remain visible to preserve hierarchy

#### Scenario: Object type filter
- **WHEN** a user selects a type filter (e.g., "Tables only" or "Views only")
- **THEN** only objects of the selected type SHALL be displayed in the tree

### Requirement: Schema Browser Interaction Modes

The SchemaBrowser component SHALL support configurable interaction modes via callback props to adapt to different host contexts.

#### Scenario: Single click selection
- **WHEN** a user single-clicks a table or column node
- **THEN** the component SHALL invoke the `onSelect` callback with the node metadata
- **AND** visually highlight the selected node

#### Scenario: Double-click insertion in SQL Editor
- **WHEN** the SchemaBrowser is used inside the SQL Editor and a user double-clicks a table or column name
- **THEN** the component SHALL invoke the `onDoubleClick` callback
- **AND** the host page SHALL insert the fully qualified reference (e.g., `schema.table` or `column_name`) at the editor cursor position

### Requirement: Schema Context Menu

The SchemaBrowser component SHALL provide a right-click context menu on tree nodes with quick-action shortcuts.

#### Scenario: Copy operations
- **WHEN** a user right-clicks a node and selects "Copy Name" or "Copy Full Path"
- **THEN** the selected value SHALL be copied to the system clipboard

#### Scenario: Generate SELECT SQL
- **WHEN** a user right-clicks a table node and selects "Generate SELECT"
- **THEN** the system SHALL generate a `SELECT * FROM <table> LIMIT 100` SQL template
- **AND** invoke the `onInsert` callback with the generated SQL

#### Scenario: Quick preview
- **WHEN** a user right-clicks a table node and selects "Preview Data"
- **THEN** the system SHALL call the existing preview API and display results in the host page's result panel
- **AND** the `onPreview` callback prop SHALL be invoked with `(database, table)` parameters

#### Scenario: Refresh node
- **WHEN** a user right-clicks a node and selects "Refresh"
- **THEN** the system SHALL clear the cached children for that node
- **AND** re-fetch metadata from the backend

### Requirement: Visual Type Indicators

The SchemaBrowser component SHALL use distinct icons to visually distinguish object types and column data types.

#### Scenario: Object type icons
- **WHEN** tree nodes are rendered
- **THEN** databases SHALL display a database icon, tables SHALL display a table icon, views SHALL display a view icon, and columns SHALL display a type-specific icon

#### Scenario: Column type classification
- **WHEN** a column node is rendered
- **THEN** the icon SHALL reflect the data type category: text (String/Varchar), numeric (Int/Decimal/Float), temporal (Date/Time/Timestamp), boolean, or other (JSON/Binary)

### Requirement: SchemaBrowser Reusability

The SchemaBrowser component SHALL be reusable across multiple pages without modification.

#### Scenario: Embedded in Query Editor
- **WHEN** the SchemaBrowser is rendered inside the Query Editor page
- **THEN** it SHALL support double-click insertion and right-click SQL generation
- **AND** it SHALL display in a collapsible side panel

#### Scenario: Embedded in Dataset Registration (deferred)
- **STATUS**: Deferred to a future iteration. The Dataset Registration flow was replaced by `SaveAsDatasetDialog` integrated into the Query Editor (see tasks 4.3–4.6).
- **WHEN** the SchemaBrowser is rendered inside the Dataset Registration page
- **THEN** it SHALL support single-click table selection
- **AND** the host page SHALL use the `onSelect` callback to populate form fields

