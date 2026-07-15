# Experience Orchestration (ExO) Import

## What is ExO?

Experience Orchestration (ExO) is Contentful's system for composing and rendering structured page experiences. It sits above the traditional entry/content-type layer and provides a dedicated set of entity types — DataAssemblies, ComponentTypes, Templates, Fragments, and Experiences — that together describe *how* content is fetched, assembled, and laid out. DataAssemblies define reusable data-fetching contracts (GraphQL resolvers, parameter bindings). ComponentTypes define the visual building blocks that consume that data. Templates describe full page layouts in terms of ComponentTypes. Fragments are reusable, named compositions of ComponentTypes and data bindings. Experiences wire Templates and Fragments together into publishable page definitions.

## Entity Dependency Model

ExO entities form a strict dependency graph. An entity can only reference types that appear earlier in the hierarchy — there are no circular dependencies across types, though intra-type dependencies are possible for ComponentTypes and Fragments.

```
DataAssemblies
      │
      ▼
ComponentTypes ──────────────────┐
      │                          │ (a CT can reference other CTs
      ▼                          │  in its componentTree)
  Templates                      │
      │               Fragments ─┤
      │                   │      │ (a Fragment can reference other
      │                   │      │  Fragments in its slots)
      └──────┬────────────┘
             ▼
        Experiences
```

| Entity         | References                                        | Referenced by                        |
|----------------|---------------------------------------------------|--------------------------------------|
| DataAssembly   | nothing                                           | ComponentTypes, Fragments, Experiences |
| ComponentType  | DataAssemblies, other ComponentTypes              | Templates, Fragments, Experiences    |
| Template       | ComponentTypes                                    | Experiences                          |
| Fragment       | ComponentTypes, DataAssemblies, other Fragments   | Experiences                          |
| Experience     | Templates, Fragments, DataAssemblies              | nothing                              |

## ID Preservation Is Required

ExO entities reference each other via URN pointers that embed the entity's `sys.id`, e.g. `crn:contentful:::experience:spaces/$self/environments/$self/componentTypes/section`. If a create operation generates a new random ID instead of preserving the source ID, any entity that references it by URN will fail validation at write time with a `404 Not Found` or `422 InvalidDataAssemblyReference` — even if the dependency was created first.

For this reason, all ExO entity creates must use a PUT-with-ID call (upsert semantics), not a bare POST:

- **ComponentTypes, Templates, Fragments, Experiences** — use `plainClient.<type>.upsert(...)` with `sys: { id, type }` and no `version` field (omitting version signals create intent).
- **DataAssemblies** — the SDK has no `upsert`; use `plainClient.dataAssembly.update(...)` with `sys.version: 0`, which maps to `PUT /data_assemblies/{id}` and creates the entity with the specified ID.

## Why Load Order Matters

Standard content entries do not have this problem: the CMA treats entry link fields as opaque references at write time, storing the `sys.id` pointer without checking whether the target entry or asset exists. Entries can be created in parallel regardless of their link graph, and broken links simply resolve as null until the targets are created. Ordering only becomes relevant for entries at **publish time**, which `contentful-import` handles via a multi-pass retry queue.

ExO entities have a stricter contract: the CMA validates references **at create time**. If you attempt to create a ComponentType that lists a DataAssembly in its `dataAssemblies` allow-list before that DataAssembly exists, the API returns a `422 InvalidDataAssemblyReference`. Creating a ComponentType whose `componentTree` references another ComponentType that hasn't been created yet returns a `404 Not Found`. The retry-queue approach used for entries wouldn't help here — a failed create is not automatically retried, it's just an error.

This means the import order must respect the dependency graph above:

1. **DataAssemblies** — no dependencies, can be imported in parallel
2. **ComponentTypes** — depend on DataAssemblies (must already exist); may depend on other ComponentTypes
3. **Templates** — depend on ComponentTypes
4. **Fragments** — depend on ComponentTypes and DataAssemblies; may depend on other Fragments
5. **Experiences** — depend on Templates, Fragments, and DataAssemblies

## Why Intra-Type Sorting Is Required

DataAssemblies, Templates, and Experiences have no dependencies within their own type and can be imported in parallel. ComponentTypes and Fragments are different: a ComponentType can embed other ComponentTypes in its `componentTree` (e.g. a "Page" CT that slots in a "Hero" CT), and a Fragment can reference other Fragments in its `slots`. If these are imported in arbitrary order — or all at once via `Promise.all` — the CMA can receive a create request for the composite entity before its dependency exists, causing a `404`.

To prevent this, `contentful-import` applies a topological sort (Kahn's algorithm) to both ComponentTypes and Fragments before importing them, and then imports each sorted list sequentially. The sort parses URN references from `componentTree` and `slots` to build a dependency graph, resolves the safe creation order, and falls back to appending any cyclic nodes at the end so the import can still proceed rather than failing outright.
