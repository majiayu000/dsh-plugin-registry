# remem DSH submission (draft)

This change stages only `@remem-ai/dsh-remem@0.1.0`, published on npm on
2026-11-04. Keep this PR in draft until remem#1121 corrects the upstream
installation guides. Do not regenerate the public catalog here. The public
snapshot is unchanged.

| Adapter | Package | Source directory | Registry / awesome category |
| --- | --- | --- | --- |
| remem | `@remem-ai/dsh-remem@0.1.0` | `majiayu000/remem/plugins/dsh-remem` | memory / memory |

Supported combination: exact DSH **0.2.1-rc.5** and Cordis ~4.0.5 (the package's
peers), Node.js **>=22.19.0** (its `engines`), the remem **0.7.0** release runtime,
and `pnpm` on `PATH` for `dsh plugin`. The remem data directory must be initialized
before the first turn, for example by `remem install`. DSH 0.2.2-rc.1, the current
npm `latest`, rejects the package at installation.

## Published-package acceptance (2026-11-07)

- Tarball SHA-1 `1ed3608c0d9835144a317eaa9c8b6f48a78a3591`; integrity matched npm.
- All six tarball files match byte for byte a clean build of the `v0.7.0` tag
  (`a86f1547`), and the files installed into the profile match the tarball. The
  public GitHub subpackage manifest and patch are available.
- Runtime: official macOS ARM64 `v0.7.0` binary, checked against the release
  `SHA256SUMS`, used only from a temporary directory.
- Installed by name through the DSH CLI into fresh `DSH_HOME`, `HOME` and
  `REMEM_DATA_DIR` directories. Base bundle and remem row composed with no version
  exemption.
- Headless turns on Node 24.17.0 (plaintext test store) and Node 22.19.0 (encrypted
  store from `remem install`), against a local offline model: the remem block reached
  the model request and the prompt, `read` tool result, assistant message and turn stop
  were captured. The web profile booted and called `remem --version`.
- All 54 tests in the tagged `lifecycle.test.mjs` passed on Node 24.17.0 against the
  tarball's code, with the real 0.7.0 binary and no skips.

Not established: a web-profile agent turn, injection of a stored memory (the
isolated store rendered an empty context block for every host, including a saved
decision), real-model distillation (the executor was a stub), and platforms other
than macOS ARM64. The published README still says the package is unpublished;
remem#1121 updates the repository guides only, so this text ships until a later
package release.

The profile package manager disables automatic peer installation; its
missing-peer warnings are resolved through the DSH installation's package scope.

Before this draft becomes ready:

1. remem#1121 is merged.
2. Review the source entry and run `npm ci`, `npm test`,
   `npm run validate:registry` and `npm run build`.
3. Any public snapshot sync or deployment needs its own authorized operation.
4. The YAML draft in `docs/submissions/` may be submitted to awesome-dsh-plugin
   separately after checking the released implementation. No upstream
   submission has been sent by this change.

The [upstream contribution guide](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)
requires one YAML entry per plugin and a `dsh.bundle` manifest; its READMEs are
generated after merge.
