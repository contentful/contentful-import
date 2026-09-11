import { removeMetadataTags } from './transformers'

/**
 * Upgrades legacy-shaped Experience Orchestration (ExO) entities to the renamed
 * form the current API expects, so exports taken before the rename can still be
 * imported without hand-editing the JSON.
 *
 * The rename (see contentful-management >= 12.13.0):
 *   ComponentType      -> Component
 *   Fragment           -> ExperienceFragment
 *   Template           -> ExperienceTemplate
 * along with the corresponding resource-link `linkType`s, URN path segments,
 * component-tree / slot node shapes, slot-definition `allowedResources`, and
 * content-property `TypeRef`s.
 *
 * This is intentionally UPGRADE-ONLY: import always writes the new form, so
 * there is no downgrade path. Every function is idempotent — data already in the
 * new form passes through unchanged — so it is safe to run on mixed input.
 */

type AnyResourceLink = {
  sys: {
    type: 'ResourceLink'
    linkType: string
    urn: string
  }
}

/** Rewrites the `/{from}/` path segment of a resource-link URN to `/{to}/`. */
function rewriteUrn (urn: string, from: string, to: string): string {
  return typeof urn === 'string' ? urn.replace(new RegExp(`/${from}/`, 'g'), `/${to}/`) : urn
}

function upgradeLink (link: any, toLinkType: string, fromSegment: string, toSegment: string): AnyResourceLink {
  return {
    ...link,
    sys: {
      ...link.sys,
      type: 'ResourceLink',
      linkType: toLinkType,
      urn: rewriteUrn(link.sys?.urn, fromSegment, toSegment)
    }
  }
}

const upgradeComponentLink = (link: any) =>
  upgradeLink(link, 'Contentful:Component', 'componentTypes', 'components')

const upgradeTemplateLink = (link: any) =>
  upgradeLink(link, 'Contentful:ExperienceTemplate', 'templates', 'experienceTemplates')

/**
 * Upgrades a single component-tree / slot node. Handles both container nodes
 * (Component, InlineExperienceFragment) with nested slots and leaf reference
 * nodes (ExperienceFragment, Slot). Nodes already in the new form are returned
 * unchanged.
 */
function upgradeNode (node: any): any {
  if (!node || typeof node !== 'object') return node

  switch (node.nodeType) {
    case 'Slot':
      return node

    // Fragment reference node -> ExperienceFragment reference node
    case 'Fragment': {
      const { fragment, ...rest } = node
      return {
        ...rest,
        nodeType: 'ExperienceFragment',
        experienceFragment: upgradeLink(fragment, 'Contentful:ExperienceFragment', 'fragments', 'experienceFragments')
      }
    }
    case 'ExperienceFragment':
      return node

    // Component node: legacy carries `componentType`, new carries `component`
    case 'Component': {
      const { componentType, ...rest } = node
      const component = node.component ?? (componentType ? upgradeComponentLink(componentType) : undefined)
      return {
        ...rest,
        nodeType: 'Component',
        ...(component ? { component } : {}),
        ...(node.slots !== undefined ? { slots: upgradeNodeMap(node.slots) } : {})
      }
    }

    // Inline fragment node: legacy carries `componentType`, new carries `component`
    case 'InlineFragment': {
      const { componentType, ...rest } = node
      const component = node.component ?? (componentType ? upgradeComponentLink(componentType) : undefined)
      return {
        ...rest,
        nodeType: 'InlineExperienceFragment',
        ...(component ? { component } : {}),
        ...(node.slots !== undefined ? { slots: upgradeNodeMap(node.slots) } : {})
      }
    }
    case 'InlineExperienceFragment':
      return {
        ...node,
        ...(node.slots !== undefined ? { slots: upgradeNodeMap(node.slots) } : {})
      }

    default:
      return node
  }
}

/** Upgrades a `Record<slotId, node[]>` map, as used by node `slots` and entity `slots`. */
function upgradeNodeMap (slots: any): any {
  if (!slots || typeof slots !== 'object') return slots
  return Object.fromEntries(
    Object.entries(slots).map(([key, nodes]) => [key, Array.isArray(nodes) ? nodes.map(upgradeNode) : nodes])
  )
}

/** Upgrades a component tree (array of nodes), as used by Component / ExperienceTemplate. */
function upgradeComponentTree (tree: any): any {
  return Array.isArray(tree) ? tree.map(upgradeNode) : tree
}

/** Upgrades slot *definitions* (`allowedResources`), as used by Component / ExperienceTemplate. */
function upgradeSlotDefinitions (defs: any): any {
  if (!Array.isArray(defs)) return defs
  return defs.map((slot) => ({
    ...slot,
    ...(slot.allowedResources
      ? {
          allowedResources: slot.allowedResources.map((resource: any) => ({
            ...resource,
            type: 'Contentful:Component',
            ...(Array.isArray(resource.allowedTypes)
              ? { allowedTypes: resource.allowedTypes.map((urn: string) => rewriteUrn(urn, 'componentTypes', 'components')) }
              : {})
          }))
        }
      : {})
  }))
}

