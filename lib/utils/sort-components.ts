type ComponentLike = { sys: { id: string }; componentTree?: any[] }

/**
 * Topologically sorts components so that any component referenced
 * inside another's componentTree is guaranteed to appear earlier in the list.
 * This ensures creates succeed in dependency order.
 *
 * Uses Kahn's algorithm. Cycles are broken by appending the remaining nodes
 * at the end so import can still proceed.
 */
export default function sortComponents<T extends ComponentLike>(components: T[]): T[] {
  const idToIndex = new Map<string, number>()
  components.forEach((ct, i) => idToIndex.set(ct.sys.id, i))

  // Match both the current (`components/`) and legacy (`componentTypes/`) URN
  // path segments so exports from either environment version sort correctly.
  const URN_PATTERN = /(?:components|componentTypes)\/([^"\\]+)/g

  function getDeps(ct: any): string[] {
    const ids = new Set<string>()
    const tree = JSON.stringify(ct.componentTree || [])
    let match: RegExpExecArray | null
    while ((match = URN_PATTERN.exec(tree)) !== null) {
      const dep = match[1]
      if (dep !== ct.sys.id && idToIndex.has(dep)) {
        ids.add(dep)
      }
    }
    return [...ids]
  }

  // Build adjacency: dep -> list of nodes that depend on dep
  const dependents = new Map<string, string[]>()
  const inDegree = new Map<string, number>()

  components.forEach((ct) => {
    inDegree.set(ct.sys.id, 0)
    dependents.set(ct.sys.id, [])
  })

  components.forEach((ct) => {
    for (const dep of getDeps(ct)) {
      dependents.get(dep)!.push(ct.sys.id)
      inDegree.set(ct.sys.id, (inDegree.get(ct.sys.id) ?? 0) + 1)
    }
  })

  const queue = components
    .filter((ct) => inDegree.get(ct.sys.id) === 0)
    .map((ct) => ct.sys.id)

  const sorted: T[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    sorted.push(components[idToIndex.get(id)!])
    for (const dependent of dependents.get(id) ?? []) {
      const deg = (inDegree.get(dependent) ?? 1) - 1
      inDegree.set(dependent, deg)
      if (deg === 0) queue.push(dependent)
    }
  }

  // Append anything left (cycles) so we don't silently drop them
  components.forEach((ct) => {
    if (!sorted.includes(ct)) sorted.push(ct)
  })

  return sorted
}
