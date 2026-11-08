# toskill

**Collect repository facts and review a SKILL.md before contributing it upstream.**

Node 18+, no runtime dependencies. The CLI reads selected files; it never runs target code. It does not generate a skill, judge its usefulness, push a branch or open a PR.

```bash
npx toskill digest github:expressjs/express
# Write and test your SKILL.md from verified facts.
npx toskill lint SKILL.md
npx toskill lint SKILL.md --strict
npx toskill pr expressjs/express SKILL.md
```

## Install and remove

Run with npx for a one-off invocation, or install a fixed version globally:

```bash
npm install --global toskill@0.1.2
toskill version
npm uninstall --global toskill
```

The version in this source tree is a local release candidate until the npm release succeeds. To use the checkout now, run `node cli.js` in place of `toskill`. No install or postinstall script runs in this package.

Claude Code plugin:

```text
/plugin marketplace add provenwork/skills
/plugin install toskill@provenwork
/plugin uninstall toskill@provenwork
```

Plugin and npm releases are separate channels; a local source change does not update an installed plugin.

## Offline demo from this checkout

The example is synthetic, includes its own command, and requires no network:

```bash
node cli.js digest ./examples/demo-tool --output demo-digest.md
node cli.js lint examples/demo-tool/SKILL.md --strict
node examples/demo-tool/demo.js hello
```

The last command prints `HELLO`. The digest includes the README, package manifest and document excerpt, and warns that this fixture already has a skill. Re-running a digest refuses to overwrite the output; add `--force` deliberately to replace it.

## Structural checks and editorial advice

The [Agent Skills specification](https://agentskills.io/specification) requires a name and description in YAML frontmatter. Structural checks enforce nonempty strings, a name of at most 64 characters without consecutive/leading/trailing hyphens, a description of at most 1024 characters, and the matching parent folder when the input filename is SKILL.md.

The dependency-free reader supports plain, single-quoted and JSON-compatible double-quoted scalar values, literal/folded block scalars (`|`, `|-`, `|+`, `>`, `>-`, `>+`), comments, and a two-space scalar metadata map. Duplicate fields, comment-only descriptions, malformed scalars and unsupported syntax fail explicitly. This is a bounded YAML subset, **not a full YAML parser or complete specification certification**. Advanced valid YAML may require another validator.

Default lint failures concern these supported structural checks. Warnings suggest a trigger phrase, nonempty shell example, limits and removal of obvious placeholders. `--strict` also makes those editorial warnings fail. The 20-character description hint, English trigger patterns and shell-command allowlist are local policy, not requirements of the specification. A prose-only skill can be valid. A recognized command can still be unsafe or incorrect; no command is executed or validated by lint.

The old 0.1.1 comparison against Anthropic's skills is withdrawn as a quality claim: its regex read block indicators as descriptions. Three “too short” diagnoses measured `>` or `|-`, rather than the actual text. No efficacy rate is claimed for 0.1.2.

## Digest coverage and safety

Existing local paths take priority: `digest owner/repo` reads that folder if it exists; `digest github:owner/repo` forces GitHub. A GitHub digest pins the tree and file reads to one commit SHA. Metadata such as stars is observed separately at collection time.

The local inventory excludes .git, node_modules and __pycache__, skips symlinks, and is bounded to depth 20 and 4000 files. Inventory truncation and failed API/file reads appear as warnings; absence of a listed skill is not established when inventory is incomplete. Remote trees can also be truncated by GitHub.

Only the README, supported root manifests and up to six selected Markdown/text documents are read. Each selected file is bounded to 65536 bytes; rendered excerpts are bounded to 20000 README characters, 8000 per manifest and 4000 per document. Other examples and documents are paths only. The digest prints exclusions and clipping. It is not a source-code audit. Source excerpts remain untrusted; the wrapper cannot prevent an agent from following hostile instructions.

Remote mode makes HTTPS read requests to GitHub. If GITHUB_TOKEN is present it is used only for those requests; a public read token suffices. The target's code and installation scripts never run.

## PR preparation

`pr` prints commands only, using PowerShell on Windows and POSIX sh elsewhere. Select explicitly with `--shell powershell` or `--shell sh`. Paths resolve from the original working directory, are quoted for the chosen shell, and the clone directory must not already exist. Use the same operating system when running the printed plan.

The plan checks the source, forks/clones, creates a branch and copies the skill. It stops before push/PR creation. Read CONTRIBUTING.md, inspect the diff, test on actual tasks, and write a disclosure with real evidence. The command supplies no evidence and makes no claim that tests happened.

## Alternatives and limits

- The [official template and skill-creator](https://github.com/anthropics/skills) suit an agent-led authoring/evaluation workflow. Toskill adds a small static digest and inspectable preparation commands; it does not replace evaluation.
- [Repomix](https://github.com/yamadashy/repomix) collects broader repository context. Toskill deliberately collects a bounded document subset.
- A manual README review plus a YAML parser may be enough for a single contribution. Toskill does not establish that its editorial rules improve routing or acceptance.

## Local verification and release

```bash
npm test
npm run verify:pack
```

The archive verifier packs once, checks an explicit file inventory and source hashes, installs that exact archive locally with scripts disabled and offline mode, then exercises its version, lint, digest and demo. It writes the tested tarball and SHA-256 manifest under .artifacts/.

CI runs source tests across supported Node/platform combinations and checks the tarball. The release workflow stages by default. Publication requires its explicit publish input and uses that tested tarball on a version-matching tag via npm OIDC. The maintainer must first configure the npm trusted publisher for provenwork/toskill, workflow `release.yml` and environment `release`, allowing direct publish. Protect that environment and release tags. No npm token is embedded.

The release runner uses Node 24 and npm 11.5.1 or later, independently of the user's Node 18 runtime floor. See [npm trusted publishing requirements](https://docs.npmjs.com/trusted-publishers/). This workflow is prepared locally; no release has been triggered by editing it.

MIT.

