## ADDED Requirements

### Requirement: Semantic Contract Enforcement
The system SHALL treat Cube and View definitions as executable semantic contracts rather than passive YAML metadata.

#### Scenario: Validate semantic references during load
- **WHEN** a Cube or View YAML is loaded
- **THEN** the system SHALL validate JOIN target Cubes, foreign key references, View join paths, and included field names
- **AND** reject invalid definitions with descriptive diagnostics

#### Scenario: Enforce public exposure rules
- **WHEN** a consumer-facing API lists or resolves semantic objects
- **THEN** the system SHALL expose only `public=true` Views by default
- **AND** internal-only objects SHALL not appear in default Agent discovery results

### Requirement: Compiler Semantic Correctness
The system SHALL generate SQL that preserves declared semantic meaning for joins, filters, and time constraints.

#### Scenario: Join source placeholder resolution
- **WHEN** the compiler renders a JOIN condition containing `{CUBE}` and `{target_cube}`
- **THEN** `{CUBE}` SHALL resolve to the current JOIN edge source cube
- **AND** `{target_cube}` SHALL resolve to the current JOIN edge target cube

#### Scenario: Default filters on joined cubes
- **WHEN** a query joins from a primary Cube to another Cube with `default_filters`
- **THEN** the primary Cube filters SHALL be applied in `WHERE`
- **AND** joined Cube filters SHALL be applied in the corresponding `JOIN ... ON` clause

#### Scenario: Join fan-out protection
- **WHEN** a query would traverse a `1:N` semantic relationship for aggregate measures
- **THEN** the compiler SHALL reject the query or apply the explicitly configured safe aggregation strategy
- **AND** it SHALL never silently produce inflated measures

#### Scenario: Max range enforcement
- **WHEN** a query specifies a time range exceeding `partition.max_range_days`
- **THEN** the compiler SHALL reject the query with an actionable error

### Requirement: Semantic Query Execution
The system SHALL provide a single semantic query path that compiles DSL, validates readonly SQL, executes against the adapter, and returns normalized results.

#### Scenario: Shared execution path
- **WHEN** Agent tools or Semantic DevTools submit a DSL query
- **THEN** both SHALL use the same semantic query execution pipeline
- **AND** receive a normalized response containing SQL, columns, data, row count, execution time, and retryability metadata

#### Scenario: Retryable execution failure
- **WHEN** execution fails with a transient backend error
- **THEN** the system SHALL classify the failure as retryable
- **AND** return a user-facing hint explaining the retryability

### Requirement: View Materialization Traceability
The system SHALL preserve semantic lineage when logically publishing a View to a virtual dataset, without creating a physical materialized result table.

#### Scenario: Materialize a view
- **WHEN** a user materializes a View
- **THEN** the system SHALL create or update the virtual dataset using the compiled SQL
- **AND** persist the source view name, generated SQL, field mappings, definition summary, and update timestamp for traceability
- **AND** it SHALL NOT create a physical result table or persist query result rows as part of the publish flow

### Requirement: Architecture-Aligned Semantic Services
The system SHALL implement semantic-layer enhancements using the current layered architecture and single-responsibility boundaries.

#### Scenario: Keep publish logic out of the API layer
- **WHEN** the semantic View publish flow is implemented
- **THEN** the REST API layer SHALL only parse requests, invoke application services, and map responses
- **AND** the publish orchestration SHALL live in an application-layer service rather than in the API module

#### Scenario: Keep compiler free of infrastructure concerns
- **WHEN** semantic query compilation is implemented
- **THEN** the compiler SHALL only transform DSL into SQL and enforce semantic rules
- **AND** it SHALL NOT directly read YAML files, execute SQL, or persist datasets

### Requirement: Drift Detection Completeness
The system SHALL detect semantic drift beyond simple physical column additions and removals.

#### Scenario: Join or view drift detected
- **WHEN** a JOIN expression references a missing physical field or a View references a missing Cube field
- **THEN** the drift report SHALL include the broken semantic object, drift type, and repair hint

#### Scenario: Dynamic enum source unavailable
- **WHEN** a dimension declares `enum_source` and the enum source cannot be resolved
- **THEN** the system SHALL report a semantic validation diagnostic instead of silently ignoring it

### Requirement: Delivery Closure
The system SHALL not consider the semantic layer change complete until implementation, tests, and business acceptance scenarios all pass.

#### Scenario: Test closure gate
- **WHEN** the semantic layer change is prepared for delivery
- **THEN** compiler, service, and API automated tests SHALL all pass
- **AND** at least three real business Recipe scenarios SHALL complete end-to-end verification

#### Scenario: Production readiness gate
- **WHEN** the semantic layer is proposed as the default Agent query path
- **THEN** at least one View logical publish flow and one drift detection flow SHALL be validated successfully

#### Scenario: Test-friendly delivery gate
- **WHEN** semantic-layer modules are prepared for delivery
- **THEN** repositories, adapters, and schema inspectors SHALL be replaceable in tests without cross-layer hacks
- **AND** the final design SHALL avoid unnecessary infrastructure or abstraction that is not required by the delivery scope
