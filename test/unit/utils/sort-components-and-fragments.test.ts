import sortComponentsAndFragments, { nodeKey } from '../../../lib/utils/sort-components-and-fragments'

const BASE = 'crn:contentful:::experience:spaces/$self/environments/$self'
const link = (linkType: string, path: string, id: string) => ({
  sys: { type: 'ResourceLink', linkType, urn: `${BASE}/${path}/${id}` }
})
const compLink = (id: string) => link('Contentful:Component', 'components', id)
const fragLink = (id: string) => link('Contentful:ExperienceFragment', 'experienceFragments', id)

const compNode = (id: string, component: string, slots: Record<string, any[]> = {}) => ({
  id: `node-${id}`,
  nodeType: 'Component',
  component: compLink(component),
  contentProperties: {},
  designProperties: {},
  slots
})
const fragNode = (fragment: string) => ({
  id: `node-${fragment}`,
  nodeType: 'ExperienceFragment',
  experienceFragment: fragLink(fragment)
})

const component = (id: string, extra: Record<string, any> = {}) => ({
  sys: { id },
  name: id,
  componentTree: [],
  slots: [],
  ...extra
})
const fragment = (id: string, base: string, slots: Record<string, any[]> = {}) => ({
  sys: { id, component: compLink(base) },
  slots
})

const keys = (nodes: { type: any; entity: { sys: { id: string } } }[]) =>
  nodes.map((n) => nodeKey(n.type, n.entity.sys.id))

describe('sortComponentsAndFragments', () => {
  it('orders a multi-level chain across types', () => {
    const button = component('button')
    const c1 = component('c1', { componentTree: [fragNode('f1')] })
    const c2 = component('c2', { componentTree: [fragNode('f2')] })
    const f1 = fragment('f1', 'button')
    const f2 = fragment('f2', 'c1')
    const { sorted, cyclic } = sortComponentsAndFragments([c2, c1, button], [f2, f1])
    expect(keys(sorted)).toEqual([
      'Component:button',
      'ExperienceFragment:f1',
      'Component:c1',
      'ExperienceFragment:f2',
      'Component:c2'
    ])
    expect(cyclic).toEqual([])
  })

  it('adds an edge from a fragment to its base component', () => {
    const { sorted } = sortComponentsAndFragments([component('button')], [fragment('f', 'button')])
    expect(keys(sorted)).toEqual(['Component:button', 'ExperienceFragment:f'])
    const rev = sortComponentsAndFragments([component('x'), component('button')], [fragment('f', 'button')])
    expect(keys(rev.sorted).indexOf('ExperienceFragment:f')).toBeGreaterThan(keys(rev.sorted).indexOf('Component:button'))
  })

  it('does not add edges for slot-definition allowedResources', () => {
    const layout = component('layout', {
      slots: [{ id: 's', allowedResources: [{ type: 'Contentful:Component', allowedTypes: [compLink('card').sys.urn] }] }]
    })
    const { sorted, cyclic } = sortComponentsAndFragments([layout, component('card')], [])
    expect(keys(sorted)).toEqual(['Component:layout', 'Component:card'])
    expect(cyclic).toEqual([])
  })

  it('finds references nested in Looper nodes', () => {
    const looper = { id: 'l', nodeType: 'Looper', items: '$contentProperties/x', componentTree: [compNode('i', 'item')] }
    const { sorted } = sortComponentsAndFragments([component('c', { componentTree: [looper] }), component('item')], [])
    expect(keys(sorted)).toEqual(['Component:item', 'Component:c'])
  })

  it('finds fragments nested in InlineExperienceFragment slots', () => {
    const inline = {
      id: 'i',
      nodeType: 'InlineExperienceFragment',
      component: compLink('button'),
      slots: { s: [fragNode('inner')] }
    }
    const outer = fragment('outer', 'other', { main: [inline] })
    const { sorted } = sortComponentsAndFragments(
      [component('other'), component('button')],
      [outer, fragment('inner', 'other')]
    )
    const k = keys(sorted)
    expect(k.indexOf('ExperienceFragment:outer')).toBeGreaterThan(k.indexOf('Component:button'))
    expect(k.indexOf('ExperienceFragment:outer')).toBeGreaterThan(k.indexOf('ExperienceFragment:inner'))
  })

  it('does not scan fields outside the dependency rules', () => {
    const c = component('c', {
      name: 'components/button',
      optimizationVariants: [{ componentTree: [fragNode('f1')] }]
    })
    const { sorted } = sortComponentsAndFragments([c, component('button')], [fragment('f1', 'button')])
    expect(keys(sorted)).toEqual(['Component:c', 'Component:button', 'ExperienceFragment:f1'])
  })

  it('does not collide when a component and fragment share an id', () => {
    const { sorted, cyclic } = sortComponentsAndFragments(
      [component('hero'), component('base')],
      [fragment('hero', 'base')]
    )
    expect(keys(sorted)).toEqual(['Component:hero', 'Component:base', 'ExperienceFragment:hero'])
    expect(cyclic).toEqual([])
  })

  it('ignores references outside the import set', () => {
    const { sorted, cyclic } = sortComponentsAndFragments([], [fragment('f', 'not-imported')])
    expect(keys(sorted)).toEqual(['ExperienceFragment:f'])
    expect(cyclic).toEqual([])
  })

  it('reports cycles', () => {
    const c1 = component('c1', { componentTree: [fragNode('f1')] })
    const { sorted, cyclic } = sortComponentsAndFragments([c1], [fragment('f1', 'c1')])
    expect(sorted).toEqual([])
    expect(keys(cyclic).sort()).toEqual(['Component:c1', 'ExperienceFragment:f1'])
  })
})
