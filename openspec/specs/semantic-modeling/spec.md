# semantic-modeling Specification

## Purpose
TBD - created by archiving change add-domain-catalog-management. Update Purpose after archive.
## Requirements
### Requirement: Catalog SHALL Be A Managed Domain Object
The platform SHALL treat `catalog` as an independently managed semantic directory object and SHALL persist it separately from `domain`.

#### Scenario: Load catalog list
- **WHEN** a user opens the domain directory
- **THEN** the platform SHALL return a list of persisted catalogs
- **AND** each catalog SHALL expose stable identity and metadata such as `code`, `name`, and `status`

#### Scenario: Default catalog exists
- **WHEN** the platform initializes or migrates historical domain data
- **THEN** it SHALL provide a real default catalog object
- **AND** domains without explicit catalog assignment SHALL belong to that default catalog

### Requirement: Domain SHALL Reference A Real Catalog
The platform SHALL make each domain reference a real catalog object instead of maintaining duplicated catalog names as its own source of truth.

#### Scenario: Update domain catalog assignment
- **WHEN** a user changes a domain's catalog assignment
- **THEN** the platform SHALL validate the target catalog exists
- **AND** the domain SHALL persist the catalog reference consistently

### Requirement: Domain Directory SHALL Support Catalog Management
The domain directory SHALL allow users to manage catalogs and browse domains within the same directory workflow.

#### Scenario: Create catalog from directory
- **WHEN** a user creates a new catalog from the domain directory
- **THEN** the new catalog SHALL appear in the left-side directory list
- **AND** the user SHALL be able to place domains under it

#### Scenario: Rename catalog
- **WHEN** a user renames a catalog
- **THEN** the directory SHALL reflect the new catalog name everywhere that catalog is shown
- **AND** domains under that catalog SHALL NOT require duplicated name updates

### Requirement: Domain Modeling Entry SHALL Accept Catalog Selection
The domain modeling entry SHALL allow users to choose the target catalog before creating a new domain.

#### Scenario: Create domain under catalog
- **WHEN** a user creates a new domain from the modeling entry
- **THEN** they SHALL be able to select an existing catalog
- **AND** the new domain SHALL be created under that catalog

#### Scenario: Missing catalog choice
- **WHEN** a user does not choose a catalog
- **THEN** the platform SHALL assign the real default catalog instead of leaving the domain unclassified

### Requirement: Semantic Center SHALL Map Backend Capability Domains To Stable Frontend Responsibilities
The semantic center SHALL organize frontend pages around stable backend capability domains instead of mirroring individual API endpoints.

#### Scenario: Map capability domains
- **WHEN** the semantic center is designed or extended
- **THEN** frontend responsibilities SHALL be grouped into definition, modeling, runtime, and governance domains
- **AND** a new page SHALL NOT be created only because a new endpoint exists

#### Scenario: Keep page responsibilities stable
- **WHEN** a developer adds semantic center functionality
- **THEN** they SHALL place it in an existing page responsibility whenever possible
- **AND** they SHALL justify any new page type against the capability-domain model

### Requirement: Semantic Center SHALL Use Five Workbench Page Types
The semantic center SHALL use five stable page types: `Overview`, `Inventory`, `Studio`, `Canvas`, and `Developer Workbench`.

#### Scenario: Assign routes to page types
- **WHEN** a semantic center route is implemented
- **THEN** it SHALL map to exactly one of the five page types
- **AND** it SHALL follow that page type's default hierarchy of header, context, main task area, and conditional inspector

#### Scenario: Avoid mixed page responsibilities
- **WHEN** a page already belongs to one page type
- **THEN** it SHALL NOT absorb unrelated responsibilities from another page type
- **AND** the UI SHALL keep modeling, governance, inventory, and developer tasks separated

### Requirement: Cube SHALL Stay The Primary Inventory Entry
The semantic center SHALL keep `Cube` as the primary inventory and modeling entry, while exposing `View` and `Recipe` as secondary semantic surfaces.

#### Scenario: Open semantic inventory
- **WHEN** a user enters the primary semantic inventory
- **THEN** the page SHALL prioritize `Cube` triage, filtering, and editing
- **AND** `View` metadata MAY appear as related information, preview content, or tooling context

#### Scenario: Expose view and recipe without new primary navigation
- **WHEN** the system needs to expose `View` or `Recipe` capabilities
- **THEN** it SHALL attach them to existing semantic pages such as detail panels or developer tools
- **AND** it SHALL NOT add separate first-level navigation entries for them in the same phase

### Requirement: Domain Entry SHALL Split Governance From Relationship Modeling
The semantic center SHALL treat domain catalog governance and domain relationship modeling as separate page responsibilities.

#### Scenario: Browse domain catalogs
- **WHEN** a user opens the domain entry page
- **THEN** the page SHALL focus on catalog governance, domain selection, and governance signals
- **AND** it SHALL NOT act as the primary relation-editing workspace

#### Scenario: Open a domain canvas
- **WHEN** a user opens a domain canvas
- **THEN** the page SHALL focus on cube relationships, Join editing, and publish checks
- **AND** it SHALL NOT act as a catalog governance or single-cube editing page

### Requirement: Developer Tools SHALL Aggregate Definition, Runtime, And Governance Support
The semantic center SHALL provide one developer workbench that aggregates definition-file editing, compile debug, and schema-sync support.

#### Scenario: Switch developer tabs
- **WHEN** a user opens developer tools
- **THEN** they SHALL access definition files, compile debug, and schema sync from one workbench
- **AND** resource switching SHALL keep the current object context visible

#### Scenario: Unsupported inline editing
- **WHEN** a selected semantic object does not support inline file editing
- **THEN** the workbench SHALL explain the limitation in product language
- **AND** it SHALL direct the user back to the appropriate semantic page type

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

### Requirement: Semantic Modeling Platform SHALL Freeze Page Responsibilities
The semantic modeling platform SHALL maintain distinct responsibilities for cube management, cube detail, cube editing, and domain relationship modeling.

#### Scenario: Navigate semantic modeling entry points
- **WHEN** a user enters the semantic center
- **THEN** they SHALL be able to distinguish cube management, cube detail, cube editing, and domain canvas as separate responsibilities

#### Scenario: Domain canvas stays focused on domain modeling
- **WHEN** a user opens domain canvas
- **THEN** the page SHALL provide only domain-level cube relationship modeling and SHALL NOT include physical table browsing or cube draft generation

### Requirement: Semantic Modeling Runtime SHALL Enforce Stable Query Context
The runtime SHALL require explicit domain context for multi-cube semantic queries and SHALL keep cross-source joins disallowed.

#### Scenario: Multi-cube query without domain context
- **WHEN** a query references multiple cubes without `domain_code` or `domain_id`
- **THEN** the system SHALL reject the query with an explicit validation error

#### Scenario: Cross-source join attempt
- **WHEN** a query or domain relation attempts to join cubes from different bound sources
- **THEN** the system SHALL reject the operation

### Requirement: Semantic Modeling Platform SHALL Formalize Domain Publish Validation
The platform SHALL treat domain publish as the only activation gate for domain relationship definitions.

#### Scenario: Publish a domain draft
- **WHEN** a user publishes a domain
- **THEN** the system SHALL validate cycles, duplicate edges, `1:N` aggregation strategy, active cube references, and duplicate domain fingerprints before activation

