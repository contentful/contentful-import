import topologicalSort from './topological-sort'

export type ComponentOrFragmentNode<C, F> =
  | { type: 'Component'; entity: C }
  | { type: 'ExperienceFragment'; entity: F }

export function nodeKey (type: 'Component' | 'ExperienceFragment', id: string): string {
  return `${type}:${id}`
}

// Entities are upgraded to the new form (see transform/exo-rename) before
// sorting, so URNs always use the current `components/` and
// `experienceFragments/` path segments.
const COMPONENT_URN_PATTERN = /components\/([^"\\]+)/g
const FRAGMENT_URN_PATTERN = /experienceFragments\/([^"\\]+)/g

function referencedKeys (json: string): string[] {
  const keys: string[] = []
  for (const match of json.matchAll(COMPONENT_URN_PATTERN)) {
    keys.push(nodeKey('Component', match[1]))
  }
  for (const match of json.matchAll(FRAGMENT_URN_PATTERN)) {
    keys.push(nodeKey('ExperienceFragment', match[1]))
  }
  return keys
}

/**
 * Topologically sorts components and experience fragments together so that
 * every entity appears after the entities it depends on:
 *
 * - A component depends on the components and fragments embedded anywhere in
 *   its `componentTree` (including inside Looper and InlineExperienceFragment
 *   nodes) and on the components allowed by its slot definitions.
 * - A fragment depends on its base component and on the components and
 *   fragments embedded anywhere in its `slots`.
 *
 * References to entities outside the import set create no edge. Entities that
 * are part of a dependency cycle (or depend on one) are returned in `cyclic`.
 */
export default function sortComponentsAndFragments<
  C extends { sys: { id: string } },
  F extends { sys: { id: string } }
> (
  components: C[],
  experienceFragments: F[]
): { sorted: ComponentOrFragmentNode<C, F>[]; cyclic: ComponentOrFragmentNode<C, F>[] } {
  const nodes: ComponentOrFragmentNode<C, F>[] = [
    ...components.map((entity): ComponentOrFragmentNode<C, F> => ({ type: 'Component', entity })),
    ...experienceFragments.map((entity): ComponentOrFragmentNode<C, F> => ({ type: 'ExperienceFragment', entity }))
  ]

  return topologicalSort(
    nodes,
    (n) => nodeKey(n.type, n.entity.sys.id),
    (n) => {
      if (n.type === 'Component') {
        const { componentTree, slots } = n.entity as any
        return referencedKeys(JSON.stringify({ componentTree, slots }))
      }
      const entity = n.entity as any
      return referencedKeys(JSON.stringify({ component: entity.sys.component, slots: entity.slots }))
    }
  )
}
