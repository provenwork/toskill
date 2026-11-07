# toskill

**Turn any repository into an agent skill.** README files were written for humans; agents need a `SKILL.md`, and most of the tools in the world don't have one. toskill digests a repo, helps your agent write the skill, lints it against objective rules, and prepares the upstream pull request.

```bash
npx toskill digest vercel/next.js     # or any owner/repo, or a local path
# your agent writes SKILL.md from the digest
npx toskill lint SKILL.md
npx toskill pr vercel/next.js         # prints the exact gh commands + a disclosure PR body
```

No dependencies, Node 18+. **Static analysis only: toskill never executes the target repository's code.**

## Sixty seconds

```text
$ npx toskill digest expressjs/express
digest written: toskill-digest.md (142 files scanned)

$ npx toskill lint SKILL.md
FAIL: description never says WHEN to use the skill ("Use when …")
FAIL: body has no fenced code block: give at least one copy-pasteable command

$ npx toskill lint SKILL.md   # after the fix
OK: "express" passes the format lint
```

## Measured

Linted against the official [anthropics/skills](https://github.com/anthropics/skills) repository (all 20 `SKILL.md` files, shallow clone of 2026-11-07): **9 of 20 pass as-is, 11 of 20 fail at least one check.** Most common failures: no copy-pasteable command (8 of 11), a description that never says when to use the skill (5 of 11), a description too short to route on (3 of 11). The official template fails too. The rules are deliberately stricter than the template: they check what an agent needs to route and act, not just the file shape. Reproduce it:

```bash
npx degit anthropics/skills anthropic-skills
for f in anthropic-skills/skills/*/SKILL.md anthropic-skills/template/SKILL.md; do npx toskill lint "$f"; done
```

## The workflow it enforces

| Step | Who | What |
|---|---|---|
| `digest` | CLI | facts, manifests, docs, README — and a warning if a SKILL.md already exists |
| write | your agent | a skill built **only** from facts in the digest, limits included |
| `lint` | CLI | frontmatter, kebab-case name, a "use when" description, real commands, no placeholders |
| test | you + agent | use the tool through the skill on 2–3 real tasks; keep the evidence |
| `pr` | CLI | exact `gh` commands and a PR body that discloses the method and carries your evidence |

In Claude Code, install it as a plugin and just ask: *"make a skill for owner/repo"*:

```bash
/plugin marketplace add provenwork/skills
/plugin install toskill@provenwork
```

## What it does not do

- It does not write the skill for you. The digest feeds your agent; quality comes from testing, not generation.
- It does not open the PR itself. It prints the commands; a human reviews, runs them, and answers the maintainer.
- It cannot judge usefulness. The lint checks format; only using the tool proves the skill works.
- Respect maintainers: one tested PR is a contribution, twenty untested ones are spam. The PR body always discloses how the skill was made.

## Why

Agents only use the tools they understand. The ecosystems that exploded in the last year (Claude Code, Codex, Cursor) run on `SKILL.md` files, and most repositories don't have one. Every missing skill is a tool that agents silently ignore — including yours.

MIT.
