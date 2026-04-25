## ADDED Requirements

### Requirement: Semantic Query Must Use Domain Context For Multi-Cube Queries
The system SHALL require an explicit Domain context for multi-Cube semantic queries and SHALL treat Domain as a lifecycle-managed modeling object.

#### Scenario: Multi-cube query requires active domain context
- **WHEN** a semantic query references more than one Cube
- **THEN** the request must include `domain_code` or `domain_id`
- **AND** the referenced Domain must be in `active` status
- **AND** queries against `draft` or `archived` Domains are rejected with a clear diagnostic

### Requirement: Domain Lifecycle Must Be Manageable
The system SHALL manage Domain as a first-class semantic modeling object with explicit lifecycle states.

#### Scenario: Create domain as draft
- **WHEN** a user creates a new Domain
- **THEN** the system creates the Domain in `draft` status by default
- **AND** the Domain is not eligible for default multi-Cube query consumption until it is published

#### Scenario: Publish domain activates it
- **WHEN** a `draft` Domain passes structural validation and publish checks
- **THEN** the Domain status becomes `active`
- **AND** the system persists the corresponding `domain_<code>.yml`

#### Scenario: Archive domain without destructive deletion
- **WHEN** a Domain is archived
- **THEN** its status becomes `archived`
- **AND** the Domain remains readable for history and compatibility
- **AND** new queries are discouraged or blocked by status diagnostics

### Requirement: Domain Creation Must Be Minimal
The system SHALL minimize manual input when creating a Domain draft.

#### Scenario: Create domain from name only
- **WHEN** a user submits a new Domain with only a `name`
- **THEN** the backend generates a stable `code` and `id`
- **AND** the backend initializes empty `cubes` and `joins`
- **AND** the Domain is saved as a `draft`

### Requirement: Domain Publish Must Detect Duplicate Structures
The system SHALL prevent structurally duplicate Domain definitions from being published.

#### Scenario: Reject fully duplicated domain structure
- **WHEN** a Domain publish request produces a structure fingerprint identical to another existing Domain
- **THEN** the publish operation is rejected
- **AND** the error message identifies that the Domain structure duplicates an existing published model

#### Scenario: Fingerprint includes cubes and join semantics
- **WHEN** the system computes a Domain structure fingerprint
- **THEN** it includes the sorted Cube set
- **AND** the sorted Join set including source cube, target cube, source field, target field, join type, cardinality, and aggregation strategy

### Requirement: Domain Canvas Must Stay Focused On Relationship Modeling
The system SHALL keep Domain Canvas focused on Domain-level Cube relationship modeling and SHALL not require datasource-table creation steps in that workspace.

#### Scenario: Canvas excludes physical table discovery
- **WHEN** a user opens a Domain Canvas
- **THEN** the canvas allows dragging existing Cubes, connecting them, and publishing the Domain
- **AND** the canvas does not expose datasource table browsing or Cube draft generation controls
