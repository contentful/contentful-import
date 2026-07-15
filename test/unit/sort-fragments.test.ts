import sortFragments from '../../lib/utils/sort-fragments'

function idx(sorted: { sys: { id: string } }[], id: string) {
  return sorted.findIndex((f) => f.sys.id === id)
}

function frag(id: string, slots?: object, componentTree?: object) {
  return { sys: { id }, ...(slots ? { slots } : {}), ...(componentTree ? { componentTree } : {}) }
}

// Embed a fragment URN reference into a slots/componentTree structure
function ref(id: string) {
  return [{ urn: `urn:contentful:fragments/${id}` }]
}

test('returns empty array when given empty input', () => {
  expect(sortFragments([])).toEqual([])
})

test('returns single fragment unchanged', () => {
  const result = sortFragments([frag('a')])
  expect(result).toHaveLength(1)
  expect(result[0].sys.id).toBe('a')
})

test('sorts two fragments so dependency via slots comes first', () => {
  const a = frag('a', ref('b'))
  const b = frag('b')
  const result = sortFragments([a, b])
  expect(idx(result, 'b')).toBeLessThan(idx(result, 'a'))
  expect(result).toHaveLength(2)
})

test('sorts two fragments so dependency via componentTree comes first', () => {
  const a = frag('a', undefined, ref('b'))
  const b = frag('b')
  const result = sortFragments([a, b])
  expect(idx(result, 'b')).toBeLessThan(idx(result, 'a'))
})

test('sorts a linear chain A→B→C so C comes first', () => {
  const a = frag('a', ref('b'))
  const b = frag('b', ref('c'))
  const c = frag('c')
  const result = sortFragments([a, b, c])
  expect(idx(result, 'c')).toBeLessThan(idx(result, 'b'))
  expect(idx(result, 'b')).toBeLessThan(idx(result, 'a'))
  expect(result).toHaveLength(3)
})

test('preserves relative order of independent fragments', () => {
  const a = frag('a')
  const b = frag('b')
  const c = frag('c')
  const result = sortFragments([a, b, c])
  expect(idx(result, 'a')).toBeLessThan(idx(result, 'b'))
  expect(idx(result, 'b')).toBeLessThan(idx(result, 'c'))
})

test('ignores self-references', () => {
  const a = frag('a', ref('a'))
  const result = sortFragments([a])
  expect(result).toHaveLength(1)
  expect(result[0].sys.id).toBe('a')
})

test('ignores references to fragments not in the list', () => {
  const a = frag('a', ref('unknown'))
  const b = frag('b')
  const result = sortFragments([a, b])
  expect(result).toHaveLength(2)
})

test('handles a cycle without throwing and includes all fragments', () => {
  const a = frag('a', ref('b'))
  const b = frag('b', ref('a'))
  const result = sortFragments([a, b])
  expect(result).toHaveLength(2)
  expect(result.map((f) => f.sys.id)).toEqual(expect.arrayContaining(['a', 'b']))
})

test('diamond dependency: A and B both depend on C, D depends on A and B', () => {
  const c = frag('c')
  const a = frag('a', ref('c'))
  const b = frag('b', ref('c'))
  const d = frag('d', [...ref('a'), ...ref('b')])
  const result = sortFragments([d, b, a, c])
  expect(idx(result, 'c')).toBeLessThan(idx(result, 'a'))
  expect(idx(result, 'c')).toBeLessThan(idx(result, 'b'))
  expect(idx(result, 'a')).toBeLessThan(idx(result, 'd'))
  expect(idx(result, 'b')).toBeLessThan(idx(result, 'd'))
  expect(result).toHaveLength(4)
})

test('fragment with no slots or componentTree fields is treated as having no deps', () => {
  const a = frag('a')
  const b = frag('b', ref('a'))
  const result = sortFragments([b, a])
  expect(idx(result, 'a')).toBeLessThan(idx(result, 'b'))
})
