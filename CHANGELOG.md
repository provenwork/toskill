# Changelog

## 0.1.2 — 2026-11-08 (local release candidate)

- Decode supported multiline YAML descriptions before checking content and length; reject duplicate, null, malformed and unsupported scalar syntax explicitly.
- Separate structural failures from advisory editorial heuristics; strict mode opts into the latter. Withdraw the 0.1.1 corpus quality interpretation.
- Resolve PR source paths before changing directories, quote PowerShell/POSIX arguments, refuse self-copy and stop preparation before push or PR creation. Do not predeclare testing evidence.
- Prefer existing local paths and offer github: to force remote mode. Pin remote content to a commit, include bounded document bodies and report traversal/content/API limits.
- Refuse digest output overwrites by default.
- Add an offline demo, regression tests, exact-archive installation checks, CI and an OIDC release workflow.

## 0.1.1 — 2026-11-07

- Accepted BOM and CRLF input in lint.

