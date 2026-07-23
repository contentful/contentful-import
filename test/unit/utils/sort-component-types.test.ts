import sortComponentTypes from '../../../lib/utils/sort-component-types'

function makeRef(id: string) {
  return { sys: { type: 'ResourceLink', urn: `crn:..../componentTypes/${id}` } }
}

function makeCT(id: string, deps: string[] = []) {
  return {
    sys: { id },
    componentTree: deps.map((dep) => ({
      componentType: makeRef(dep)
    }))
  }
}

test('returns empty array unchanged', () => {
  expect(sortComponentTypes([])).toEqual([])
})

test('returns single item unchanged', () => {
  const cts = [makeCT('a')]
  expect(sortComponentTypes(cts).map((c) => c.sys.id)).toEqual(['a'])
})

test('leaf nodes come before nodes that reference them', () => {
  const cts = [makeCT('composite', ['leaf']), makeCT('leaf')]
  const sorted = sortComponentTypes(cts).map((c) => c.sys.id)
  expect(sorted.indexOf('leaf')).toBeLessThan(sorted.indexOf('composite'))
})

test('handles multi-level dependency chain', () => {
  const cts = [makeCT('c', ['b']), makeCT('b', ['a']), makeCT('a')]
  const sorted = sortComponentTypes(cts).map((c) => c.sys.id)
  expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('b'))
  expect(sorted.indexOf('b')).toBeLessThan(sorted.indexOf('c'))
})

test('handles multiple independent deps', () => {
  const cts = [
    makeCT('top', ['left', 'right']),
    makeCT('right'),
    makeCT('left'),
  ]
  const sorted = sortComponentTypes(cts).map((c) => c.sys.id)
  expect(sorted.indexOf('left')).toBeLessThan(sorted.indexOf('top'))
  expect(sorted.indexOf('right')).toBeLessThan(sorted.indexOf('top'))
})

test('does not drop nodes involved in a cycle', () => {
  const cts = [makeCT('a', ['b']), makeCT('b', ['a'])]
  const sorted = sortComponentTypes(cts).map((c) => c.sys.id)
  expect(sorted).toHaveLength(2)
  expect(sorted).toContain('a')
  expect(sorted).toContain('b')
})

test('ignores self-references', () => {
  const cts = [makeCT('a', ['a']), makeCT('b')]
  const sorted = sortComponentTypes(cts).map((c) => c.sys.id)
  expect(sorted).toHaveLength(2)
})
