# ShipWise launch readiness: Harness Registry

## Summary

- Project: Harness Registry
- Version: 0.1.0
- Archetype: `registry-dataset`
- Goal type: adoption and feedback, not yet confirmed by the repository owner
- Repository: <https://github.com/majiayu000/dsh-plugin-registry>
- Verification date: 2026-08-15
- Recommendation: improve before launch

The project has a deployed registry UI, a validated schema, a real data snapshot, an MIT License, and a support path. The Cloudflare Pages access path is verified; formal launch readiness still depends on a release strategy and social preview.

## Status legend

- `verified`: directly checked in this review cycle.
- `missing`: required information or artifact is absent.
- `unverified`: present or planned but not checked.
- `blocked`: prevents launch.
- `not applicable`: not needed for this archetype or channel.

## P0 launch blockers

| Check | Status | Evidence | Next action |
|---|---|---|---|
| Target user named | verified | README names DSH users and plugin authors | Validate wording with initial users |
| Install/access path works | verified | Cloudflare Pages (<https://plugin.dshdesk.com/>) and the public registry JSON return HTTP 200 | Monitor the Cloudflare Pages deployment workflows |
| Quickstart works | verified locally | `npm run dev -- --host 127.0.0.1` served the registry | Recheck from a clean clone before release |
| Real proof asset exists | verified | [`docs/assets/harness-registry.png`](assets/harness-registry.png) uses the current registry snapshot | Keep it current when the UI changes materially |
| License is present | verified locally | MIT License selected by the repository owner and recorded in `LICENSE` and `package.json` | Push and verify GitHub license detection |
| Support path exists | verified | GitHub Issues enabled; private vulnerability reporting enabled | Publish local support files to the default branch |

## P1 readiness gaps

| Check | Status | Evidence | Next action |
|---|---|---|---|
| Release or package path | missing | No GitHub Release; npm publication is intentionally not a goal | Choose a hosted deployment and release strategy |
| README first screen | verified locally | Positioning, proof, quickstart, and pre-release limitation are visible | Push and review the rendered GitHub page |
| Limitations documented | verified | README separates manifest verification from security review | Keep limitations aligned with implementation |
| Platform source docs checked | verified | ShipWise Agent Guide, decision tree, discoverability, release lifecycle, and GitHub source guide | Recheck current platform rules before publishing |
| Baseline metrics recorded | verified | Snapshot: 2,006 published, 573 curated, 1,433 automatically discovered; GitHub: 0 Stars and 0 Forks | Refresh immediately before launch copy |

## P2 channel polish

| Check | Status | Evidence | Next action |
|---|---|---|---|
| Platform-specific copy | unverified | Hosted access is ready, but no launch copy has been reviewed | Draft after the release goal and audience are confirmed |
| Social image or preview | missing | Real UI proof exists, but it is not a 1280×640 social preview | Create and upload a dedicated preview |
| Second-wave channels | unverified | No launch goal or audience channel confirmed | Decide only after first-wave proof and feedback plan |

## Registry/dataset proof

The current generated snapshot reports:

```text
published: 2006
curated: 573
automaticallyDiscovered: 1433
pendingReview: 1167
```

These are point-in-time repository facts from `public/data/plugins.json`, not market-size or adoption claims.

## Channel decision

- Project: Harness Registry
- Archetype: Registry / dataset / index
- Primary goal: unverified; likely adoption and data-quality feedback
- First platform after blockers: GitHub repository and a verified hosted registry
- Potential later platforms: Hacker News or X only after people can use the hosted site
- Rejected for now: Product Hunt and broad community posting without deployment or social preview
- Official source docs checked: ShipWise GitHub source guide and linked GitHub documentation
- Remaining readiness gaps: missing release strategy and social preview
- Review date: after the release decision

## Verification commands

```bash
npm ci
npm test
npm run validate:registry
npm run build
python3 ~/.codex/skills/github-repo-seo/scripts/repo_seo_baseline.py --root . --json
```

Expected outcome: dependency install succeeds; tests, registry validation, and Vite build pass; the baseline reports a README plus complete local package metadata. Registry validation may retain known missing-description warnings while returning success.

## Decision

- Hosted preview: yes — <https://plugin.dshdesk.com/>
- Formal launch: no
- Reason: the production access path is verified, but the release strategy and social preview remain open
- Next action: choose a release strategy and prepare the repository social preview

## Non-goals

- No guarantee of GitHub Trending, search ranking, Stars, traffic, downloads, or community response.
- No npm package publication is planned; `package.json` defines a private web application.
- No platform post or release was published as part of this review.
