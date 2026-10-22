# remem DSH submission (draft)

This change stages only `@remem-ai/dsh-remem@0.1.0`. The exact package returned
npm E404 on 2026-10-22. Keep this PR in draft; do not merge it or regenerate the
public catalog until the package and its public source are available and a
native DSH installation has been verified. The public snapshot is unchanged.

| Adapter | Package | Source directory | Registry / awesome category |
| --- | --- | --- | --- |
| remem | `@remem-ai/dsh-remem@0.1.0` | `majiayu000/remem/plugins/dsh-remem` | memory / memory |

remem delegates memory retrieval, observation recording and turn-end capture to
the local remem runtime. Its README owns runtime requirements and installation
instructions. Registry source validation does not establish native lifecycle
compatibility or successful installation on another machine.

Before this draft becomes ready:

1. Confirm the exact npm package and public GitHub subpackage manifest and patch
   are available.
2. Install the published tarball into a disposable profile using its declared
   DSH peer versions, and verify its native lifecycle and runtime prerequisites.
3. Review the source entry and run `npm ci`, `npm test`,
   `npm run validate:registry` and `npm run build`.
4. Any public snapshot sync or deployment needs its own authorized operation.
5. The YAML draft in `docs/submissions/` may be submitted to awesome-dsh-plugin
   separately after checking the released implementation. No upstream
   submission has been sent by this change.

The [upstream contribution guide](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)
requires one YAML entry per plugin and a `dsh.bundle` manifest; its READMEs are
generated after merge.
