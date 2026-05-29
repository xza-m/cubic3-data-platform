## MODIFIED Requirements

### Requirement: Formal Warehouse Queries Use Gateway Execution

The system SHALL submit formal, user or Agent initiated, audited warehouse queries to `dw-query-gateway`.

#### Scenario: Agent semantic execute submits to gateway
- **WHEN** `/api/v1/agent/semantic/execute` receives an allowed semantic plan with executable SQL
- **THEN** data-platform submits the query to `dw-query-gateway`
- **AND** the response includes a gateway query identifier
- **AND** data-platform does not create a local execution job

#### Scenario: Query workbench remains adapter SPI
- **WHEN** a user runs SQL from the query workbench or SQL Lab
- **THEN** data-platform executes through the DataSource Adapter SPI
- **AND** this interactive path is not treated as the formal audited warehouse execution plane

## REMOVED Requirements

### Requirement: Data-platform Internal Query Execution Surface

The system SHALL NOT expose a local query execution API, local execution worker, or local execution result store for formal warehouse queries.

#### Scenario: Internal execution API is absent
- **WHEN** OpenAPI is generated
- **THEN** no `/api/v1/query-execution/*` path is present

#### Scenario: Internal execution worker is absent
- **WHEN** the platform starts local workers
- **THEN** no data-platform query execution worker is required
