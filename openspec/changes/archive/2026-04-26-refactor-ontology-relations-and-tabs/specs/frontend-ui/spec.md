## ADDED Requirements

### Requirement: Ontology Relations Page Must Provide Graph + Table Dual View

The Ontology Relations page SHALL render an SVG relationship graph alongside
the relation table within a single route, so that users can see object-level
relationship structure and the underlying relation list at the same time.

#### Scenario: Render graph and list side-by-side

- **WHEN** a user navigates to `/semantic/ontology/relations`
- **THEN** the page MUST render an SVG graph whose nodes correspond to the
  unique business objects participating in relations and whose edges
  correspond to declared business relations
- **AND** the page MUST render the relation list table beside (or below on
  narrow viewports) the graph, exposing the same relation set

#### Scenario: Selection synchronization

- **WHEN** a user selects a node in the graph
- **THEN** the table MUST filter to show only relations involving that
  object
- **AND** **WHEN** a user selects a row in the table
- **THEN** the corresponding edge and its endpoints in the graph MUST be
  visually highlighted

#### Scenario: Clearing selection

- **WHEN** the user dismisses the current selection (e.g. via a clear button
  or empty-area click)
- **THEN** the table MUST return to the unfiltered view and the graph MUST
  return to a no-active-selection state

### Requirement: Ontology Relation Graph SHALL Be A Reusable Component

The Ontology workbench SHALL expose a reusable SVG graph component that
takes ontology objects and relations as input and renders them as nodes and
edges, independent of the cube join graph used elsewhere.

#### Scenario: Component takes ontology data and renders nodes / edges

- **WHEN** the component receives a list of business objects and a list of
  business relations
- **THEN** it MUST render one node per unique object and one edge per
  relation
- **AND** it MUST not depend on cube / dimension data structures

#### Scenario: Node positions are persisted

- **WHEN** a user drags a node to a new position
- **THEN** the new layout MUST be persisted in browser localStorage so the
  user sees the same arrangement on the next visit

### Requirement: Ontology Object Click MUST Open A Workbench Tab

The Ontology Objects list SHALL open business objects in the AppShell tab
strip via `useAppShell().openTab`, so that users can keep multiple objects
in parallel and switch between them without losing context.

#### Scenario: Click row opens a tab

- **WHEN** a user clicks a row in the ontology objects list
- **THEN** the system MUST call `openTab` with an id namespaced as
  `ontology-object:<name>`, a label equal to the object title (or name
  fallback), and a `to` value pointing to
  `/semantic/ontology/objects/<name>`
- **AND** the system MUST navigate to that route so the tab content is
  rendered immediately

#### Scenario: Repeated clicks reuse the same tab

- **WHEN** a user clicks the same row again
- **THEN** the system MUST NOT create a duplicate tab; it MUST activate the
  existing tab instead

#### Scenario: PeekPanel is not used for ontology object preview

- **WHEN** a user clicks a row in the ontology objects list
- **THEN** the system MUST NOT render a PeekPanel side drawer for that
  object; preview is delegated to the tab opened in the AppShell tab strip
