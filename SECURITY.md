# Security Policy

## Reporting a vulnerability

Do not disclose exploitable vulnerabilities, leaked credentials, or malicious registry payloads in a public issue.

Use GitHub's [private vulnerability reporting](https://github.com/majiayu000/dsh-plugin/security/advisories/new) to send reproduction steps, affected files or URLs, impact, and any suggested mitigation. For ordinary bugs or incorrect public plugin metadata, use the public [issue tracker](https://github.com/majiayu000/dsh-plugin/issues).

## Scope

Security reports may cover:

- Unsafe rendering or script injection in registry data.
- Registry entries that bypass manifest, blocklist, or trust-level rules.
- Workflow or dependency behavior that exposes secrets.
- A listed repository distributing malicious code under misleading metadata.

Manifest verification proves only that a repository declares a supported `dsh.bundle` shape. It is not a source-code audit, sandbox, or safety guarantee.
