## ADDED Requirements

### Requirement: Cube Must Bind A Real Datasource
The system SHALL treat Cube as a first-class modeling object that binds to a real datasource managed by the existing datasource platform.

#### Scenario: Create cube draft from datasource table
- **WHEN** a user selects an existing datasource and physical table to initialize a Cube draft
- **THEN** the generated Cube definition includes `source_id`
- **AND** the Cube definition records source database/schema context when available
- **AND** the Cube enters `draft` status by default

### Requirement: Cube Lifecycle Must Be Manageable
The system SHALL manage Cube lifecycle using explicit statuses.

#### Scenario: Activate cube after validation
- **WHEN** a valid Cube is activated
- **THEN** its status becomes `active`
- **AND** it is eligible for default query, view dependency, agent, and canvas consumption

#### Scenario: Deprecate cube without destructive deletion
- **WHEN** a Cube is deprecated
- **THEN** its status becomes `deprecated`
- **AND** the Cube remains readable for compatibility
- **AND** new consumers receive status-based diagnostics instead of destructive removal

### Requirement: Runtime Binding Must Follow Cube Datasource
The system SHALL resolve query execution, schema inspection, enum loading, and SQL dialect from the Cube's bound datasource instead of a hard-coded default runtime.

#### Scenario: Query uses cube-specific runtime binding
- **WHEN** a semantic query references an `active` Cube
- **THEN** the query service resolves adapter and dialect from that Cube's `source_id`

#### Scenario: Cross-source joins are rejected
- **WHEN** a semantic query references Cubes bound to different datasources
- **THEN** the query compilation or execution is rejected with a clear diagnostic

### Requirement: Canvas Must Support Cube-Centric Modeling Flow
The semantic canvas SHALL serve as the primary Cube modeling workbench instead of a read-only relation browser.

#### Scenario: Create cube from canvas workflow
- **WHEN** a user opens the semantic canvas
- **THEN** the user can browse datasource tables, generate a Cube draft, and create a Cube from the same workspace
- **AND** the canvas shows Cube status, datasource binding, and structural summary

### Requirement: View Lifecycle Must Respect Cube Lifecycle
The system SHALL enforce View lifecycle rules based on the lifecycle of dependent Cubes.

#### Scenario: View dependency on inactive cube is diagnosed
- **WHEN** a View depends on one or more Cubes that are not `active`
- **THEN** validation or publish flow returns diagnostics describing the dependency issue
- **AND** the View is blocked from default publish/consume flow when required

### Requirement: Metric Info Must Be Standardized For Consumers
The system SHALL expose a unified metric object for frontend, API, and agent consumers while keeping measures defined inside `Cube.measures`.

#### Scenario: Describe cube returns standardized metrics
- **WHEN** a client describes a Cube
- **THEN** each measure is exposed as a standardized `MetricInfo`
- **AND** the object includes `name`, `title`, `type`, `description`, and `certified`

### Requirement: Semantic Object State Must Be Unified
The system SHALL generate semantic object state summaries on the backend and expose them uniformly to frontend, API, and agent consumers.

#### Scenario: Cube detail includes unified state summary
- **WHEN** a client requests Cube detail
- **THEN** the response includes lifecycle status, datasource binding summary, publish summary, drift summary, and metric summary snapshots from backend-generated state data

### Requirement: Delivery Must Remain Test Friendly
The system SHALL keep semantic modeling enhancements test friendly and verifiable end-to-end.

#### Scenario: Modeling platform delivery verification
- **WHEN** semantic modeling platform changes are delivered
- **THEN** backend unit and integration tests pass
- **AND** frontend type checking and build pass
- **AND** at least one Cube lifecycle, one View dependency, one metric info, and one drift status path are verifiable in tests
