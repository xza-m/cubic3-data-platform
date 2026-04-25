## ADDED Requirements
### Requirement: Catalog SHALL Be A Managed Domain Object
The platform SHALL treat `catalog` as an independently managed semantic directory object and SHALL persist it separately from `domain`.

#### Scenario: Load catalog list
- **WHEN** a user opens the domain directory
- **THEN** the platform SHALL return a list of persisted catalogs
- **AND** each catalog SHALL expose stable identity and metadata such as `code`, `name`, and `status`

#### Scenario: Default catalog exists
- **WHEN** the platform initializes or migrates historical domain data
- **THEN** it SHALL provide a real default catalog object
- **AND** domains without explicit catalog assignment SHALL belong to that default catalog

### Requirement: Domain SHALL Reference A Real Catalog
The platform SHALL make each domain reference a real catalog object instead of maintaining duplicated catalog names as its own source of truth.

#### Scenario: Update domain catalog assignment
- **WHEN** a user changes a domain's catalog assignment
- **THEN** the platform SHALL validate the target catalog exists
- **AND** the domain SHALL persist the catalog reference consistently

### Requirement: Domain Directory SHALL Support Catalog Management
The domain directory SHALL allow users to manage catalogs and browse domains within the same directory workflow.

#### Scenario: Create catalog from directory
- **WHEN** a user creates a new catalog from the domain directory
- **THEN** the new catalog SHALL appear in the left-side directory list
- **AND** the user SHALL be able to place domains under it

#### Scenario: Rename catalog
- **WHEN** a user renames a catalog
- **THEN** the directory SHALL reflect the new catalog name everywhere that catalog is shown
- **AND** domains under that catalog SHALL NOT require duplicated name updates

### Requirement: Domain Modeling Entry SHALL Accept Catalog Selection
The domain modeling entry SHALL allow users to choose the target catalog before creating a new domain.

#### Scenario: Create domain under catalog
- **WHEN** a user creates a new domain from the modeling entry
- **THEN** they SHALL be able to select an existing catalog
- **AND** the new domain SHALL be created under that catalog

#### Scenario: Missing catalog choice
- **WHEN** a user does not choose a catalog
- **THEN** the platform SHALL assign the real default catalog instead of leaving the domain unclassified
