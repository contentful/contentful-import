# Experience Orchestration (ExO) Import

## What is ExO?

Experience Orchestration (ExO) is Contentful's system for composing and rendering structured page experiences. It sits above the traditional entry/content-type layer and provides a dedicated set of entity types — DataAssemblies, DesignTokens, ComponentTypes, Templates, Fragments, and Experiences — that together describe *how* content is fetched, assembled, and laid out. DataAssemblies define reusable data-fetching contracts (GraphQL resolvers, parameter bindings). DesignTokens define reusable design values (colors, spacing, typography, etc.) that other ExO entities can reference via design properties. ComponentTypes define the visual building blocks that consume that data. Templates describe full page layouts in terms of ComponentTypes. Fragments are reusable, named compositions of ComponentTypes and data bindings. Experiences wire Templates and Fragments together into publishable page definitions.

## Entity Dependency Model

ExO entities form a strict dependency graph. An entity can only reference types that appear earlier in the hierarchy — there are no circular dependencies across types, though intra-type dependencies are possible for ComponentTypes and Fragments.

```
DataAssemblies      DesignTokens
      │                   │
      ▼                   ▼
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

DesignTokens feed into ComponentType/Template/Fragment/Experience via design property references (`designProperties.defaultValue`/`fallbackValue`/`allowedResources`), not via the `componentTree`/`slots` mechanism used for CT-to-CT or Fragment-to-Fragment references.

| Entity         | References                                                      | Referenced by                                              |
|----------------|-----------------------------------------------------------------|------------------------------------------------------------|
| DesignToken    | nothing                                                         | ComponentTypes, Templates, Fragments, Experiences          |
| DataAssembly   | nothing                                                         | ComponentTypes, Fragments, Experiences                     |
| ComponentType  | DataAssemblies, DesignTokens, other ComponentTypes              | Templates, Fragments, Experiences                          |
| Template       | ComponentTypes, DesignTokens                                    | Experiences                                                |
| Fragment       | ComponentTypes, DataAssemblies, DesignTokens, other Fragments   | Experiences                                                |
| Experience     | Templates, Fragments, DataAssemblies, DesignTokens              | nothing                                                    |

## ID Preservation Is Required

ExO entities reference each other via URN pointers that embed the entity's `sys.id`, e.g. `crn:contentful:::experience:spaces/$self/environments/$self/componentTypes/section`. If a create operation generates a new random ID instead of preserving the source ID, any entity that references it by URN will fail validation at write time with a `404 Not Found` or `422 InvalidDataAssemblyReference` — even if the dependency was created first.

For this reason, all ExO entity creates must use a PUT-with-ID call (upsert semantics), not a bare POST:

- **ComponentTypes, Templates, Fragments, Experiences, DesignTokens** — use `plainClient.<type>.upsert(...)` with `sys: { id, type }` and no `version` field (omitting version signals create intent).
- **DataAssemblies** — the SDK has no `upsert`; use `plainClient.dataAssembly.update(...)` with `sys.version: 0`, which maps to `PUT /data_assemblies/{id}` and creates the entity with the specified ID.

## Why Load Order Matters

Standard content entries do not have this problem: the CMA treats entry link fields as opaque references at write time, storing the `sys.id` pointer without checking whether the target entry or asset exists. Entries can be created in parallel regardless of their link graph, and broken links simply resolve as null until the targets are created. Ordering only becomes relevant for entries at **publish time**, which `contentful-import` handles via a multi-pass retry queue.

ExO entities have a stricter contract: the CMA validates references **at create time**. If you attempt to create a ComponentType that lists a DataAssembly in its `dataAssemblies` allow-list before that DataAssembly exists, the API returns a `422 InvalidDataAssemblyReference`. Creating a ComponentType whose `componentTree` references another ComponentType that hasn't been created yet returns a `404 Not Found`. The retry-queue approach used for entries wouldn't help here — a failed create is not automatically retried, it's just an error.

This means the import order must respect the dependency graph above:

1. **DataAssemblies** and **DesignTokens** — no dependencies on each other or on any other ExO type; either can be imported before the other with no ordering risk
2. **ComponentTypes** — depend on DataAssemblies and DesignTokens (must already exist); may depend on other ComponentTypes
3. **Templates** — depend on ComponentTypes and DesignTokens
4. **Fragments** — depend on ComponentTypes, DataAssemblies, and DesignTokens; may depend on other Fragments
5. **Experiences** — depend on Templates, Fragments, DataAssemblies, and DesignTokens

## How ExO Folders Work
Reference ExO Entity Folders RFC: https://contentful.atlassian.net/wiki/x/3BOCgAE

ExO folders are built entirely on Contentful's Taxonomy system and have two layers.

**Layer 1 — Parent ConceptSchemes** (one per ExO entity type, org-scoped)

Five well-known, fixed-ID concept schemes act as the registry for each entity type's folders:

| Scheme ID                               | Entity type     |
|-----------------------------------------|-----------------|
| `contentful.folder-group-componentType` | ComponentTypes  |
| `contentful.folder-group-template`      | Templates       |
| `contentful.folder-group-experience`    | Experiences     |
| `contentful.folder-group-fragment`      | Fragments       |
| `contentful.folder-group-designToken`   | DesignTokens    |

These schemes are org-scoped (shared across all spaces in the org). Their `concepts[]` field is the registry of all child folder concepts for that entity type. They are platform-managed prerequisites and must be queried with `purpose: 'internal'`; the importer does not create missing schemes.

**Layer 2 — Child Folder Concepts** (user-created, one per folder)

Each user-created folder is a `TaxonomyConcept` with an ID following the pattern `contentful.folder-{slug}-{randomSuffix}` (e.g. `contentful.folder-prototype-2pS5TwVK`). Key properties:

- **`purpose: 'internal'`** — required. This is what makes ExO recognize the concept as a folder. Without it the concept exists in the taxonomy but is invisible to ExO's folder queries.
- **`prefLabel`** — the human-readable folder name shown in the UI.
- **`conceptSchemes[]`** — links back up to the parent scheme (e.g. `contentful.folder-group-experience`).
- **`metadata.spaces[]`** — space links that scope the folder to specific spaces. A concept is org-level but only appears in spaces listed here. A single folder concept can span multiple spaces by adding additional space links to this array.

The parent scheme also links down to every child: its `concepts[]` array contains a link to each child concept. This bidirectional relationship is what the ExO UI traverses to render the folder tree.

An ExO entity is placed in a folder by adding a link to the child concept in its `metadata.concepts[]`:

```json
{
  "metadata": {
    "concepts": [
      { "sys": { "id": "contentful.folder-prototype-2pS5TwVK", "type": "Link", "linkType": "TaxonomyConcept" } }
    ]
  }
}
```

## How ExO Folders Are Imported

Cross-space imports require folder concepts to be recreated in the destination org because a folder concept is scoped to specific spaces via `metadata.spaces`. You cannot simply reuse the source concept ID in the destination space — the source concept may not be scoped to the destination space, and keeping them separate allows source and destination folders to diverge independently after import.

**Step 1 — Ensure parent ConceptSchemes exist**

The `contentful.folder-group-*` schemes required by the folder concepts in the import are checked in the destination org with `purpose: 'internal'`. Same-org imports will normally find them already present. If a required scheme is missing, the import fails before ExO entities are upserted so that source folder concept IDs are not left in the destination payload.

**Step 2 — Derive destination concept IDs**

For each unique `contentful.folder-*` concept referenced across all source entities, a deterministic destination concept ID is derived:

```
{sourceConceptId}-{destinationSpaceId}
```

e.g. `contentful.folder-prototype-2pS5TwVK-dwqjhi6vdvp4`

This is deterministic so re-running the import is idempotent — it won't create duplicate concepts.

**Step 3 — Create or patch each destination concept**

The source organization is resolved from the source space link in the exported ExO entity, and the source concept is fetched from that organization to copy its `prefLabel` (so the folder name carries over across organizations). The importer must have access to both organizations. If the source space or concept cannot be read, the import fails before ExO entity upserts. Then for each destination concept:

- If it **doesn't exist**: create it via `createWithId` with `purpose: 'internal'`, the copied `prefLabel`, and `metadata.spaces` pointing to the destination space.
- If it **already exists**: patch in the destination space link in `metadata.spaces` if missing.

**Step 4 — Link each concept into its parent scheme**

The destination concept is added to the `concepts[]` array of the appropriate `contentful.folder-group-*` scheme if not already present.

**Step 5 — Rewrite entity metadata in-place**

Before the ExO entities are upserted, every source entity's `metadata.concepts[]` is scanned. Any link pointing to a source folder concept ID is replaced with the corresponding destination concept ID. This mutation happens in-memory; the rewritten IDs are then persisted to the API as part of the normal entity upsert payloads in the subsequent import steps.

**Same-space imports are skipped entirely** — if source and destination space IDs match, the existing folder concepts are already valid and no taxonomy work is needed.

## Why Intra-Type Sorting Is Required

DataAssemblies, DesignTokens, Templates, and Experiences have no dependencies within their own type and can be imported in parallel. ComponentTypes and Fragments are different: a ComponentType can embed other ComponentTypes in its `componentTree` (e.g. a "Page" CT that slots in a "Hero" CT), and a Fragment can reference other Fragments in its `slots`. If these are imported in arbitrary order — or all at once via `Promise.all` — the CMA can receive a create request for the composite entity before its dependency exists, causing a `404`.

To prevent this, `contentful-import` applies a topological sort (Kahn's algorithm) to both ComponentTypes and Fragments before importing them, and then imports each sorted list sequentially. The sort parses URN references from `componentTree` and `slots` to build a dependency graph, resolves the safe creation order, and falls back to appending any cyclic nodes at the end so the import can still proceed rather than failing outright.

## Optimization Variants

Experiences and Fragments each support **Optimization Variants** — alternate versions of the same entity used for personalization, distinct from the base entity in content but not in identity. Unlike every other ExO entity type, a variant has no `sys.id` of its own: `sys.id` is borrowed from its parent, and the variant is identified instead by `sys.variant` (a server-generated UUID) plus `sys.variantType`/`sys.variantDimension`.

Because `contentful-export` nests variants onto their parent rather than exporting them as a flat top-level array (`experience.optimizationVariants` / `experienceFragment.optimizationVariants` — see [contentful-export's ExO doc](https://github.com/contentful/contentful-export/blob/main/docs/exo-export.md#optimization-variants) for the full rationale), variant import runs automatically whenever the source data has them, alongside `includeExperienceOrchestration: true`:

- **Optional skip.** Pass `skipExoVariants: true` (or `--skip-exo-variants`) to omit variants from the import. This is useful for re-importing the same export because the upstream API generates new destination IDs on every variant create.
- **No ID preservation.** Every other ExO entity type is created via upsert-with-known-ID (see "ID Preservation Is Required" above). Variants can't follow that pattern: the upstream API's create endpoint always server-generates a fresh `variantId`, and its update endpoint 404s on an unknown ID rather than creating one. So every import run creates brand-new destination variants via `POST`, unrelated to the source variant's ID. Re-running an import that includes variants will create additional variants rather than updating existing ones — there is currently no re-import/upsert story for this entity type.
- **Imported after their parent, publish/archive state preserved.** Variants are only created once their parent Experience/Fragment already exists in the destination (processing happens per-parent, after the base entity's own import/publish step), and the source variant's publish/archive state is carried onto the freshly-created destination variant.
- **The API's synthetic "default" entry is filtered out.** The upstream `optimization_variants` list endpoint always leads with a `variantType: 'default'` item representing the parent's own base view — that's not a real variant, and `contentful-export` already excludes it from what it exports. `contentful-import` filters it again defensively (`sys.variantType !== 'default'`) for older export files, but a fresh export should never contain one.
