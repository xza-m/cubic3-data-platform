## ADDED Requirements
### Requirement: Semantic Workbench Pages SHALL Share Frontend View Models
Semantic center pages SHALL use shared frontend view models and state abstractions instead of page-local ad hoc data shaping.

#### Scenario: Reuse object summary model
- **WHEN** a semantic center page renders an object list, preview, or inspector
- **THEN** it SHALL consume a shared summary model such as `SemanticObjectSummary`
- **AND** it SHALL NOT redefine the same object identity fields independently on each page

#### Scenario: Reuse governance and structure summaries
- **WHEN** a semantic center page needs lifecycle, binding, drift, or structure information
- **THEN** it SHALL consume shared abstractions such as governance state, structure summary, and workbench context items
- **AND** those abstractions SHALL support reuse across inventory, studio, canvas, and developer pages

### Requirement: Semantic Workbench Pages SHALL Use Functional Copy
Semantic center page copy SHALL describe function, current state, or available action, and SHALL NOT use step-by-step process narration as default descriptive text.

#### Scenario: Render page header description
- **WHEN** a semantic page renders its header description
- **THEN** the description SHALL summarize what the module is for
- **AND** it SHALL NOT default to “先…再…” or other workflow narration

#### Scenario: Render panel description
- **WHEN** a semantic page renders panel descriptions, empty states, or inspector summaries
- **THEN** the copy SHALL explain what the panel shows or maintains
- **AND** it SHALL avoid redundant process instructions unless the panel is explicitly an onboarding surface
