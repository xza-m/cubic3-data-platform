## MODIFIED Requirements
### Requirement: Frontend Verification Workflow
The frontend SHALL provide a repeatable verification workflow that includes static checks and, for critical user paths, browser-based smoke validation.

#### Scenario: Run baseline verification for frontend changes
- **WHEN** a developer validates frontend code changes
- **THEN** they MUST be able to run type checking and production build verification through documented commands

#### Scenario: Run semantic center smoke verification
- **WHEN** a developer changes semantic center pages, semantic API integration, or route behavior
- **THEN** they MUST be able to run a documented Playwright smoke test for the semantic critical path
