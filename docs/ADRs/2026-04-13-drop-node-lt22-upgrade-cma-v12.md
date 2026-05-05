# Drop Node <22 Support and Upgrade to CMA.js v12

## Status

Accepted

## Context

`contentful-management` v12 introduced a new "plain client" API alongside the existing "chain client" (legacy) API. The plain client offers better tree-shaking and TypeScript ergonomics. The v12 upgrade was also paired with a Node.js minimum version bump to ≥22 (from ≥18) as part of a DX team-wide initiative to keep the SDK ecosystem on actively supported Node.js versions.

Ticket: DX-782 [internal-tracker]
Source: `bcfff36 feat!: update to CMA.js v12 and drop Node < 22 support [DX-782] (#1618)`

## Decision

- Upgrade `contentful-management` from `^11.x` to `^12.x`
- All `createClient` calls use `{ type: 'legacy' }` to keep the existing chain-client call patterns — the package is not migrated to the plain client API in this change
- Raise `engines.node` to `>=22` in `package.json`
- Update `.nvmrc` to `24` and all CI workflows to use Node 24
- Integration tests updated to use the v12 plain client API for space lifecycle operations (`space.create` / `space.delete`) which are no longer available on the legacy chain client

## Consequences

- Node 18 and 20 are no longer supported or tested
- The legacy chain client is still used internally — migration to the plain client is deferred
- CI and local dev should use Node 24 (`.nvmrc` value) even though the minimum is 22
- The `feat!` commit type triggers a major version bump via semantic-release, signaling a breaking change to downstream users on older Node versions
