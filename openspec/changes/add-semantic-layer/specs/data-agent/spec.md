## MODIFIED Requirements

### Requirement: Tool Registry and Tool Executor
The system SHALL maintain a `ToolRegistry` that provides `for_context(channel, adapter)` returning channel-appropriate tool definitions and a `ToolExecutor` bound to the given data source adapter. For the Feishu channel, the registry SHALL return semantic layer tools (`list_cubes`, `describe_cube`, `query`) alongside `execute_sql` as fallback, replacing the previous `read_knowledge`, `describe_table`, `list_tables` tools.

#### Scenario: Feishu channel with semantic layer
- **WHEN** `channel == "feishu"` and the semantic layer is enabled
- **THEN** the registry SHALL return tools: `list_cubes`, `describe_cube`, `query`, `execute_sql`
- **AND** `describe_cube` SHALL automatically attach relevant Query Recipes as few-shot examples
- **AND** `query` SHALL invoke the Compiler pipeline (DSL → SQL) before executing

#### Scenario: DataChat channel unchanged
- **WHEN** `channel == "datachat"`
- **THEN** the registry SHALL continue returning only `execute_sql` bound to the dataset's adapter
