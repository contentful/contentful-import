import {
  upgradeExoResources,
  upgradeComponent,
  upgradeExperienceTemplate,
  upgradeExperienceFragment,
  upgradeExperience,
  upgradeNode
} from '../../../lib/transform/exo-rename'

const legacyComponentLink = (id: string) => ({
  sys: {
    type: 'ResourceLink',
    linkType: 'Contentful:ComponentType',
    urn: `crn:contentful:::experience:spaces/$self/environments/$self/componentTypes/${id}`
  }
})

const newComponentLink = (id: string) => ({
  sys: {
    type: 'ResourceLink',
    linkType: 'Contentful:Component',
    urn: `crn:contentful:::experience:spaces/$self/environments/$self/components/${id}`
  }
})

const legacyTemplateLink = (id: string) => ({
  sys: {
    type: 'ResourceLink',
    linkType: 'Contentful:Template',
    urn: `crn:contentful:::experience:spaces/$self/environments/$self/templates/${id}`
  }
})

// ─── Component ──────────────────────────────────────────────────────────────

describe('upgradeComponent', () => {
  test('rewrites sys.type ComponentType -> Component', () => {
    const result = upgradeComponent({ sys: { id: 'c1', type: 'ComponentType', version: 1 }, name: 'Hero' })
    expect(result.sys.type).toBe('Component')
    expect(result.sys.id).toBe('c1')
    expect(result.name).toBe('Hero')
  })

  test('upgrades componentType nodes in the componentTree to component nodes', () => {
    const result = upgradeComponent({
      sys: { id: 'c1', type: 'ComponentType' },
      componentTree: [
        { id: 'n1', nodeType: 'Component', componentType: legacyComponentLink('hero'), slots: {} }
      ]
    })
    const node = result.componentTree[0]
    expect(node.nodeType).toBe('Component')
    expect(node).not.toHaveProperty('componentType')
    expect(node.component).toEqual(newComponentLink('hero'))
  })

  test('upgrades nested Fragment reference nodes inside slots', () => {
    const result = upgradeComponent({
      sys: { id: 'c1', type: 'ComponentType' },
      componentTree: [
        {
          id: 'n1',
          nodeType: 'Component',
          componentType: legacyComponentLink('hero'),
          slots: {
            main: [{ id: 'f1', nodeType: 'Fragment', fragment: {
              sys: { type: 'ResourceLink', linkType: 'Contentful:Fragment', urn: 'crn:...:/fragments/frag-a' }
            } }]
          }
        }
      ]
    })
    const child = result.componentTree[0].slots.main[0]
    expect(child.nodeType).toBe('ExperienceFragment')
    expect(child).not.toHaveProperty('fragment')
    expect(child.experienceFragment.sys.linkType).toBe('Contentful:ExperienceFragment')
    expect(child.experienceFragment.sys.urn).toContain('/experienceFragments/frag-a')
  })

  test('upgrades allowedResources in slot definitions', () => {
    const result = upgradeComponent({
      sys: { id: 'c1', type: 'ComponentType' },
      slots: [
        {
          id: 's1',
          name: 'Slot',
          required: false,
          validations: [],
          allowedResources: [{
            type: 'Contentful:ComponentType',
            source: 'crn:contentful:::experience:spaces/$self/environments/$self',
            allowedTypes: ['crn:...:/componentTypes/hero']
          }]
        }
      ]
    })
    const resource = result.slots[0].allowedResources[0]
    expect(resource.type).toBe('Contentful:Component')
    expect(resource.allowedTypes[0]).toContain('/components/hero')
  })

  test('upgrades contentProperties TypeRef links (including nested Array items)', () => {
    const result = upgradeComponent({
      sys: { id: 'c1', type: 'ComponentType' },
      contentProperties: [
        { id: 'p1', name: 'ref', required: false, type: 'TypeRef', ref: legacyComponentLink('hero') },
        { id: 'p2', name: 'list', required: false, type: 'Array', items: { type: 'TypeRef', ref: legacyComponentLink('card') } }
      ]
    })
    expect(result.contentProperties[0].ref).toEqual(newComponentLink('hero'))
    expect(result.contentProperties[1].items.ref).toEqual(newComponentLink('card'))
  })

  test('leaves non-TypeRef content properties untouched', () => {
    const prop = { id: 'p1', name: 'title', required: true, type: 'String' }
    const result = upgradeComponent({ sys: { id: 'c1', type: 'ComponentType' }, contentProperties: [prop] })
    expect(result.contentProperties[0]).toEqual(prop)
  })
})

// ─── ExperienceTemplate ───────────────────────────────────────────────────────

describe('upgradeExperienceTemplate', () => {
  test('rewrites sys.type Template -> ExperienceTemplate and upgrades the tree', () => {
    const result = upgradeExperienceTemplate({
      sys: { id: 't1', type: 'Template' },
      componentTree: [{ id: 'n1', nodeType: 'Component', componentType: legacyComponentLink('hero'), slots: {} }]
    })
    expect(result.sys.type).toBe('ExperienceTemplate')
    expect(result.componentTree[0].component).toEqual(newComponentLink('hero'))
  })
})

