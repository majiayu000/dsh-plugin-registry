# VibeGuard native DSH submission

`@vibeguard-ai/dsh@0.1.0` is available on npm. This source entry and the separate
upstream YAML draft describe the released package; remem remains in its own
draft pending npm availability. No generated public snapshot is changed here.

## Published-package acceptance (2026-10-22)

- Exact npm tarball SHA-1: `e789f18d68fc091afd4aae3336b7a5b93145e85b`.
- Published `lib/index.js`, `lib/runtime.js`, manifest and bundle patch match the
  source checkout's built files. The public GitHub subpackage manifest and patch
  are also available.
- Supported DSH packages: **0.2.0-rc.2**, as declared by the package's exact peers.
  Requires Node.js **^22.19.0 or >=24.0.0** and the VibeGuard **2.0.2** release
  runtime, matching the published package README. Acceptance used Node 24.17.0
  and the official macOS ARM64 `vibeguard-aarch64-apple-darwin.tar.gz` from
  [v2.0.2](https://github.com/majiayu000/vibeguard/releases/tag/v2.0.2), verified
  against the release SHA256SUMS and used only from a temporary directory.
- The published tarball installed through the exact DSH CLI into a fresh
  `DSH_HOME`. The normal base bundle and VibeGuard row composed successfully,
  with explicit temporary runtime state and no compatibility exemptions.
- All 15 native lifecycle cases passed with that **2.0.2** binary against the
  profile-installed published code using DSH's official module resolution. Coverage includes allow, native
  approval grant/rejection/cancellation/unavailability, missing approval and
  agent, runtime failure denial, post-execution facts and teardown.
- The test Bash tool was inert and the model adapter was offline. Dangerous
  command strings went only to the Rust guard's stdin, never to a Bash executor.

The profile package manager disables automatic peer installation; its initial
missing-peer warnings are resolved through the DSH installation's package
scope. Composition and native activation were checked with the declared DSH
version, without ignoring peers or using version exemptions.

The [adapter README](https://github.com/majiayu000/vibeguard/tree/main/plugins/dsh)
describes configuration and runtime requirements. To repeat the install with a
disposable profile and the supported CLI version:

```sh
npm pack @vibeguard-ai/dsh@0.1.0
dsh plugin --profile acceptance add ./vibeguard-ai-dsh-0.1.0.tgz
dsh --profile acceptance --dump-config
```

Set a temporary `DSH_HOME` first and point the VibeGuard row's `stateDir` at a
writable temporary workspace. Config composition alone does not prove runtime
activation; native lifecycle acceptance is a separate check above.

Registry source checks do not publish npm packages, submit the upstream YAML,
regenerate the public catalog or deploy the site. Those are separate operations.
