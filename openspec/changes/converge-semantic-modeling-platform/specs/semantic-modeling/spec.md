## ADDED Requirements
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
