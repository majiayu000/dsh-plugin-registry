# remem / VibeGuard DSH submissions

The two entries in `sources/curated.json` are publication preparation. Their npm
install commands require the respective `0.1.0` packages to be published. Do not
merge this change or regenerate/deploy the public catalog until those packages
and their source links are available. The current public snapshot is unchanged.

| Adapter | Package | Source directory | Registry / awesome category |
| --- | --- | --- | --- |
| remem | `@remem-ai/dsh-remem@0.1.0` | `majiayu000/remem/plugins/dsh-remem` | memory / memory |
| VibeGuard | `@vibeguard-ai/dsh@0.1.0` | `majiayu000/vibeguard/plugins/dsh` | dev / security |

remem delegates memory retrieval, observation recording and turn-end capture to
the local remem runtime. VibeGuard delegates Bash pre/post checks to the local
Rust runtime. A VibeGuard policy block goes through DSH approval; infrastructure
errors deny execution. Neither description claims additional host support or a
test count.

The adapter READMEs own runtime requirements and installation instructions. Test
each packed package with the documented DSH version before npm publication.
After the adapter PRs merge and package publication succeeds:

1. Add `dsh-plugin` to each repository's topics, preserving its existing topics.
2. Confirm both exact package versions exist with `npm view`.
3. Install both packages into a disposable DSH profile and verify their runtime
   prerequisites and native lifecycle behavior.
4. Check the public GitHub subpackage manifests and patches, then run the normal
   authenticated `npm run sync:plugins`. Review the generated diff and run
   `npm test`, `npm run validate:registry` and `npm run build` before deployment.
5. Submit the two YAML drafts below to awesome-dsh-plugin as separate PRs after
   reviewing their descriptions against the released code.

Drafts are in `docs/submissions/`. They use the upstream monorepo naming rule.
The current [upstream contribution guide](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)
requires one YAML entry per plugin and a `dsh.bundle` manifest; its READMEs are
generated after merge. No upstream submission has been sent by this change.

Local registry checks confirm only the manifest/patch format and catalog
normalization. They do not establish npm availability, successful installation
on another machine, an upstream acceptance decision, or a production deployment.
