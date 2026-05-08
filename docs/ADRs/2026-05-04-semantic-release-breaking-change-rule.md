# Add Breaking Change Release Rule to semantic-release Config

## Status

Accepted

## Context

By default, semantic-release does not recognize `feat!` (breaking change shorthand) as a trigger for a major version bump unless the commit footer contains `BREAKING CHANGE:`. The DX team uses `feat!` as the conventional shorthand for breaking changes, but this was not reflected in the release config, causing breaking changes to be released as minor versions.

Ticket: DX-932 [internal-tracker]
Source: `37b1c69 feat!: add breaking change rule to semantic-release config [DX-932] (#1620)`

## Decision

Add an explicit `releaseRules` entry to the `@semantic-release/commit-analyzer` plugin config:

```json
{
  "breaking": true,
  "release": "major"
}
```

This ensures any commit with a breaking change flag (`!` suffix or `BREAKING CHANGE:` footer) correctly triggers a major version bump regardless of the commit type prefix.

Also add a `build(deps)` → `patch` rule so Renovate/Dependabot dependency bumps produce patch releases rather than no release.

## Consequences

- `feat!`, `fix!`, `chore!`, etc. now all correctly produce major releases
- `build(deps)` commits produce patch releases (instead of being ignored)
- The existing `feat` → minor and `fix` → patch behavior is unchanged
- Historical breaking changes that were released as minor versions are not retroactively corrected
