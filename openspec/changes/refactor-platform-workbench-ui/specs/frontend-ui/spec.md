## ADDED Requirements

### Requirement: Platform Workbench Design Baseline
The frontend SHALL use a single platform workbench design baseline derived from the semantic center workbench language.

#### Scenario: Shell and page consistency
- **WHEN** a user navigates between login, platform overview, semantic center, data inventory, and analysis pages
- **THEN** the pages SHALL feel like the same product
- **AND** they SHALL share the same typography, spacing, surface hierarchy, and status language

#### Scenario: Canonical page models
- **WHEN** a new platform page is added or an existing page is refactored
- **THEN** it SHALL map to one of the five canonical page models
- **AND** it SHALL NOT invent a separate layout language

### Requirement: Platform Shell Contract
The frontend SHALL provide a low-noise global shell that supports navigation without competing with page content.

#### Scenario: Header behavior
- **WHEN** the authenticated shell renders
- **THEN** the top navigation SHALL show the current first-level module, a global search entry, notifications, and the current user
- **AND** it SHALL NOT render decorative background treatments or unrelated status summaries

#### Scenario: Sidebar behavior
- **WHEN** the sidebar renders
- **THEN** it SHALL focus on navigation groups and current location
- **AND** it SHALL NOT render promotional cards, health banners, or secondary dashboards

### Requirement: Platform Overview Page Model
The frontend SHALL implement the dashboard as an `Overview` page model rather than a generic admin welcome page.

#### Scenario: Platform overview content
- **WHEN** a user opens the dashboard
- **THEN** the page SHALL prioritize current platform asset counts, current work domains, and active blockers
- **AND** it SHALL NOT render a welcome hero, generic KPI card matrix, or activity feed as the primary content

### Requirement: Platform Layout Verification
The frontend SHALL provide targeted verification for the platform shell and overview pages.

#### Scenario: Platform layout verification script
- **WHEN** a developer changes `AppLayout`, `Login`, or `Dashboard`
- **THEN** they SHALL be able to run a single verification command
- **AND** that command SHALL include type checks, unit tests, targeted visual regression, and a shell navigation E2E
