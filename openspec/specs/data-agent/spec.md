# data-agent Specification

## Purpose
TBD - created by archiving change add-data-agent. Update Purpose after archive.
## Requirements
### Requirement: Agent Core — Unified Entry Point

The system SHALL provide a unified `AgentService.run(AgentRequest) → AgentResponse` entry point that accepts requests from any channel and delegates to the Agent Loop for multi-step reasoning.

#### Scenario: Feishu channel query

- **WHEN** a user sends a natural language question via Feishu P2P chat
- **THEN** `FeishuChannel` SHALL convert the event into an `AgentRequest` with `context.channel = "feishu"`
- **AND** `AgentService` SHALL execute the Agent Loop with SKILL.md knowledge and MaxCompute tools
- **AND** return an `AgentResponse` containing text, optional SQL, data, and columns

#### Scenario: DataChat channel query

- **WHEN** a user sends a message via DataChat Web UI with a bound dataset
- **THEN** `DataChatChannel` SHALL convert the HTTP request into an `AgentRequest` with `context.channel = "datachat"`, injecting conversation history
- **AND** `AgentService` SHALL execute the Agent Loop with dataset schema prompt and the dataset's data source adapter
- **AND** return an `AgentResponse` compatible with the existing DataChat API format

### Requirement: Agent Loop — Multi-Step Reasoning

The system SHALL implement an Agent Loop that iteratively calls the LLM with tool_use capability, executing tools and feeding results back until the LLM produces a final text response or the maximum round limit is reached.

#### Scenario: Successful multi-step query

- **WHEN** the LLM requests tool calls (e.g., `read_knowledge`, `describe_table`, `execute_sql`)
- **THEN** the system SHALL execute each tool via `ToolExecutor`, append results to the message history, and invoke `on_progress` callback if provided
- **AND** continue the loop until `stop_reason == "end_turn"`

#### Scenario: Maximum rounds exceeded

- **WHEN** the Agent Loop reaches the configured `max_loop_rounds` without a final response
- **THEN** the system SHALL return an `AgentResponse` with an error message asking the user to simplify their question

### Requirement: LLM Abstraction — Port/Adapter Pattern

The system SHALL define an `LLMPort` interface in the domain layer with a `chat(messages, tools, temperature)` method, and provide infrastructure adapters that map vendor-specific API responses to a unified `LLMResponse` structure.

#### Scenario: OpenAI-compatible adapter

- **WHEN** `LLMConfig.provider` is `openai` (covering Qwen, DeepSeek, GPT via compatible endpoints)
- **THEN** the `OpenAICompatibleAdapter` SHALL call the configured API base with the specified model
- **AND** map the response to `LLMResponse(content, tool_calls, stop_reason, usage)`

### Requirement: Tool Registry — Channel-Aware Tool Filtering

The system SHALL maintain a `ToolRegistry` that provides `for_context(channel, adapter)` returning channel-appropriate tool definitions and a `ToolExecutor` bound to the given data source adapter.

#### Scenario: Feishu channel tools

- **WHEN** `channel == "feishu"`
- **THEN** the registry SHALL return tools: `read_knowledge`, `describe_table`, `list_tables`, `execute_sql`
- **AND** bind them to the MaxCompute adapter from `AppInstance.config.knowledge.datasource_id`

#### Scenario: DataChat channel tools

- **WHEN** `channel == "datachat"`
- **THEN** the registry SHALL return only `execute_sql`
- **AND** bind it to the adapter created from `dataset.source`

### Requirement: Prompt Builder — Channel-Specific Strategies

The system SHALL construct differentiated System Prompts based on `AgentContext.channel`:
- Feishu: load SKILL.md with knowledge routing table, LLM uses `read_knowledge` for gradual knowledge disclosure
- DataChat: inject target dataset schema (table name + fields + types) directly into the prompt

#### Scenario: Feishu prompt with knowledge routing

- **WHEN** building a prompt for `channel == "feishu"`
- **THEN** the System Prompt SHALL include the full SKILL.md content with the knowledge routing table
- **AND** the LLM SHALL use `read_knowledge` tool to load domain-specific documents on demand

#### Scenario: DataChat prompt with schema injection

- **WHEN** building a prompt for `channel == "datachat"` with `context.dataset_id`
- **THEN** the System Prompt SHALL include the dataset's table schema (field names, types, descriptions)
- **AND** the LLM SHALL generate SQL directly without knowledge routing