/** Recursively upgrades a single content-property definition's `TypeRef` links. */
function upgradeContentProperty (prop: any): any {
  if (!prop || typeof prop !== 'object') return prop
  if (prop.type === 'Array' && prop.items) {
    return { ...prop, items: upgradeContentProperty(prop.items) }
  }
  if (prop.type === 'TypeRef' && prop.ref?.sys?.linkType === 'Contentful:ComponentType') {
    return { ...prop, ref: upgradeComponentLink(prop.ref) }
  }
  return prop
}

function upgradeContentPropertyTypeRefs (props: any): any {
  return Array.isArray(props) ? props.map(upgradeContentProperty) : props
}

// ─── Per-entity upgraders ─────────────────────────────────────────────────────

function upgradeComponent (entity: any): any {
  return {
    ...entity,
    sys: { ...entity.sys, type: 'Component' },
    ...(entity.componentTree !== undefined ? { componentTree: upgradeComponentTree(entity.componentTree) } : {}),
    ...(entity.slots !== undefined ? { slots: upgradeSlotDefinitions(entity.slots) } : {}),
    ...(entity.contentProperties !== undefined ? { contentProperties: upgradeContentPropertyTypeRefs(entity.contentProperties) } : {})
  }
}

function upgradeExperienceTemplate (entity: any): any {
  return {
    ...entity,
    sys: { ...entity.sys, type: 'ExperienceTemplate' },
    ...(entity.componentTree !== undefined ? { componentTree: upgradeComponentTree(entity.componentTree) } : {}),
    ...(entity.slots !== undefined ? { slots: upgradeSlotDefinitions(entity.slots) } : {}),
    ...(entity.contentProperties !== undefined ? { contentProperties: upgradeContentPropertyTypeRefs(entity.contentProperties) } : {})
  }
}

function upgradeExperienceFragment (entity: any): any {
  const { componentType, ...restSys } = entity.sys ?? {}
  // A legacy marker carries sys.componentType; a new one carries sys.component.
  // Prefer an already-present new link (mixed state) over dereferencing the old.
  const component = entity.sys?.component ?? (componentType ? upgradeComponentLink(componentType) : undefined)
  return {
    ...entity,
    sys: { ...restSys, type: 'ExperienceFragment', ...(component ? { component } : {}) },
    ...(entity.slots !== undefined ? { slots: upgradeNodeMap(entity.slots) } : {})
  }
}

function upgradeExperience (entity: any): any {
  const { template, ...restSys } = entity.sys ?? {}
  // Legacy carries sys.template; new carries sys.experienceTemplate.
  const experienceTemplate = entity.sys?.experienceTemplate ?? (template ? upgradeTemplateLink(template) : undefined)
  return {
    ...entity,
    sys: { ...restSys, type: 'Experience', ...(experienceTemplate ? { experienceTemplate } : {}) },
    ...(entity.slots !== undefined ? { slots: upgradeNodeMap(entity.slots) } : {})
  }
}

/** Upgrades one entity array, if present, and scrubs metadata.tags per-entity. */
function upgradeEntityArray (key: string, resources: Record<string, any>, upgrade: (entity: any) => any, tagsEnabled: boolean) {
  const items = resources[key]
  if (!Array.isArray(items)) return {}

  const upgraded = items.map((entity: any) => removeMetadataTags(upgrade(entity), tagsEnabled))
  return { [key]: upgraded }
}

/**
 * Upgrades components, experienceTemplates, experienceFragments, and experiences to the
 * new (post-rename) shape. Everything else on the resources object - including
 * dataAssemblies and designTokens, which were never renamed - passes through untouched.
 * Safe to call more than once; already-upgraded data is left as-is.
 *
 * Also drops metadata.tags when the destination can't resolve tags (tagsEnabled = false),
 * since sending them would 400 on create/upsert.
 */
export function upgradeExoResources<T extends Record<string, any>> (resources: T, tagsEnabled = false): T {
  if (!resources) return resources
  return {
    ...resources,
    ...upgradeEntityArray('components', resources, upgradeComponent, tagsEnabled),
    ...upgradeEntityArray('experienceTemplates', resources, upgradeExperienceTemplate, tagsEnabled),
    ...upgradeEntityArray('experienceFragments', resources, upgradeExperienceFragment, tagsEnabled),
    ...upgradeEntityArray('experiences', resources, upgradeExperience, tagsEnabled)
  }
}

// Exported for unit testing individual upgrade steps.
export {
  upgradeComponent,
  upgradeExperienceTemplate,
  upgradeExperienceFragment,
  upgradeExperience,
  upgradeNode,
  upgradeSlotDefinitions,
  upgradeContentPropertyTypeRefs
}
