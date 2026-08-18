export const TEST_PREFIX = '[Exo Integration Test]'

// $self-relative CRN format for same-space/environment ExO ResourceLinks -
// see reference_exo_resource_link_urns memory / exo-rename.ts for the canonical form.
const EXO_CRN_PREFIX = 'crn:contentful:::experience:spaces/$self/environments/$self'

const entityPaths: Record<string, string> = {
  'Contentful:Component': 'components',
  'Contentful:ExperienceTemplate': 'experienceTemplates'
}

export function makeResourceLink (linkType: keyof typeof entityPaths, id: string) {
  return {
    sys: {
      type: 'ResourceLink' as const,
      linkType,
      urn: `${EXO_CRN_PREFIX}/${entityPaths[linkType]}/${id}`
    }
  }
}

export const testViewport = {
  id: 'desktop',
  query: '(min-width: 1024px)',
  displayName: 'Desktop',
  previewSize: '100%'
}

export type ExoFixtureIds = {
  designTokenId: string
  componentId: string
  dataAssemblyId: string
  experienceTemplateId: string
  experienceFragmentId: string
  experienceId: string
}

// Each describe block in import-exo.test.ts creates and deletes its own throwaway space
// (same pattern as import-lib.test.ts), so there's no cross-run collision risk - literal,
// stable IDs are fine and easier to read/debug than generated ones.
export const EXO_FIXTURE_IDS: ExoFixtureIds = {
  designTokenId: 'exo-design-token',
  componentId: 'exo-component',
  dataAssemblyId: 'exo-data-assembly',
  experienceTemplateId: 'exo-experience-template',
  experienceFragmentId: 'exo-experience-fragment',
  experienceId: 'exo-experience'
}

/**
 * Builds an export-shaped content payload covering all 6 ExO entity types, in the same
 * "read" shape contentful-export would produce: cross-entity references (ExperienceFragment
 * -> Component, Experience -> ExperienceTemplate) live under `sys`, as returned by the CMA,
 * not at the top level (that's the CREATE-payload shape push-to-space.ts builds from this).
 *
 * DesignToken, DataAssembly and ExperienceFragment are left draft; Component,
 * ExperienceTemplate and Experience are published - covers publish-state preservation
 * with a single import run instead of a dedicated one per state.
 */
export function buildExoContent (ids: ExoFixtureIds) {
  return {
    designTokens: [
      {
        sys: { id: ids.designTokenId, type: 'DesignToken', version: 1 },
        name: `${TEST_PREFIX} Design Token`,
        type: 'DTCG.Color'
      }
    ],
    components: [
      {
        sys: { id: ids.componentId, type: 'Component', version: 1, publishedVersion: 1 },
        name: `${TEST_PREFIX} Component`,
        description: 'Created by an ExO import integration test',
        viewports: [testViewport],
        contentProperties: [{ id: 'title', name: 'Title', type: 'String', required: false }],
        designProperties: [{ id: 'color', name: 'Color', type: 'String' }]
      }
    ],
    dataAssemblies: [
      {
        sys: {
          id: ids.dataAssemblyId,
          type: 'DataAssembly',
          version: 1,
          dataType: [{ id: 'title', name: 'Title', type: 'String', required: false }]
        },
        metadata: { tags: [] },
        name: `${TEST_PREFIX} Data Assembly`,
        description: 'Created by an ExO import integration test',
        parameters: {},
        resolvers: {},
        return: {}
      }
    ],
    experienceTemplates: [
      {
        sys: { id: ids.experienceTemplateId, type: 'ExperienceTemplate', version: 1, publishedVersion: 1 },
        name: `${TEST_PREFIX} Experience Template`,
        description: 'Created by an ExO import integration test',
        viewports: [testViewport],
        contentProperties: [],
        designProperties: []
      }
    ],
    experienceFragments: [
      {
        sys: {
          id: ids.experienceFragmentId,
          type: 'ExperienceFragment',
          version: 1,
          component: makeResourceLink('Contentful:Component', ids.componentId)
        },
        name: `${TEST_PREFIX} Experience Fragment`,
        description: 'Created by an ExO import integration test',
        viewports: [testViewport],
        designProperties: {}
      }
    ],
    experiences: [
      {
        sys: {
          id: ids.experienceId,
          type: 'Experience',
          version: 1,
          publishedVersion: 1,
          experienceTemplate: makeResourceLink('Contentful:ExperienceTemplate', ids.experienceTemplateId)
        },
        name: `${TEST_PREFIX} Experience`,
        description: 'Created by an ExO import integration test',
        viewports: [testViewport],
        designProperties: {}
      }
    ]
  }
}

export function makeFolderConceptLink (conceptId: string) {
  return { sys: { type: 'Link' as const, linkType: 'TaxonomyConcept' as const, id: conceptId } }
}

export type FolderExoFixtureIds = {
  componentId: string
  experienceTemplateId: string
  experienceId: string
}

