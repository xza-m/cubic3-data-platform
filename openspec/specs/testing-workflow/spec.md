# testing-workflow Specification

## Purpose
TBD - created by archiving change add-testing-agent-workflow. Update Purpose after archive.
## Requirements
### Requirement: Testing Agent SHALL Provide Layered Verification Workflow
The system SHALL define a Testing Agent workflow that organizes verification into layered checks rather than ad-hoc manual steps.

#### Scenario: Repository-level layered verification
- **WHEN** a developer reviews the repository verification model
- **THEN** the workflow MUST define fixed layer entrypoints for static checks, type and contract checks, automated tests, and runtime validation

#### Scenario: Critical interaction smoke verification
- **WHEN** a change affects semantic center critical interaction paths
- **THEN** the workflow MUST require at least one browser smoke task outside the default repository smoke path

### Requirement: Testing Agent SHALL Treat Playwright Smoke Tests As Checklist Tasks
The system SHALL treat Playwright browser smoke tests as one task type in the Testing Agent checklist, not as the entire verification model.

#### Scenario: Semantic domain creation smoke test
- **WHEN** semantic domain creation flow is modified
- **THEN** the workflow MUST require a browser smoke task that verifies draft creation and canvas navigation

### Requirement: Testing Agent SHALL Define Trigger Rules
The system SHALL document which changes trigger which verification layers.

#### Scenario: Semantic frontend change
- **WHEN** code changes include semantic frontend pages, semantic API client, or semantic route behavior
- **THEN** the workflow MUST require semantic-specific verification beyond the default frontend delivery gate

#### Scenario: Non-critical frontend style-only change
- **WHEN** code changes are limited to non-critical visual styling without route or API interaction changes
- **THEN** the workflow MAY require only the frontend-scoped delivery gate

### Requirement: Testing Agent SHALL Provide Machine-Readable Verification Rules
The system SHALL store verification trigger rules in a machine-readable format so that tooling can recommend the correct delivery gate for a change.

#### Scenario: Document-only change detection
- **WHEN** changed files are limited to repository documentation
- **THEN** the workflow MUST allow tooling to map the change to a documentation-specific delivery gate

#### Scenario: Cross-domain change detection
- **WHEN** changed files span multiple domains or touch shared contracts, tooling, or root verification entrypoints
- **THEN** the workflow MUST allow tooling to escalate the change to the repository-wide delivery gate

### Requirement: Testing Agent SHALL Fail Closed On Ambiguous Scope
The system SHALL prefer a more conservative verification gate when change scope detection is ambiguous.

#### Scenario: Unknown or unmatched file pattern
- **WHEN** tooling cannot confidently map changed files to a narrower delivery gate
- **THEN** the workflow MUST recommend a more conservative repository-wide verification target

