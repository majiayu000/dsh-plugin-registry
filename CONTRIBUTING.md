# Contributing to Harness Registry

Harness Registry accepts focused improvements to the web interface, registry contract, discovery pipeline, and public data quality.

## Before opening a pull request

1. Search existing issues and open one when the change affects registry policy or data governance.
2. Keep credentials out of the repository. Use `GITHUB_TOKEN` or `GH_TOKEN` only through your local environment or GitHub Actions secrets.
3. Do not manually add a discovered plugin to the generated snapshot. Use the source, override, or blocklist path described below.

## Local checks

Use Node.js 22 and install locked dependencies:

```bash
npm ci
npm test
npm run validate:registry
npm run build
```

All four commands must pass before a pull request is ready for review. Registry validation can emit description warnings; new contract errors must be fixed.

## Registry changes

- Correct approved metadata in `sources/overrides.json`.
- Quarantine malicious, duplicate, or ineligible repositories in `sources/blocklist.json`, including a concrete reason.
- Change the public contract in `schema/registry.schema.json` and update validation tests in the same pull request.
- Treat `public/data/plugins.json` and `public/data/registry-audit.json` as generated snapshots.

See [Registry 数据治理](docs/registry-governance.md) for trust levels and health gates.

## Pull request checklist

- The change has one clear purpose.
- User-facing behavior or registry rules include tests.
- Generated data is included only when the sync output intentionally changed.
- Documentation describes new requirements or limitations.
- No tokens, cookies, private repository data, or personal credentials are present.