// Two distinct entity types/parent folder-groups (componentType, experience) in one
// payload, to catch a mis-mapping in ENTITY_TYPE_TO_PARENT_GROUP_ID without needing all 5.
export const FOLDER_EXO_FIXTURE_IDS: FolderExoFixtureIds = {
  componentId: 'exo-folder-component',
  experienceTemplateId: 'exo-folder-experience-template',
  experienceId: 'exo-folder-experience'
}

export type FolderConceptIds = {
  component: string
  experience: string
}

/**
 * A Component and an Experience (with its required ExperienceTemplate dependency), each
 * placed in a folder via metadata.concepts - exercises import-exo-folders.ts's 5-step
 * process (ensure parent groups -> derive dest concept IDs -> create/patch child concepts
 * -> link into parent groups -> rewrite entity metadata.concepts in-place) across two of
 * the five parent folder-group schemes in one import run.
 *
 * folderConceptIds is caller-supplied (not a fixed literal) because these become real,
 * permanent, org-scoped TaxonomyConcept IDs shared across every space in the org - the
 * caller derives them from its own throwaway space ID so concurrent CI runs never race
 * on the same org-level resource (see import-exo-folders.test.ts).
 *
 * No `sys.space` set, so getSourceSpaceId() returns undefined - this is treated as a
 * cross-space import (undefined !== destinationSpaceId), same as buildExoContent above.
 */
export function buildExoFolderContent (ids: FolderExoFixtureIds, folderConceptIds: FolderConceptIds) {
  return {
    components: [
      {
        sys: { id: ids.componentId, type: 'Component', version: 1 },
        metadata: { tags: [], concepts: [makeFolderConceptLink(folderConceptIds.component)] },
        name: `${TEST_PREFIX} Foldered Component`,
        description: 'Created by an ExO folder import integration test',
        viewports: [testViewport],
        contentProperties: [{ id: 'title', name: 'Title', type: 'String', required: false }],
        designProperties: [{ id: 'color', name: 'Color', type: 'String' }]
      }
    ],
    experienceTemplates: [
      {
        sys: { id: ids.experienceTemplateId, type: 'ExperienceTemplate', version: 1 },
        name: `${TEST_PREFIX} Foldered Experience Template`,
        description: 'Created by an ExO folder import integration test',
        viewports: [testViewport],
        contentProperties: [],
        designProperties: []
      }
    ],
    experiences: [
      {
        sys: {
          id: ids.experienceId,
          type: 'Experience',
          version: 1,
          experienceTemplate: makeResourceLink('Contentful:ExperienceTemplate', ids.experienceTemplateId)
        },
        metadata: { tags: [], concepts: [makeFolderConceptLink(folderConceptIds.experience)] },
        name: `${TEST_PREFIX} Foldered Experience`,
        description: 'Created by an ExO folder import integration test',
        viewports: [testViewport],
        designProperties: {}
      }
    ]
  }
}

/**
 * Same Component/folder pairing as buildExoFolderContent, but with `sys.space.sys.id`
 * pinned to the destination space - simulates a same-space import, where
 * importExoFolders() should skip its own logic entirely (source === destination space)
 * and leave the source concept ID on the entity untouched. Since the skip means no
 * org-level concept is ever created, folderConceptId can safely be a fixed literal here.
 */
export function buildSameSpaceExoFolderContent (ids: FolderExoFixtureIds, folderConceptId: string, spaceId: string) {
  return {
    components: [
      {
        sys: { id: ids.componentId, type: 'Component', version: 1, space: { sys: { id: spaceId } } },
        metadata: { tags: [], concepts: [makeFolderConceptLink(folderConceptId)] },
        name: `${TEST_PREFIX} Foldered Component`,
        description: 'Created by an ExO folder import integration test',
        viewports: [testViewport],
        contentProperties: [{ id: 'title', name: 'Title', type: 'String', required: false }],
        designProperties: [{ id: 'color', name: 'Color', type: 'String' }]
      }
    ]
  }
}

/**
 * A re-import payload for just the Component from buildExoContent, with no
 * publishedVersion - i.e. "this entity was unpublished in the source since the last
 * export." Only the Component key is set; every other entity type defaults to empty and
 * is left untouched by the import. Used to verify that an unpublish in the source
 * propagates to the destination on re-import (see push-to-space.ts's "Unpublishing
 * Components" task).
 */
export function buildUnpublishedComponentContent (ids: ExoFixtureIds) {
  return {
    components: [
      {
        sys: { id: ids.componentId, type: 'Component', version: 1 },
        name: `${TEST_PREFIX} Component`,
        description: 'Created by an ExO import integration test',
        viewports: [testViewport],
        contentProperties: [{ id: 'title', name: 'Title', type: 'String', required: false }],
        designProperties: [{ id: 'color', name: 'Color', type: 'String' }]
      }
    ]
  }
}
