## ADDED Requirements
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
