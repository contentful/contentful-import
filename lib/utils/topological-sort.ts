/**
 * Stable topological sort using an iterative Kahn's algorithm (O(V + E), no
 * recursion).
 *
 * `sorted` contains every item whose dependencies can all be satisfied,
 * dependencies first. The sort is stable: items that become ready at the same
 * time are emitted in input order.
 *
 * `cyclic` contains the remaining items (cycle members and anything that
 * depends on them), in input order, so callers can decide how to handle them.
 *
 * Dependencies on unknown keys and self-dependencies are ignored, and
 * duplicate dependency keys count once.
 */
export default function topologicalSort<T> (
  items: T[],
  keyOf: (item: T) => string,
  dependenciesOf: (item: T) => Iterable<string>
): { sorted: T[]; cyclic: T[] } {
  const itemByKey = new Map<string, T>()
  const dependents = new Map<string, string[]>()
  const inDegree = new Map<string, number>()

  for (const item of items) {
    const key = keyOf(item)
    itemByKey.set(key, item)
    dependents.set(key, [])
    inDegree.set(key, 0)
  }

  for (const item of items) {
    const key = keyOf(item)
    for (const dep of new Set(dependenciesOf(item))) {
      if (dep === key || !itemByKey.has(dep)) continue
      dependents.get(dep)!.push(key)
      inDegree.set(key, inDegree.get(key)! + 1)
    }
  }

  const queue: string[] = []
  for (const item of items) {
    const key = keyOf(item)
    if (inDegree.get(key) === 0) queue.push(key)
  }

  const sorted: T[] = []
  const emitted = new Set<string>()
  for (let head = 0; head < queue.length; head++) {
    const key = queue[head]
    sorted.push(itemByKey.get(key)!)
    emitted.add(key)
    for (const dependent of dependents.get(key)!) {
      const degree = inDegree.get(dependent)! - 1
      inDegree.set(dependent, degree)
      if (degree === 0) queue.push(dependent)
    }
  }

  const cyclic = items.filter((item) => !emitted.has(keyOf(item)))

  return { sorted, cyclic }
}
