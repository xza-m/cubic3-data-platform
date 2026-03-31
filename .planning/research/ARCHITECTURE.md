# Architecture Research

**Domain:** enterprise data application platform centered on a semantic layer
**Researched:** 2026-03-25
**Confidence:** MEDIUM

## Standard Architecture

### System Overview

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                               Control Plane                                 │
├───────────────────────┬───────────────────────┬──────────────────────────────┤
│ React SPA             │ Flask API             │ Semantic / App Services       │
│ - Semantic IA pages   │ - Thin HTTP boundary   │ - define / compile / publish  │
│ - Query & app shells  │ - auth / validation    │ - drift / sync / execution    │
│ - shared read models   │ - pagination / errors  │ - runtime binding             │
└───────────────┬───────┴──────────────┬───────┴───────────────┬──────────────┘
                │                      │                       │
                │                      │                       │
┌───────────────▼──────────────────────▼───────────────────────▼──────────────┐
│                              Data / Runtime Plane                           │
├───────────────────────┬───────────────────────┬──────────────────────────────┤
│ Postgres              │ Redis + RQ            │ External Sources             │
│ - app metadata        │ - async jobs          │ - warehouse / OLTP adapters  │
│ - app instances       │ - drift checks        │ - runtime query execution    │
│ - query history       │ - scheduled runs      │ - schema inspection          │
└───────────────────────┴───────────────────────┴──────────────────────────────┘
```

Brownfield reading of the current repo:

- `app/application/semantic/*` is the semantic control plane, not just a helper module.
- `app/infrastructure/semantic/*` is the canonical YAML-backed asset store.
- `app/application/services/app_center/*` is the template runtime plane for configurable internal apps.
- `frontend/src/hooks/semantic-ia/*` already behaves like a shared semantic read-model layer for multiple pages.

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|---|---|---|
| Frontend semantic shell | Compose semantic object lists, detail panes, studio views, and governance summaries | React SPA pages with shared TanStack Query hooks |
| API boundary | Normalize requests, auth, validation, pagination, and error codes | Flask blueprints with thin handlers |
| Semantic definition service | Own cube/view/domain catalogs, validation, and registry sync | Application service over YAML repositories and registry tables |
| Semantic query service | Compile DSL to dialect SQL, enforce query safety, and resolve runtime bindings | Compiler + join graph + adapter resolution |
| Publish/materialize service | Turn logical views into reusable datasets or virtual datasets | Metadata hash + dataset record + field mapping |
| Drift/sync service | Compare semantic definitions against physical schemas and report divergence | Inspector-driven background or on-demand checks |
| App template runtime | Validate app config, create instances, schedule runs, and execute jobs | Definition/instance/execution services + RQ worker |
| Semantic registry | Track lifecycle state and audit summaries for objects | Postgres-backed registry table |

### Recommended Project Structure

```text
app/
├── domain/semantic/                # pure semantic entities, compiler, join graph, ports
├── application/semantic/           # orchestration: define, query, publish, drift, bind
├── infrastructure/semantic/        # YAML repos, schema inspectors, adapter glue
├── application/services/app_center/ # app definitions, instances, execution runtime
├── infrastructure/repositories/    # Postgres-backed metadata repositories
└── interfaces/api/v1/              # HTTP entrypoints for semantic/app/query flows

frontend/src/
├── api/                            # typed API clients
├── hooks/semantic-ia/              # shared read-model hooks
├── pages/Semantic/                 # semantic UX surfaces
└── components/                     # reusable UI primitives and business widgets
```

### Structure Rationale

- Keep `domain/semantic` pure so compiler, join logic, and lifecycle rules stay testable without Flask or SQLAlchemy.
- Keep `application/semantic` as the orchestration seam; this is where YAML, registry, and adapter concerns meet.
- Keep `infrastructure/semantic` for storage format and adapter details; do not leak YAML path logic into UI or domain code.
- Keep app runtime services separate from semantic services; they share metadata ideas but have different execution semantics.

## Architectural Patterns

### Pattern 1: Control Plane / Data Plane Split

**What:** semantic definitions, governance, and compile/publish actions stay in a control plane; query execution, refresh, and scheduled runs happen in a runtime plane.

**When to use:** when the platform must support both interactive authoring and repeatable execution against warehouse data.

**Trade-offs:** clearer boundaries and safer evolution, but a little more metadata plumbing and cache invalidation work.

**Example:**
```text
UI -> API -> semantic service -> registry/YAML
UI -> API -> query service -> adapter -> warehouse
worker -> execution service -> adapter -> warehouse
```

### Pattern 2: Metadata-First Semantic Assets

**What:** cubes, views, domains, and app definitions are source-of-truth metadata; SQL, datasets, and execution envelopes are generated or materialized from them.

**When to use:** when schema drift, business rule changes, or multi-tenant app templates must be managed without rewriting code paths.

**Trade-offs:** strong reuse and good auditability, but definitions must be versioned and validated aggressively.

**Example:**
```yaml
cube:
  name: student
  source_id: 12
  status: active
  dimensions:
    student_id: { sql: "{CUBE}.student_id", type: string }
```

### Pattern 3: Runtime Binding + Execution Envelope

**What:** the same semantic or app definition can resolve to different datasources, dialects, schedules, or execution contexts at runtime.

**When to use:** when templates need per-instance configuration, or when a cube must bind to a source chosen by tenant or environment.

**Trade-offs:** powerful for brownfield migration, but the binding rules must stay deterministic and observable.

**Example:**
```python
binding = runtime.resolve_cube_datasource(cube)
sql = compiler.compile(dsl, dialect=binding.dialect)
queue.enqueue("execute_app_instance_async", instance_id=...)
```

## Data Flow

### Request Flow

```text
[User edits semantic object]
        ↓
[React semantic page]
        ↓
[Flask blueprint]
        ↓
[Application service]
   ┌────┼───────────────────┬───────────────────────┐
   │    │                   │                       │
[validate] [read YAML/DB] [compile/query/materialize] [sync registry]
   │    │                   │                       │
   └────┴───────────────────┴───────────────┬───────┘
                                           ↓
                                  [response/read model]
```

### Semantic Asset Lifecycle

```text
draft YAML / metadata
    ↓ validate
bound to datasource + domain
    ↓ compile
logical query / field map / examples
    ↓ publish
virtual dataset or reusable asset
    ↓ observe
schema drift + status summary + registry hash
    ↓ rebind / republish
updated logical asset
```

### App Template Runtime Flow

```text
app definition -> instance config -> validation -> enable/schedule
       ↓                               ↓
   config schema                   manual / cron / event
       ↓                               ↓
execution record -> RQ worker -> executor -> output / notification
```

### Key Data Flows

1. **Semantic authoring:** frontend hooks fetch list/detail summaries, then call API endpoints that mutate YAML-backed objects and registry state.
2. **Semantic query:** DSL is compiled against the join graph, then executed through a runtime-bound adapter for the selected datasource and dialect.
3. **Publish/materialize:** a view is expanded to DSL, compiled, and stored as a virtual dataset with a definition hash and field mapping.
4. **Drift detection:** schema inspectors compare physical columns with semantic definitions and surface missing columns, type mismatches, and join issues.
5. **App execution:** app instances are validated as metadata envelopes, then queued to RQ and executed by a template executor.

## Scaling Considerations

| Scale | Architecture Adjustments |
|---|---|
| 0-10 teams | Keep the current modular monolith; focus on validation, observability, and cleanup of shared read models |
| 10-50 teams | Split drift/materialization into explicit background jobs, add cache/versioning for semantic reads, and isolate app runtime templates by capability |
| 50+ teams | Consider separate control-plane and execution services, stronger versioned contracts, and read replicas / denormalized registries |

### Scaling Priorities

1. **First bottleneck:** repeated YAML / registry reads and ad hoc invalidation. Fix with cached snapshots and explicit version hashes.
2. **Second bottleneck:** long-running compile, drift, and publish tasks. Fix by pushing them into deterministic workers with persisted job state.
3. **Third bottleneck:** cross-source joins and runtime ambiguity. Fix by making source boundaries explicit in the DSL and UI.

## Anti-Patterns

### Anti-Pattern 1: Letting UI Own Semantic Logic

**What people do:** put compile, validation, or binding rules directly into React pages.

**Why it's wrong:** the same rules get duplicated across pages and drift from backend behavior.

**Do this instead:** keep the UI as a read-model consumer and push lifecycle logic into application services.

### Anti-Pattern 2: Collapsing Logical and Physical Layers

**What people do:** treat YAML definitions, generated datasets, and warehouse tables as the same thing.

**Why it's wrong:** publish and drift workflows become impossible to reason about.

**Do this instead:** make logical semantic objects the source of truth and keep physical artifacts derived.

### Anti-Pattern 3: Cross-Source Joins in the Default Path

**What people do:** allow every semantic query to join across arbitrary sources.

**Why it's wrong:** execution becomes brittle, non-portable, and hard to optimize.

**Do this instead:** require explicit domain or source grouping and block unsupported joins early.

### Anti-Pattern 4: One Giant Semantic Service

**What people do:** keep definition, query, publish, and drift code in a single service class.

**Why it's wrong:** lifecycle responsibilities blur and testing becomes expensive.

**Do this instead:** preserve the current service split and narrow each service to one lifecycle concern.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---|---|---|
| PostgreSQL | metadata, registry, execution history, app records | use transactional writes for lifecycle state |
| Redis + RQ | async jobs and scheduled execution | keep job payloads idempotent and versioned |
| Warehouse / OLTP adapters | runtime query and schema inspection | bind per datasource; do not hardcode dialect assumptions |
| AI model gateway | structured prompt/tool calls for assisted analytics | keep model output schema-validated, not free-form |

### Internal Boundaries

| Boundary | Communication | Notes |
|---|---|---|
| React semantic IA ↔ Flask API | HTTP JSON | shared query keys and summary shapes matter more than page-specific state |
| API ↔ semantic application services | direct service invocation | keep blueprints thin and test services directly |
| semantic services ↔ YAML repositories | repository ports | this is the main seam for brownfield preservation |
| semantic query ↔ runtime binding | service call | dialect and adapter selection must be deterministic |
| app definitions ↔ app instances ↔ executions | metadata + queue | treat execution as an envelope, not a page concern |

## Build Order Implications

1. **Stabilize contracts first:** lock down semantic summaries, query response shapes, and app-instance payloads before adding more features.
2. **Harden lifecycle state next:** make draft/active/deprecated, publish status, and drift status explicit and persisted.
3. **Separate compile from execute:** keep DSL compilation pure, then execute through adapters or workers.
4. **Promote background workflows:** drift checks, publish refresh, and scheduled app runs should move behind queues with clear job records.
5. **Only then split services:** if scale demands it, extract control-plane or execution services after the contract and lifecycle boundaries are stable.

## Sources

- [Cube documentation - Cubes](https://cube.dev/docs/product/data-modeling/reference/cube)
- [Cube data modeling workshop PDF](https://cube.dev/events/data-modeling-workshop.pdf)
- [PostgreSQL documentation - Materialized Views](https://www.postgresql.org/docs/18/rules-materializedviews.html)
- [PostgreSQL documentation - REFRESH MATERIALIZED VIEW](https://www.postgresql.org/docs/17/sql-refreshmaterializedview.html)
- [Microsoft Learn - Steps to building a model-driven app](https://learn.microsoft.com/en-us/power-apps/maker/model-driven-apps/app-building-steps)
- [Microsoft Learn - Understand model-driven app components](https://learn.microsoft.com/en-us/power-apps/maker/model-driven-apps/model-driven-app-components)
- [OpenAI API docs - GPT-4o mini model](https://developers.openai.com/api/docs/models/gpt-4o-mini)
- [Databricks on Azure reference architecture PDF](https://learn.microsoft.com/en-us/azure/databricks/_extras/documents/reference-architecture-databricks-on-azure.pdf)

---
*Architecture research for: enterprise data application platform centered on a semantic layer*
*Researched: 2026-03-25*
