import { logEmitter } from 'contentful-batch-libs/dist/logging'
import { ReleasePayloadV2 } from 'contentful-management'
import { EntityTransformed, ReleaseV2Props } from '../../types'

export type TransformedRelease = EntityTransformed<ReleaseV2Props, any>

export type ReleasesContext = {
  client: any,
  spaceId: string,
  environmentId: string
}

// contentful-import only supports Release.v2 ("Releases") - Release.v1 ("Launch") is not
// supported. A v1 release's entities are flat Link<Entity> (no per-item action), which is not
// a valid ReleasePayloadV2 and would otherwise fail with a confusing 422.
export function partitionReleasesBySchemaVersion(releases: TransformedRelease[]) {
  return {
    supported: releases.filter((release) => release.transformed.sys.schemaVersion === 'Release.v2'),
    unsupported: releases.filter((release) => release.transformed.sys.schemaVersion !== 'Release.v2')
  }
}

export function logUnsupportedRelease(release: TransformedRelease) {
  logEmitter.emit('error', new Error(
    `Skipping Release "${release.transformed.sys.id}": only Release.v2 ("Releases") is supported, got schemaVersion "${release.transformed.sys.schemaVersion}"`
  ))
}

// POST /releases always server-generates sys.id (title + a generated uuid) - there's no
// createWithId for the base Release entity, unlike ReleaseAsset/ReleaseEntry. So a release
// created here can never be found by the `existing` lookup on a later import run;
// re-importing the same source data creates additional releases rather than updating them.
// See the "Releases" section of the README. Explicitly omitting id here (rather than just not
// re-adding it) makes it clear the source id is never sent on create, not merely that the API
// happens to ignore it.
export function buildReleaseCreatePayload(release: TransformedRelease): ReleasePayloadV2 {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _sourceId, ...sourceSysWithoutId } = release.transformed.sys
  return {
    ...release.transformed,
    entities: release.transformed.entities,
    sys: { ...sourceSysWithoutId, type: 'Release', schemaVersion: 'Release.v2' }
  }
}

export function buildReleaseUpdatePayload(release: TransformedRelease): ReleasePayloadV2 {
  return {
    ...release.transformed,
    entities: release.transformed.entities,
    sys: { type: 'Release', schemaVersion: 'Release.v2' }
  }
}

export async function importRelease(
  release: TransformedRelease,
  existing: { sys: { id: string, version: number } } | undefined,
  context: ReleasesContext
) {
  const { client, spaceId, environmentId } = context
  try {
    if (existing) {
      const result = await client.release.update(
        { spaceId, environmentId, releaseId: existing.sys.id, version: existing.sys.version },
        buildReleaseUpdatePayload(release)
      )
      logEmitter.emit('info', `UPDATE Release ${existing.sys.id}`)
      return result
    }

    const result = await client.release.create({ spaceId, environmentId }, buildReleaseCreatePayload(release))
    logEmitter.emit('info', `CREATE Release ${result.sys.id}`)
    return result
  } catch (err: any) {
    err.entity = release.transformed
    logEmitter.emit('error', err)
    return null
  }
}
