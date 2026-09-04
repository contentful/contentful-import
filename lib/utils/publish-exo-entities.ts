import { logEmitter } from 'contentful-batch-libs/dist/logging'
import { ComponentProps, DataAssemblyProps, ExperienceProps, ExperienceFragmentProps, ExperienceTemplateProps, PlainClientAPI } from 'contentful-management'

type PublishableExoEntity = ComponentProps | ExperienceTemplateProps | ExperienceFragmentProps | DataAssemblyProps | ExperienceProps

/**
 * Find all ExO entities in source content which are published, and filter the
 * created/upserted destination entities down to just those. Mirrors publishEntities
 * in push-to-space.ts, but ExO source entities aren't wrapped in { original, transformed }
 * and are plain JSON rather than SDK-wrapped instances, so ExO entities get their own gate here.
 */
export function filterExoEntitiesToPublish<T extends { sys: { id: string; version: number } }>(
  entities: T[],
  sourceEntities: PublishableExoEntity[]
): T[] {
  const entityIdsToPublish = new Set(
    sourceEntities.filter((entity) => entity.sys.publishedVersion).map((entity) => entity.sys.id)
  )
  return entities.filter((entity) => entityIdsToPublish.has(entity.sys.id))
}

/**
 * Inverse of filterExoEntitiesToPublish. Finds entities that are currently published at the
 * destination but draft (or absent) in source, so a source-side unpublish propagates on re-import.
 */
export function filterExoEntitiesToUnpublish<T extends { sys: { id: string; version: number; publishedVersion?: number } }>(
  entities: T[],
  sourceEntities: PublishableExoEntity[]
): T[] {
  const entityIdsPublishedInSource = new Set(
    sourceEntities.filter((entity) => entity.sys.publishedVersion).map((entity) => entity.sys.id)
  )
  return entities.filter((entity) => entity.sys.publishedVersion && !entityIdsPublishedInSource.has(entity.sys.id))
}

export async function publishExoEntity<T>(type: string, entity: { sys: { id: string } }, publish: () => Promise<T>): Promise<T | null> {
  try {
    const result = await publish()
    logEmitter.emit('info', `PUBLISH ${type} ${entity.sys.id}`)
    return result
  } catch (err: any) {
    err.entity = entity
    logEmitter.emit('error', err)
    return null
  }
}

export async function unpublishExoEntity<T>(type: string, entity: { sys: { id: string } }, unpublish: () => Promise<T>): Promise<T | null> {
  try {
    const result = await unpublish()
    logEmitter.emit('info', `UNPUBLISH ${type} ${entity.sys.id}`)
    return result
  } catch (err) {
    logEmitter.emit('error', err)
    return null
  }
}

// A variant's identity is sys.variant, not sys.id (sys.id is borrowed from the parent
// Experience/ExperienceFragment — see projects/decisions/0001-exo-variant-export-storage-shape.md
// in ecosystem-os). These mirror filterExoEntitiesToPublish/Unpublish and
// publishExoEntity/unpublishExoEntity but are kept separate rather than generalizing those
// helpers, per that ADR's decision to keep variant handling additive and isolated.
export function filterVariantsToPublish<T extends { sys: { variant?: string; publishedVersion?: number } }>(
  variants: T[]
): T[] {
  return variants.filter((v) => v.sys.publishedVersion)
}

// Excludes anything also flagged for publish: the upstream API rejects archiving a
// published variant ("Published experience optimization variants cannot be archived.
// Please unpublish the variant first." per assemblies' experience-validations/archive.ts),
// so source data should never have both flags set. Filtering defensively here means
// malformed source data is skipped rather than failing the archive call outright.
export function filterVariantsToArchive<T extends { sys: { variant?: string; publishedVersion?: number; archivedVersion?: number } }>(
  variants: T[]
): T[] {
  return variants.filter((v) => v.sys.archivedVersion && !v.sys.publishedVersion)
}

export async function publishVariant<T>(type: string, entity: { sys: { variant?: string } }, publish: () => Promise<T>): Promise<T | null> {
  try {
    const result = await publish()
    logEmitter.emit('info', `PUBLISH ${type} ${entity.sys.variant}`)
    return result
  } catch (err: any) {
    err.entity = entity
    logEmitter.emit('error', err)
    return null
  }
}

export async function archiveVariant<T>(type: string, entity: { sys: { variant?: string } }, archive: () => Promise<T>): Promise<T | null> {
  try {
    const result = await archive()
    logEmitter.emit('info', `ARCHIVE ${type} ${entity.sys.variant}`)
    return result
  } catch (err: any) {
    err.entity = entity
    logEmitter.emit('error', err)
    return null
  }
}

export function isExoEntitlementError (err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false
  }
  try {
    const parsed = JSON.parse(err.message)
    return parsed?.status === 403 && parsed?.details?.reasons === 'exoM1 entitlement required'
  } catch {
    return false
  }
}

const EXO_M1_FEATURE = 'exoM1'

type OrganizationEntitlementSet = {
  features?: Record<string, { value?: boolean } | undefined>
}

/**
 * Checks the destination space's org for the exoM1 entitlement via the public CMA
 * GET /organizations/{orgId}/organization_entitlement_set endpoint — same endpoint/pattern
 * as contentful-mcp-server's hasExoM1Entitlement (AIS-191), scoped to the one org we already
 * know instead of every org the token can see.
 *
 * Returns `null` only when the check itself couldn't complete (space lookup or entitlement
 * request failed) — callers must treat that as inconclusive and still attempt the real fetch,
 * not as "not entitled" (unlike the MCP server, which fails closed since its risk is exposing
 * unentitled write tools; ours is silently dropping data we could have read).
 */
export async function spaceHasExoM1Entitlement (client: PlainClientAPI, spaceId: string): Promise<boolean | null> {
  try {
    const space = await client.space.get({ spaceId })
    const organizationId = space.sys.organization?.sys?.id
    if (!organizationId) {
      return null
    }
    const entitlements: OrganizationEntitlementSet = await client.raw.get(
      `/organizations/${organizationId}/organization_entitlement_set`
    )
    return entitlements.features?.[EXO_M1_FEATURE]?.value === true
  } catch {
    return null
  }
}
