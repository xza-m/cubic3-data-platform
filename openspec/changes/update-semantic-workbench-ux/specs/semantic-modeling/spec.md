## ADDED Requirements
### Requirement: Semantic Workbench Experience Baseline
The semantic center SHALL use a consistent workbench layout pattern across overview, semantic model management, domain catalog, domain modeling, and developer tools pages.

#### Scenario: Stable page composition
- **WHEN** a user enters any semantic center primary page
- **THEN** the page SHALL present a stable hierarchy of page header, status summary or primary action region, main work area, and contextual inspector or detail region
- **AND** the page SHALL NOT introduce a conflicting page skeleton outside the semantic workbench language

#### Scenario: Utility copy only
- **WHEN** semantic center pages render headings, descriptions, and action labels
- **THEN** the copy SHALL describe the current object, current state, or next available action
- **AND** the page SHALL NOT use marketing slogans, campaign-style hero language, or decorative product messaging

### Requirement: Cube Management Triage Workflow
The semantic model management page SHALL help users identify and process high-priority `Cube` objects before routine browsing.

#### Scenario: Issue-first default scan
- **WHEN** a user opens the `Cube` management page
- **THEN** the page SHALL expose filters and ordering that surface draft models, failed validation, missing source bindings, or high-reuse models first
- **AND** the page SHALL emphasize which objects need action rather than only listing object summaries

#### Scenario: Table-first comparison
- **WHEN** a user reviews multiple `Cube` objects
- **THEN** the page SHALL provide a table-oriented primary view for comparing state, domain binding, source binding, reuse signals, and recent changes
- **AND** it MAY provide a side preview panel without replacing the table as the primary workspace

### Requirement: Cube Studio Staged Workflow
The semantic model studio SHALL guide users through a staged single-model workflow instead of a monolithic form.

#### Scenario: Step-oriented modeling
- **WHEN** a user creates or edits a `Cube`
- **THEN** the page SHALL separate the workflow into staged tasks such as basic info, source binding, dimensions and measures, semantic rules, validation preview, and save or publish actions
- **AND** the page SHALL keep the current step visually dominant while preserving access to prior context

#### Scenario: Validation before save
- **WHEN** a user attempts to save or publish a `Cube`
- **THEN** the page SHALL summarize blockers, warnings, and structure size before the primary action
- **AND** the user SHALL be able to return to the relevant stage without leaving the studio workflow

### Requirement: Domain Catalog Governance Lens
The domain catalog page SHALL support governance-oriented scanning in addition to directory browsing.

#### Scenario: Catalog-level governance signals
- **WHEN** a user browses catalogs
- **THEN** each catalog entry SHALL expose governance signals such as empty directories, draft accumulation, or publish status distribution
- **AND** the page SHALL help the user understand which catalog or domain needs follow-up first

#### Scenario: Domain-to-modeling closure
- **WHEN** a user selects a domain inside the catalog page
- **THEN** the page SHALL expose clear actions to continue domain modeling or create new domain work from the current directory context
- **AND** the user SHALL NOT need to infer the next modeling path from unrelated navigation

### Requirement: Domain Canvas Professional Modeling Experience
The domain canvas SHALL prioritize professional modeling readability and Join editing continuity over decorative visual treatment.

#### Scenario: Canvas-centered modeling
- **WHEN** a user opens a domain canvas
- **THEN** the central modeling area SHALL remain the dominant workspace
- **AND** the cube library, toolbar, and inspector SHALL reinforce the active modeling task rather than compete equally for attention

#### Scenario: Join editing continuity
- **WHEN** a user selects or creates a Join
- **THEN** the page SHALL present a continuous editing flow for field mapping, join type, cardinality, aggregation strategy, description, and save or delete actions
- **AND** the user SHALL be able to understand relation completeness before publishing the domain

### Requirement: DevTools Lightweight IDE Context
The developer tools page SHALL provide a lightweight IDE-style context for semantic resources.

#### Scenario: Resource-aware workspace
- **WHEN** a user switches between `Cube`, `View`, `Domain`, or `Catalog` resources in DevTools
- **THEN** the workspace SHALL clearly show the current object context, active tab, and next applicable actions
- **AND** resource switching SHALL preserve the IDE mental model of resource tree plus workspace plus result pane

#### Scenario: Productive unsupported states
- **WHEN** a selected resource does not support inline YAML editing
- **THEN** the page SHALL explain the current limitation in product language
- **AND** it SHALL provide a direct action back to the proper semantic module instead of leaving the user in a dead end