### Requirement: Feishu Channel — P2P Chat Integration

The system SHALL extend the existing Feishu event handler to support P2P (application direct chat) messages. When `chat_type == "p2p"`, the system SHALL check DataAgent AppInstance availability and user authorization, then process the query asynchronously via RQ.

#### Scenario: Authorized user sends query

- **WHEN** a P2P message is received from an authorized user (or `allowed_user_ids` is empty)
- **THEN** the system SHALL immediately return HTTP 200
- **AND** send a "thinking" card to the user
- **AND** enqueue an RQ task that runs `AgentService` and replaces the card with the final result

#### Scenario: Unauthorized user sends query

- **WHEN** a P2P message is received from a user not in `config.allowed_user_ids` (non-empty list)
- **THEN** the system SHALL silently ignore the message

#### Scenario: DataAgent not enabled

- **WHEN** no enabled `data_agent` AppInstance exists
- **THEN** the system SHALL reply with a text message indicating the feature is not enabled

### Requirement: Feishu Channel — Progressive Card Updates

The system SHALL update the Feishu card content as the Agent Loop progresses through different stages, providing real-time feedback to the user via `FeishuClient.update_message()`.

#### Scenario: Agent progresses through stages

- **WHEN** the Agent Loop triggers `on_progress` callbacks during tool execution
- **THEN** the system SHALL update the existing card with stage-appropriate messages (e.g., "searching knowledge...", "executing SQL...")

### Requirement: Feishu Channel — Feedback Loop

The system SHALL include feedback buttons (correct/incorrect) in the final result card. Button clicks SHALL be handled by a dedicated `/api/v1/feishu/card_action` route that records feedback to `agent_query_log`.

#### Scenario: User provides positive feedback

- **WHEN** a user clicks the "correct" button on a result card
- **THEN** the system SHALL record `feedback = "positive"` in `agent_query_log`
- **AND** update the card buttons to show "feedback received" (disabled state)

#### Scenario: User provides negative feedback

- **WHEN** a user clicks the "incorrect" button on a result card
- **THEN** the system SHALL record `feedback = "negative"` in `agent_query_log`
- **AND** update the card buttons to show "feedback received" (disabled state)

### Requirement: DataChat Channel — SendMessageHandler Refactoring

The existing `SendMessageHandler` SHALL be refactored to delegate to `AgentService` via `DataChatChannel`, replacing direct `OpenAIService.generate_sql()` calls. The API response format SHALL remain backward-compatible.

#### Scenario: DataChat query via refactored handler

- **WHEN** a user sends a message in DataChat
- **THEN** `DataChatChannel.to_agent_request()` SHALL create an `AgentRequest` with dataset schema context and conversation history
- **AND** `AgentService.run()` SHALL process the request and return an `AgentResponse`
- **AND** `DataChatChannel.deliver_response()` SHALL persist the message and return JSON compatible with the existing frontend

### Requirement: Platform App Registration

DataAgent SHALL be registered as an `AppDefinition(code='data_agent', category='agent')` with a layered `config_schema` (llm / knowledge / agent / allowed_user_ids). A `DataAgentExecutor` SHALL provide config validation but no scheduled execution (message-driven).

#### Scenario: Application seed on startup

- **WHEN** the application starts
- **THEN** `seed_app_definitions()` SHALL idempotently create the `data_agent` AppDefinition
- **AND** the `config_schema` SHALL require `knowledge.datasource_id` as mandatory

#### Scenario: Config validation

- **WHEN** an admin creates or updates a DataAgent AppInstance
- **THEN** `DataAgentExecutor.validate_config()` SHALL verify that `knowledge.datasource_id` references an existing DataSource
- **AND** warn if the data source type is not MaxCompute

### Requirement: Query Security

All SQL executed by the Agent SHALL pass through `sql_validator.py` for safety checks. Only SELECT queries SHALL be allowed, with a maximum result limit of 50000 rows.

#### Scenario: Dangerous SQL rejected

- **WHEN** the LLM generates a SQL containing DDL/DML operations
- **THEN** `sql_validator` SHALL reject the query before execution
- **AND** the Agent SHALL inform the user that write operations are not supported

#### Scenario: Large result set limited

- **WHEN** a query would return more than 50000 rows
- **THEN** the system SHALL inject a LIMIT clause to cap the result set

