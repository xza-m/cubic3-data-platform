## ADDED Requirements
### Requirement: Testing Agent SHALL Provide Layered Verification Workflow
The system SHALL define a Testing Agent workflow that organizes verification into layered checks rather than ad-hoc manual steps.

#### Scenario: Frontend baseline verification
- **WHEN** a frontend change is prepared for validation
- **THEN** the workflow MUST define L1 checks for type checking and build verification

#### Scenario: Critical interaction smoke verification
- **WHEN** a change affects semantic center critical interaction paths
- **THEN** the workflow MUST require at least one browser smoke test in L2

### Requirement: Testing Agent SHALL Treat Playwright Smoke Tests As Checklist Tasks
The system SHALL treat Playwright browser smoke tests as one task type in the Testing Agent checklist, not as the entire verification model.

#### Scenario: Semantic domain creation smoke test
- **WHEN** semantic domain creation flow is modified
- **THEN** the workflow MUST require a browser smoke task that verifies draft creation and canvas navigation

### Requirement: Testing Agent SHALL Define Trigger Rules
The system SHALL document which changes trigger which verification layers.

#### Scenario: Semantic frontend change
- **WHEN** code changes include semantic frontend pages, semantic API client, or semantic route behavior
- **THEN** the workflow MUST require L1 checks and L2 semantic smoke verification

#### Scenario: Non-critical frontend style-only change
- **WHEN** code changes are limited to non-critical visual styling without route or API interaction changes
- **THEN** the workflow MAY require only L1 checks
