## MODIFIED Requirements
### Requirement: Semantic Frontend Verification Workflow
The semantic frontend SHALL provide a repeatable verification workflow for critical semantic center changes.

#### Scenario: Run semantic frontend verification
- **WHEN** semantic center pages, semantic API integration, or semantic route behavior are changed
- **THEN** developers MUST be able to run documented verification steps including type check, production build, and critical browser smoke tests

#### Scenario: Validate semantic critical paths in browser
- **WHEN** semantic frontend critical paths are validated
- **THEN** the workflow MUST include browser smoke checks for domain creation, domain publish, and cube draft generation
