## ADDED Requirements

### Requirement: Schema List API

The backend SHALL expose a REST API endpoint to retrieve the list of schemas within a specified database of a datasource.

#### Scenario: Retrieve schemas for PostgreSQL
- **WHEN** a client sends `GET /api/v1/datasources/<id>/schemas?database=<db>`
- **THEN** the system SHALL return a list of schema names (e.g., `["public", "analytics", "staging"]`)
- **AND** filter out internal/system schemas (`pg_catalog`, `information_schema`, `pg_toast`)

#### Scenario: Retrieve schemas for non-schema databases
- **WHEN** a client sends `GET /api/v1/datasources/<id>/schemas?database=<db>` for MySQL, ClickHouse, or MaxCompute
- **THEN** the system SHALL return an empty list `[]`
- **AND** the response status SHALL be 200

### Requirement: Table Schema API

The backend SHALL expose a REST API endpoint to retrieve column-level metadata for a specific table.

#### Scenario: Retrieve table schema
- **WHEN** a client sends `GET /api/v1/datasources/<id>/table-schema?database=<db>&table=<tbl>`
- **THEN** the system SHALL return the table schema including:
  - `table_name`: string
  - `comment`: string (nullable)
  - `columns`: array of `{ name, type, comment, is_nullable, is_partition, is_primary_key, default_value }`
  - `partitions`: array of partition field names

#### Scenario: Retrieve table schema with schema parameter
- **WHEN** a client sends `GET /api/v1/datasources/<id>/table-schema?database=<db>&table=<tbl>&schema=<sch>`
- **THEN** the system SHALL scope the query to the specified schema
- **AND** the `schema` parameter SHALL be optional (defaults to `public` for PostgreSQL)

#### Scenario: Table not found
- **WHEN** a client requests schema for a non-existent table
- **THEN** the system SHALL return a 404 response with an appropriate error message
