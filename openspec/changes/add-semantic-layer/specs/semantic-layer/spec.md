## ADDED Requirements

### Requirement: Cube Definition
The system SHALL support YAML-based Cube definitions containing dimensions, measures, joins, segments, partitions, default filters, and enums, serving as the single source of truth for semantic metadata.

#### Scenario: Load and validate Cube YAML
- **WHEN** a Cube YAML file is placed in the `infrastructure/semantic/cubes/` directory
- **THEN** the system SHALL load, validate (required fields, type checks, reference integrity), and register it in the CubeRepository
- **AND** reject files with missing required fields (name, title, table, dimensions, measures) with descriptive error messages

#### Scenario: Cube with dynamic enum loading
- **WHEN** a Cube dimension declares `enum.source: dict_table` with a dict_code
- **THEN** the system SHALL query the metadata dictionary table at load time and merge results into the dimension's enum values

### Requirement: View Definition
The system SHALL support View YAML definitions that curate fields from multiple Cubes, specifying a join path and exposing selected dimensions/measures to consumers.

#### Scenario: View resolution during compilation
- **WHEN** a QueryDSL references a View name in its measures or dimensions
- **THEN** the Compiler SHALL resolve View field references to their underlying Cube fully-qualified names before proceeding with compilation

#### Scenario: View materialization to virtual dataset
- **WHEN** a user triggers View materialization via API
- **THEN** the system SHALL generate a SQL query from the View definition and create/update a virtual dataset record

### Requirement: Query Recipe
The system SHALL support independent Recipe YAML files containing natural language questions paired with standard DSL examples, with automatic extraction of referenced Cube/View names from DSL to build a reverse index.

#### Scenario: Recipe auto-extraction and injection
- **WHEN** Recipe YAML files are loaded by YamlRecipeRepository
- **THEN** the system SHALL parse all `examples[].dsl` fields, extract `cube_name` from `cube_name.field` references, and build a reverse index `{cube_name → [recipe1, recipe2, ...]}`
- **AND** when `describe_cube` is called, return up to 5 matching Recipes prioritized by measures references

### Requirement: Query Compiler
The system SHALL compile QueryDSL into executable SQL through a 10-step pipeline: View Resolution → Cube Resolution → Measure Expansion → JOIN Path Derivation → Fan-out Protection → Partition Injection → Default Filter Injection → Time Granularity Conversion → SELECT/GROUP BY Assembly → LIMIT Guard.

#### Scenario: Single Cube query without JOIN
- **WHEN** a DSL references only one Cube's measures and dimensions
- **THEN** the Compiler SHALL generate SQL with no JOIN clause and correct GROUP BY

#### Scenario: Multi-Cube query with automatic JOIN
- **WHEN** a DSL references measures/dimensions from multiple Cubes
- **THEN** the Compiler SHALL use JoinGraph BFS to find shortest paths and generate appropriate LEFT JOIN clauses with partition conditions

#### Scenario: Fan-out protection
- **WHEN** a DSL triggers a 1:N JOIN (relationship: has_many)
- **THEN** the Compiler SHALL automatically generate Subquery JOINs to prevent measure inflation

#### Scenario: JOIN depth exceeded
- **WHEN** the derived JOIN path exceeds 3 levels
- **THEN** the Compiler SHALL raise JoinPathTooDeepError

### Requirement: SQL Dialect Abstraction
The system SHALL define a `SQLDialect` abstract interface for time granularity conversion, partition conditions, and latest partition expressions, with `MaxComputeDialect` as the P1 implementation.

#### Scenario: MaxCompute time granularity
- **WHEN** a DSL specifies `granularity: week` on a STRING-type partition field
- **THEN** MaxComputeDialect SHALL generate `WEEKOFYEAR(...)` expression
- **AND** for DATETIME fields, generate `DATETRUNC(...)` expression

### Requirement: Query Execution Retry
The system SHALL classify query execution errors as retriable (TaskTimeout, HTTP 503/504, network timeout) or non-retriable (SQL syntax, permission denied), automatically retry retriable errors up to 1 time with 3-second backoff, and return a `retriable` flag to the Agent.

#### Scenario: Retriable error with successful retry
- **WHEN** a query execution fails with MaxCompute TaskTimeout
- **THEN** the system SHALL wait 3 seconds and retry once
- **AND** if successful, return results normally

#### Scenario: Non-retriable error
- **WHEN** a query execution fails with SQL syntax error
- **THEN** the system SHALL immediately return the error with `retriable: false` and a user-facing suggestion

### Requirement: Agent Tool Integration
The system SHALL register `list_cubes`, `describe_cube`, and `query` tools in the Agent ToolRegistry, with `describe_cube` automatically attaching relevant Query Recipes and `query` invoking the Compiler pipeline.

#### Scenario: Agent query workflow
- **WHEN** a user asks a data question via Feishu or DataChat
- **THEN** the Agent SHALL call `list_cubes` to discover available Cubes/Views
- **AND** call `describe_cube` to get schema + Recipes
- **AND** construct a QueryDSL and call `query` to execute

### Requirement: Schema Sync Detection
The system SHALL periodically compare YAML Cube definitions against physical table schemas and detect field additions, removals, and type changes (drift).

#### Scenario: Drift detected
- **WHEN** a physical table has columns not present in the Cube YAML
- **THEN** the system SHALL generate a drift report and send a Feishu alert notification

### Requirement: Semantic Center Frontend
The system SHALL provide a frontend module under `/semantic` with Cube management list, relationship canvas (P2), and Developer Tools (Playground, Schema Sync, YAML Editor, Compile Debugger tabs).

#### Scenario: Cube list page
- **WHEN** a user navigates to `/semantic/cubes`
- **THEN** the system SHALL display all Cubes with search, type filter, and drift status badges

#### Scenario: Developer tools
- **WHEN** a user navigates to `/semantic/devtools`
- **THEN** the system SHALL display a tabbed interface with Playground, Schema Sync, YAML Editor, and Compile Debugger
