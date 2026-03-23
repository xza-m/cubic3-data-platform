## ADDED Requirements
### Requirement: Semantic Center SHALL Freeze Primary Navigation And Page Responsibilities
The semantic center SHALL expose stable primary navigation and SHALL keep semantic model management, domain cataloging, domain relationship modeling, and developer tools as separate page responsibilities.

#### Scenario: Navigate semantic center primary entry points
- **WHEN** a user enters the semantic center
- **THEN** they SHALL see primary navigation for semantic model management, domain catalog, domain modeling, and developer tools
- **AND** the platform SHALL NOT expose a separate legacy global relation canvas entry as an independent responsibility

#### Scenario: Domain canvas stays focused on domain modeling
- **WHEN** a user opens a domain canvas
- **THEN** the page SHALL focus on domain-level cube relationship modeling
- **AND** the page SHALL NOT treat cube detail viewing or cube editing as its primary workflow

### Requirement: Semantic Models SHALL Be Managed As One Unified Object Family
The platform SHALL manage `Cube` and `View` through one unified semantic model entry and SHALL distinguish them by `kind` instead of splitting them into separate primary management pages.

#### Scenario: Filter semantic models by kind
- **WHEN** a user opens the semantic model list
- **THEN** they SHALL be able to view all semantic models together
- **AND** they SHALL be able to filter between `cube`, `view`, or all kinds

#### Scenario: View remains a special semantic model
- **WHEN** a user views or edits a `View`
- **THEN** the page SHALL render `View`-specific metadata and controls
- **AND** the user SHALL remain within the unified semantic model management flow

### Requirement: Semantic Model Studio SHALL Stay Independent From Developer Tools
The platform SHALL keep semantic model creation and editing in a dedicated studio workflow and SHALL NOT merge it into developer tools tabs.

#### Scenario: Open semantic model studio
- **WHEN** a user creates or edits a semantic model
- **THEN** the platform SHALL open a dedicated studio page
- **AND** the page SHALL focus on model definition, source binding, and lifecycle operations

#### Scenario: Create model without binding a domain first
- **WHEN** a user creates a new semantic model
- **THEN** `domain_id` MAY be empty during initial creation
- **AND** the model MAY be assigned to a domain later

### Requirement: Domain Entry SHALL Support Catalog-Style Organization
The platform SHALL provide a catalog-style domain entry based on a lightweight two-layer `catalog -> domain` model and SHALL support single-domain lifecycle management inside the directory context.

#### Scenario: Browse domain catalog
- **WHEN** a user opens the domain entry page
- **THEN** they SHALL be able to browse domains through a catalog and domain structure instead of a flat card grid
- **AND** the structure SHALL support future category expansion without changing the primary navigation model

#### Scenario: Manage one domain from the catalog
- **WHEN** a user selects one domain inside the directory
- **THEN** they SHALL be able to view and edit the domain's basic information and lifecycle status in the directory detail pane
- **AND** they SHALL NOT need a separate standalone "domain management" workspace for single-domain operations

#### Scenario: Avoid recursive catalog overdesign
- **WHEN** the platform introduces the first version of domain cataloging
- **THEN** it SHALL use a lightweight two-layer `catalog -> domain` model
- **AND** it SHALL NOT require recursive multi-level catalog trees, catalog-level publishing, or complex catalog permissions in the same phase

### Requirement: Domain Canvas SHALL Prioritize Modeling Space
The domain canvas SHALL prioritize central modeling space over permanent side panels.

#### Scenario: View domain canvas on desktop
- **WHEN** a user opens a domain canvas on desktop
- **THEN** the central modeling surface SHALL be the dominant visual region
- **AND** supporting cube library or detail panels SHALL be collapsible, drawer-based, or otherwise non-dominant

### Requirement: Schema Drift Experience SHALL Be Explicit And Observable
The platform SHALL present a clear definition of schema drift and SHALL provide visible feedback for drift detection actions and outcomes.

#### Scenario: Read drift summary from model detail
- **WHEN** a user views a semantic model detail page
- **THEN** the page SHALL show the latest drift status and last checked time
- **AND** the page SHALL explain that drift includes missing columns, extra physical columns, type mismatches, and invalid join references

#### Scenario: Trigger drift detection
- **WHEN** a user runs schema drift detection
- **THEN** the UI SHALL show pending, success, or failure feedback
- **AND** the user SHALL be able to understand what was checked and what the result means
