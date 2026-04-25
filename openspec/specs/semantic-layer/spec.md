# semantic-layer Specification

## Purpose
TBD - created by archiving change add-measure-descriptions. Update Purpose after archive.
## Requirements
### Requirement: Measure Minimal Descriptions
The system SHALL support low-maintenance descriptive metadata for measures defined inside a Cube.

#### Scenario: Legacy YAML remains valid
- **WHEN** a Cube measure definition omits `description` and `certified`
- **THEN** the YAML SHALL still load successfully
- **AND** `description` SHALL default to empty or null
- **AND** `certified` SHALL default to `false`

#### Scenario: Measure descriptions are defined in Cube
- **WHEN** a Cube YAML measure includes `description` or `certified`
- **THEN** the system SHALL treat them as measure metadata
- **AND** the metric SHALL continue to be defined within `Cube.measures`

### Requirement: Measure Descriptions Are Exposed To Consumers
The system SHALL expose measure descriptions and certification flags through semantic discovery APIs.

#### Scenario: describe_cube returns measure descriptions
- **WHEN** a consumer requests `describe_cube`
- **THEN** each measure in the response SHALL include `title`, `type`, `description`, and `certified`

#### Scenario: Missing description does not break consumers
- **WHEN** a measure has no explicit description
- **THEN** the API SHALL still return the measure
- **AND** the consumer SHALL receive an empty or null `description` rather than an error

### Requirement: Frontend Minimal Display
The system SHALL present measure descriptions in the semantic UI without introducing new modeling workflows.

#### Scenario: Cube detail shows certified measure
- **WHEN** a measure has `certified=true`
- **THEN** the semantic detail page SHALL display that measure as certified

#### Scenario: Cube detail shows measure description
- **WHEN** a measure has a `description`
- **THEN** the semantic detail page SHALL display the description alongside the measure name

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

### Requirement: Semantic Object State Tracking
The system MUST 为语义对象提供统一、可追踪的状态摘要，以便前端、Agent 和 API 使用相同状态视图。

#### Scenario: Cube details expose state summary
- **WHEN** 客户端请求 `describe_cube`
- **THEN** 响应中包含该 Cube 的 `state_summary`
- **AND** 至少包含定义哈希、最近 drift 状态和最近 drift 检查时间

#### Scenario: View details expose publish and drift summaries
- **WHEN** 客户端请求 `describe_view`
- **THEN** 响应中包含 `publish_summary` 和 `drift_summary`
- **AND** 发布状态与最近发布时间来自统一的 registry 元数据

### Requirement: Application Services Are Split By Responsibility
The system MUST 按定义、查询、发布、漂移检测拆分语义层应用服务，避免单个服务承担多种变化原因。

#### Scenario: Semantic layer facade remains compatible
- **WHEN** 现有调用方继续通过语义层门面调用 `list_cubes`、`describe_cube`、`query`
- **THEN** 行为保持兼容
- **AND** 门面内部只做委托，不再承载核心实现逻辑

### Requirement: Semantic Metric Info Is Standardized
The system MUST 向前端、Agent 和 API 输出统一的指标语义对象，而不是让各消费方直接解释 measure 原始结构。

#### Scenario: Cube details return standardized metric objects
- **WHEN** 客户端请求 `describe_cube`
- **THEN** `measures` 中的每个指标对象至少包含 `name`、`title`、`type`、`description`、`certified`

#### Scenario: Agent and frontend consume the same metric fields
- **WHEN** Agent 和前端分别消费同一个 Cube 的指标信息
- **THEN** 两者看到的指标说明和认证状态保持一致

### Requirement: Semantic APIs Must Be Test Friendly
The system MUST 通过显式依赖注入提供可替换的查询和漂移检测依赖，避免 API 层直接依赖隐藏静态实现。

#### Scenario: Query API can be tested without patching internal static methods
- **WHEN** 集成测试构造语义层 Blueprint
- **THEN** 可以通过注入 provider 完成查询依赖替换
- **AND** 不需要 patch 内部静态方法才能覆盖 `/semantic/query`

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

