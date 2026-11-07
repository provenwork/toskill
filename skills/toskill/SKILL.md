---
name: toskill
description: Turn a repository into an agent skill and contribute it upstream. Use when the user asks to create a SKILL.md for a tool or repo, to "skillify" a project, to make a tool usable by coding agents, or to add agent support to a library.
---

# toskill

Workflow — the CLI gathers and checks, you (the agent) write and test:

```bash
npx toskill digest <owner/repo | path>   # writes toskill-digest.md: facts, manifests, README
```

1. Read `toskill-digest.md`. If it warns that a SKILL.md already exists, improve that file instead of writing a new one.
2. Write `SKILL.md` **only from facts in the digest**: a kebab-case `name`; a `description` that says WHEN to use the tool; copy-pasteable commands that appear in the README or manifests; the tool's stated limits. Invent nothing.
3. `npx toskill lint SKILL.md` — fix every FAIL; take the warnings seriously.
4. Prove it: use the tool through the new skill on 2–3 real tasks and keep 2–3 lines of transcript as evidence. A skill nobody tested is spam.
5. `npx toskill pr <owner/repo>` prints the exact `gh` commands and a PR body that discloses the method and carries your evidence. Read the project's CONTRIBUTING.md first; if they want an issue first, open an issue.

Limits: static analysis only — toskill never executes the target repository's code; the digest only covers what the API returns (very large trees are truncated); the lint checks format, not usefulness — only step 4 does.
