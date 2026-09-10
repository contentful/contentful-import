# Complete Migration to CMA.js Plain Client

## Status

Accepted

## Context

[003](./2026-04-13-drop-node-lt22-upgrade-cma-v12.md) upgraded `contentful-management` to v12 but deferred the plain-client migration, keeping `{ type: 'legacy' }` chain-client calls throughout the package and its integration tests.

`lib/tasks/init-client.ts` already used the plain client (`type: 'plain'`) for the library's own CMA calls. The only remaining legacy-client usage was space lifecycle management (`createSpace`/`getSpace`/`space.delete()`) in the integration test suite: `test/integration/import-lib.test.ts`, `test/integration/import-exo.test.ts`, and `test/integration/import-exo-folders.test.ts`.

## Decision

- Replace all `createClient({ accessToken }, { type: 'legacy' })` calls in the integration tests with the plain client (`createClient({ accessToken })`)
- Replace legacy chain-client space calls with their plain-client equivalents: `client.createSpace(payload, orgId)` → `client.space.create({ organizationId }, payload)`, `client.getSpace(spaceId)` → `client.space.get({ spaceId })`, and `space.delete()` → `client.space.delete({ spaceId })`
- Update `ARCHITECTURE.md` and `AGENTS.md` to describe the CMA dependency as the plain client, with no remaining legacy chain-client reference

## Consequences

- No code in the package or its test suite uses the CMA.js legacy chain-client API
- Test authors follow the same plain-client call patterns used in `lib/` and in the rest of the integration suite, rather than mixing both APIs
- [003](./2026-04-13-drop-node-lt22-upgrade-cma-v12.md)'s "legacy chain client is still used internally" consequence no longer applies; this ADR supersedes that point
