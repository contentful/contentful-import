/**
 * Shared factory for mocking the `contentful-management` `PlainClientAPI`
 * (aliased below as `client`) in unit tests.
 *
 * Every namespace (`asset`, `entry`, `conceptScheme`, ...) ships with sensible
 * default jest mocks. Pass `overrides` to replace specific methods for a test -
 * anything not overridden keeps its default. Any method that isn't listed below
 * (including on namespaces not overridden here at all) is still callable: it
 * auto-creates a `jest.fn().mockResolvedValue(undefined)` on first access, so
 * production code exercising an un-mocked call path won't throw.
 */
export type PlainClientMockOverrides = {
  [namespace: string]: Record<string, any>
}

function sys(type: string) {
  return { sys: { type } }
}

function exoNamespaceDefaults(type: string) {
  return {
    create: jest.fn().mockResolvedValue(sys(type)),
    upsert: jest.fn().mockResolvedValue(sys(type)),
    update: jest.fn().mockResolvedValue(sys(type)),
    publish: jest.fn().mockResolvedValue(sys(type)),
    unpublish: jest.fn().mockResolvedValue(sys(type)),
    getMany: jest.fn().mockResolvedValue({ items: [] }),
  }
}

function buildDefaultNamespaces(): Record<string, Record<string, any>> {
  return {
    asset: {
      create: jest.fn().mockResolvedValue(sys('Asset')),
      createWithId: jest.fn().mockResolvedValue(sys('Asset')),
      update: jest.fn().mockResolvedValue(sys('Asset')),
      publish: jest.fn().mockResolvedValue(sys('Asset')),
      archive: jest.fn().mockResolvedValue(sys('Asset')),
      processForLocale: jest.fn().mockResolvedValue(sys('Asset')),
      getMany: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    },
    contentType: {
      create: jest.fn().mockResolvedValue(sys('ContentType')),
      createWithId: jest.fn().mockResolvedValue(sys('ContentType')),
      update: jest.fn().mockResolvedValue(sys('ContentType')),
      publish: jest.fn().mockResolvedValue(sys('ContentType')),
      getMany: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    },
    entry: {
      create: jest.fn().mockResolvedValue(sys('Entry')),
      createWithId: jest.fn().mockResolvedValue(sys('Entry')),
      update: jest.fn().mockResolvedValue(sys('Entry')),
      publish: jest.fn().mockResolvedValue(sys('Entry')),
      archive: jest.fn().mockResolvedValue(sys('Entry')),
      getMany: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    },
    locale: {
      create: jest.fn().mockResolvedValue(sys('Locale')),
      update: jest.fn().mockResolvedValue(sys('Locale')),
      getMany: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    },
    tag: {
      createWithId: jest.fn().mockResolvedValue(sys('Tag')),
      getMany: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    },
    webhook: {
      create: jest.fn().mockResolvedValue(sys('Webhook')),
      update: jest.fn().mockResolvedValue(sys('Webhook')),
    },
    editorInterface: {
      get: jest.fn().mockResolvedValue(sys('EditorInterface')),
      update: jest.fn().mockResolvedValue(sys('EditorInterface')),
    },
    upload: {
      create: jest.fn().mockResolvedValue({ sys: { type: 'Upload', id: 'upload-id' } }),
    },
    space: {
      get: jest.fn().mockResolvedValue({ sys: { type: 'Space' } }),
    },
    raw: {},
    concept: {
      get: jest.fn().mockResolvedValue({}),
      createWithId: jest.fn().mockResolvedValue({}),
      patch: jest.fn().mockResolvedValue({}),
    },
    conceptScheme: {
      getMany: jest.fn().mockResolvedValue({ items: [] }),
      createWithId: jest.fn().mockResolvedValue({}),
      patch: jest.fn().mockResolvedValue({}),
    },
    component: exoNamespaceDefaults('Component'),
    designToken: exoNamespaceDefaults('DesignToken'),
    experienceTemplate: exoNamespaceDefaults('ExperienceTemplate'),
    experienceFragment: exoNamespaceDefaults('ExperienceFragment'),
    dataAssembly: exoNamespaceDefaults('DataAssembly'),
    experience: exoNamespaceDefaults('Experience'),
  }
}

function autoMockNamespace(explicit: Record<string, any>): Record<string, any> {
  const target: Record<string, any> = { ...explicit }
  return new Proxy(target, {
    get(obj, prop: string) {
      if (!(prop in obj)) {
        obj[prop] = jest.fn().mockResolvedValue(undefined)
      }
      return obj[prop]
    },
  })
}

/**
 * Returns `any` rather than `PlainClientAPI` on purpose: every namespace/method here is a
 * jest mock, so tests need direct access to `.mock`, `.mockResolvedValueOnce`, etc. without
 * having to cast or sprinkle `@ts-expect-error` at every call site. The result is still a
 * structurally valid `PlainClientAPI` and can be passed anywhere one is expected.
 */
export function makePlainClientMock(overrides: PlainClientMockOverrides = {}): any {
  const defaults = buildDefaultNamespaces()
  const namespaceKeys = new Set([...Object.keys(defaults), ...Object.keys(overrides)])

  const client: Record<string, any> = {}
  for (const key of namespaceKeys) {
    client[key] = autoMockNamespace({ ...defaults[key], ...overrides[key] })
  }

  return client
}
