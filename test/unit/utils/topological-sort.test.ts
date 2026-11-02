import topologicalSort from '../../../lib/utils/topological-sort'

type Item = { key: string; deps: string[] }

const item = (key: string, deps: string[] = []): Item => ({ key, deps })
const run = (items: Item[]) =>
  topologicalSort(
    items,
    (i) => i.key,
    (i) => i.deps
  )
const keys = (items: Item[]) => items.map((i) => i.key)

describe('topologicalSort', () => {
  it('orders a chain dependencies-first', () => {
    const { sorted, cyclic } = run([item('c', ['b']), item('b', ['a']), item('a')])
    expect(keys(sorted)).toEqual(['a', 'b', 'c'])
    expect(cyclic).toEqual([])
  })

  it('keeps input order for independent items', () => {
    const { sorted } = run([item('x'), item('y'), item('z')])
    expect(keys(sorted)).toEqual(['x', 'y', 'z'])
  })

  it('orders a diamond', () => {
    const { sorted, cyclic } = run([
      item('d', ['b', 'c']),
      item('c', ['a']),
      item('b', ['a']),
      item('a')
    ])
    expect(keys(sorted)).toEqual(['a', 'c', 'b', 'd'])
    expect(cyclic).toEqual([])
  })

  it('ignores unknown and self dependencies', () => {
    const { sorted, cyclic } = run([item('a', ['a', 'missing'])])
    expect(keys(sorted)).toEqual(['a'])
    expect(cyclic).toEqual([])
  })

  it('counts duplicate dependencies once', () => {
    const { sorted, cyclic } = run([item('b', ['a', 'a']), item('a')])
    expect(keys(sorted)).toEqual(['a', 'b'])
    expect(cyclic).toEqual([])
  })

  it('returns cycle members and their dependents as cyclic', () => {
    const { sorted, cyclic } = run([item('a', ['b']), item('b', ['a']), item('c', ['a']), item('d')])
    expect(keys(sorted)).toEqual(['d'])
    expect(keys(cyclic)).toEqual(['a', 'b', 'c'])
  })

  it('handles empty input', () => {
    expect(run([])).toEqual({ sorted: [], cyclic: [] })
  })
})