// ─── ExperienceFragment ───────────────────────────────────────────────────────

describe('upgradeExperienceFragment', () => {
  test('rewrites sys.type and sys.componentType -> sys.component', () => {
    const result = upgradeExperienceFragment({
      sys: { id: 'f1', type: 'Fragment', version: 1, componentType: legacyComponentLink('hero') },
      name: 'Hero Fragment'
    })
    expect(result.sys.type).toBe('ExperienceFragment')
    expect(result.sys).not.toHaveProperty('componentType')
    expect(result.sys.component).toEqual(newComponentLink('hero'))
    expect(result.name).toBe('Hero Fragment')
  })

  test('upgrades reference nodes inside slots', () => {
    const result = upgradeExperienceFragment({
      sys: { id: 'f1', type: 'Fragment', componentType: legacyComponentLink('hero') },
      slots: {
        main: [{ id: 'n1', nodeType: 'InlineFragment', componentType: legacyComponentLink('inner'), designProperties: {}, slots: {} }]
      }
    })
    const node = result.slots.main[0]
    expect(node.nodeType).toBe('InlineExperienceFragment')
    expect(node).not.toHaveProperty('componentType')
    expect(node.component).toEqual(newComponentLink('inner'))
  })
})

// ─── Experience ─────────────────────────────────────────────────────────────

describe('upgradeExperience', () => {
  test('rewrites sys.template -> sys.experienceTemplate', () => {
    const result = upgradeExperience({
      sys: { id: 'e1', type: 'Experience', version: 1, template: legacyTemplateLink('press') },
      name: 'My Experience'
    })
    expect(result.sys).not.toHaveProperty('template')
    expect(result.sys.experienceTemplate.sys.linkType).toBe('Contentful:ExperienceTemplate')
    expect(result.sys.experienceTemplate.sys.urn).toContain('/experienceTemplates/press')
  })
})

// ─── Node guard ───────────────────────────────────────────────────────────────

describe('upgradeNode', () => {
  test('passes Slot nodes through unchanged', () => {
    const slot = { id: 's1', nodeType: 'Slot', slotId: 'main' }
    expect(upgradeNode(slot)).toEqual(slot)
  })

  test('is idempotent on already-new-form Component nodes', () => {
    const node = { id: 'n1', nodeType: 'Component', component: newComponentLink('hero'), slots: {} }
    expect(upgradeNode(node)).toEqual(node)
  })
})

// ─── upgradeExoResources (top-level) ────────────────────────────────────────

describe('upgradeExoResources', () => {
  test('upgrades all renameable ExO entity arrays', () => {
    const result: any = upgradeExoResources({
      components: [{ sys: { id: 'c1', type: 'ComponentType' } }],
      experienceTemplates: [{ sys: { id: 't1', type: 'Template' } }],
      experienceFragments: [{ sys: { id: 'f1', type: 'Fragment', componentType: legacyComponentLink('hero') } }],
      experiences: [{ sys: { id: 'e1', type: 'Experience', template: legacyTemplateLink('press') } }]
    } as any)
    expect(result.components[0].sys.type).toBe('Component')
    expect(result.experienceTemplates[0].sys.type).toBe('ExperienceTemplate')
    expect(result.experienceFragments[0].sys.type).toBe('ExperienceFragment')
    expect(result.experiences[0].sys.experienceTemplate).toBeDefined()
  })

  test('leaves non-renamed ExO entities (dataAssemblies, designTokens) untouched', () => {
    const input = {
      dataAssemblies: [{ sys: { id: 'da1', type: 'DataAssembly' } }],
      designTokens: [{ sys: { id: 'dt1', type: 'DesignToken' } }]
    }
    expect(upgradeExoResources(input)).toEqual(input)
  })

  test('is idempotent — running twice equals running once', () => {
    const input = {
      components: [{ sys: { id: 'c1', type: 'ComponentType' }, componentTree: [{ id: 'n1', nodeType: 'Component', componentType: legacyComponentLink('hero'), slots: {} }] }],
      experienceFragments: [{ sys: { id: 'f1', type: 'Fragment', componentType: legacyComponentLink('hero') } }],
      experiences: [{ sys: { id: 'e1', type: 'Experience', template: legacyTemplateLink('press') } }]
    }
    const once = upgradeExoResources(input)
    const twice = upgradeExoResources(once)
    expect(twice).toEqual(once)
  })

  test('passes already-new-form entities through unchanged', () => {
    const input = {
      components: [{ sys: { id: 'c1', type: 'Component' }, component: newComponentLink('hero') }],
      experienceFragments: [{ sys: { id: 'f1', type: 'ExperienceFragment', component: newComponentLink('hero') } }]
    }
    expect(upgradeExoResources(input)).toEqual(input)
  })

  test('does not add ExO keys that were not present', () => {
    const result = upgradeExoResources({ webhooks: [] } as any)
    expect(result).not.toHaveProperty('components')
    expect(result).not.toHaveProperty('experiences')
  })
})
