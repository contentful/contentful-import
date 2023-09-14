import sortLocales from '../../lib/utils/sort-locales'

/*
Those locales are dependent like this:

`base` and `base2`    -> don't have a fallback
`a`, `b`, `c`         -> have `base` as a fallback
`fallback_a`          -> falls back to `a`
`fallback_fallback_a` -> falls back to `fallback_a`
`fallback_b`          -> falls back to `b`

base < a < fallback_a < fallback_fallback_a
base < b < fallback_b
base < c < fallback_c
base2
 */
const locales = [
  {
    code: 'fallback_fallback_a',
    fallbackCode: 'fallback_a'
  },
  {
    code: 'base',
    fallbackCode: null
  },
  {
    code: 'a',
    fallbackCode: 'base'
  },
  {
    code: 'b',
    fallbackCode: 'base'
  },
  {
    code: 'fallback_a',
    fallbackCode: 'a'
  },
  {
    code: 'fallback_c',
    fallbackCode: 'c'
  },
  {
    code: 'base2',
    fallbackCode: null
  },
  {
    code: 'fallback_b',
    fallbackCode: 'b'
  },
  {
    code: 'c',
    fallbackCode: 'base'
  }
]

test('Sorts locales by "fallback" order', () => {
  const sortedLocales = sortLocales(locales)

  expect(sortedLocales).toHaveLength(9)

  expect(sortedLocales.map((x) => x.code)).toEqual([
    'base',
    'base2',
    'a',
    'b',
    'c',
    'fallback_a',
    'fallback_fallback_a',
    'fallback_b',
    'fallback_c'
  ])
})

test('Does not mutate fallbackCode to undefined during sorting', () => {
  const sortedLocales = sortLocales(locales)
  // We need empty fallbackCode values to be null not undefined as only this way they will be properly created by the
  // contentful-management client without en-US fallback
  expect(sortedLocales.filter((x) => x.fallbackCode !== undefined)).toHaveLength(9)
})

/*
Create a semi complex circle of locales:

a -> no fallback
d -> falls back to 'a'

circle:
b    -> fallback to `c`
c    -> fallback to `b`
 */
const circle = [
  {
    code: 'a'
  },
  {
    code: 'b',
    fallbackCode: 'c'
  },
  {
    code: 'c',
    fallbackCode: 'b'
  },
  {
    code: 'd',
    fallbackCode: 'a'
  }
]

test('Exclude circular references', () => {
  const sortedLocales = sortLocales(circle)

  expect(sortedLocales).toHaveLength(2)
  expect(sortedLocales.map(x => x.code)).toEqual(['a', 'd'])
})
