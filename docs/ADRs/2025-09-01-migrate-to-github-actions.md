# Migrate CI from CircleCI to GitHub Actions

## Status

Accepted

## Context

The repo originally used CircleCI for CI/CD. The Developer Experience team standardized on GitHub Actions (GHA) across the DX-owned repos to consolidate tooling, reduce secret management surface area, and better align with GitHub-native features (CodeQL, Dependabot, OIDC for npm publish).

Source: `3cbaf4b chore: update CI workflows to GHA and publish to NPM (#1515)`

## Decision

Migrate all CI/CD to GitHub Actions workflows in `.github/workflows/`:
- `main.yaml` — orchestrator (build → check + test-integration → release)
- `build.yaml` — compile TypeScript, cache `dist/`
- `check.yaml` — lint + type check
- `test-integration.yaml` — run integration tests with org-level CMA credentials
- `release.yaml` — run `semantic-release` with Vault-sourced tokens
- `codeql.yaml` — scheduled security scanning

npm publish uses OIDC trusted publishing (no long-lived npm token stored as a secret). GitHub token for semantic-release is sourced from HashiCorp Vault via JWT auth.

## Consequences

- CircleCI config is no longer present or maintained
- Build artifacts (`dist/`) are cached between jobs using `actions/cache` with a run-specific cache key, eliminating the need to rebuild in each job
- Integration tests require `CONTENTFUL_INTEGRATION_TEST_CMA_TOKEN` and `CONTENTFUL_ORGANIZATION_ID` org-level secrets
- Vault integration adds a dependency on the internal Vault service for release token retrieval
