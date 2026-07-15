type FragmentLike = { sys: { id: string }; componentTree?: any; slots?: any }

/**
 * Topologically sorts fragments so that any fragment referenced in another
 * fragment's slots appears earlier in the list.
 *
 * Uses Kahn's algorithm. Cycles are broken by appending remaining nodes
 * at the end so import can still proceed.
 */
export default function sortFragments<T extends FragmentLike>(fragments: T[]): T[] {
  const idToIndex = new Map<string, number>()
  fragments.forEach((f, i) => idToIndex.set(f.sys.id, i))

  const FRAGMENT_URN_PATTERN = /fragments\/([^"\\]+)/g

  function getDeps(fragment: T): string[] {
    const ids = new Set<string>()
    const json = JSON.stringify({ slots: fragment.slots || [], componentTree: fragment.componentTree || [] })
    let match: RegExpExecArray | null
    while ((match = FRAGMENT_URN_PATTERN.exec(json)) !== null) {
      const dep = match[1]
      if (dep !== fragment.sys.id && idToIndex.has(dep)) {
        ids.add(dep)
      }
    }
    return [...ids]
  }

  const dependents = new Map<string, string[]>()
  const inDegree = new Map<string, number>()

  fragments.forEach((f) => {
    inDegree.set(f.sys.id, 0)
    dependents.set(f.sys.id, [])
  })

  fragments.forEach((f) => {
    for (const dep of getDeps(f)) {
      dependents.get(dep)!.push(f.sys.id)
      inDegree.set(f.sys.id, (inDegree.get(f.sys.id) ?? 0) + 1)
    }
  })

  const queue = fragments
    .filter((f) => inDegree.get(f.sys.id) === 0)
    .map((f) => f.sys.id)

  const sorted: T[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    sorted.push(fragments[idToIndex.get(id)!])
    for (const dependent of dependents.get(id) ?? []) {
      const deg = (inDegree.get(dependent) ?? 1) - 1
      inDegree.set(dependent, deg)
      if (deg === 0) queue.push(dependent)
    }
  }

  fragments.forEach((f) => {
    if (!sorted.includes(f)) sorted.push(f)
  })

  return sorted
}
