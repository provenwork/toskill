#!/usr/bin/env node
/* toskill — turn any repository into an agent skill.
 *
 * The CLI does the plumbing; the agent does the thinking:
 *   toskill digest <owner/repo|path>   gather the material an agent needs to write a SKILL.md
 *   toskill lint <SKILL.md>            check the skill against objective format rules
 *   toskill pr <owner/repo>            print the exact gh commands to contribute it upstream
 *
 * Static analysis only: toskill never executes code from the target repository.
 * Node 18+, no dependencies. MIT.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const UA = 'toskill/0.1 (+https://github.com/provenwork/toskill)';
const API = 'https://api.github.com';

function fail(msg) { console.error('toskill: ' + msg); process.exit(1); }

function gh(url) {
  return new Promise((resolve, reject) => {
    const headers = { 'User-Agent': UA, Accept: 'application/vnd.github+json' };
    if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
    https.get(url, { headers }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode === 403 && res.headers['x-ratelimit-remaining'] === '0')
          return reject(new Error('GitHub rate limit reached. Set GITHUB_TOKEN (any public read token) and retry.'));
        if (res.statusCode >= 400) return reject(new Error('GitHub ' + res.statusCode + ' for ' + url));
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

const b64 = s => Buffer.from(s || '', 'base64').toString('utf8');
const isSlug = s => /^[A-Za-z0-9][A-Za-z0-9_-]*\/[A-Za-z0-9_.-]+$/.test(s || '');

// ---------------------------------------------------------------- digest ----
const DOC_HINTS = ['readme.md', 'usage.md', 'cli.md', 'quickstart.md', 'getting-started.md', 'api.md'];
const MANIFESTS = ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'setup.py', 'Makefile', 'action.yml'];

async function digestRemote(slug) {
  const meta = await gh(`${API}/repos/${slug}`);
  const readme = await gh(`${API}/repos/${slug}/readme`).catch(() => null);
  const tree = await gh(`${API}/repos/${slug}/git/trees/${meta.default_branch}?recursive=1`).catch(() => null);
  const paths = (tree && tree.tree ? tree.tree : []).filter(t => t.type === 'blob').map(t => t.path);
  const pick = async p => {
    const f = await gh(`${API}/repos/${slug}/contents/${encodeURIComponent(p)}`).catch(() => null);
    return f && f.content ? b64(f.content) : null;
  };
  const manifests = {};
  for (const m of MANIFESTS) if (paths.includes(m)) manifests[m] = await pick(m);
  return {
    source: `https://github.com/${slug}`, name: meta.name, slug,
    description: meta.description || '', language: meta.language, license: (meta.license || {}).spdx_id || null,
    stars: meta.stargazers_count, topics: meta.topics || [], homepage: meta.homepage || '',
    default_branch: meta.default_branch, pushed_at: meta.pushed_at,
    readme: readme ? b64(readme.content) : '', manifests,
    docs: paths.filter(p => DOC_HINTS.includes(p.toLowerCase()) || p.toLowerCase().startsWith('docs/')).slice(0, 30),
    examples: paths.filter(p => /^examples?\//i.test(p)).slice(0, 30),
    existingSkills: paths.filter(p => /(^|\/)SKILL\.md$/i.test(p)),
    tree_truncated: !!(tree && tree.truncated), file_count: paths.length,
  };
}

function digestLocal(dir) {
  const rd = p => { try { return fs.readFileSync(path.join(dir, p), 'utf8'); } catch { return null; } };
  const walk = (d, base, out, depth) => {
    if (depth > 4 || out.length > 4000) return out;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.git') || e.name === 'node_modules' || e.name === '__pycache__') continue;
      const rel = base ? base + '/' + e.name : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), rel, out, depth + 1);
      else out.push(rel);
    }
    return out;
  };
  const paths = walk(dir, '', [], 0);
  const manifests = {};
  for (const m of MANIFESTS) { const c = rd(m); if (c !== null) manifests[m] = c; }
  const readmeName = paths.find(p => p.toLowerCase() === 'readme.md');
  return {
    source: path.resolve(dir), name: path.basename(path.resolve(dir)), slug: null,
    description: '', language: null, license: null, stars: null, topics: [], homepage: '',
    readme: readmeName ? rd(readmeName) : '', manifests,
    docs: paths.filter(p => DOC_HINTS.includes(p.toLowerCase()) || p.toLowerCase().startsWith('docs/')).slice(0, 30),
    examples: paths.filter(p => /^examples?\//i.test(p)).slice(0, 30),
    existingSkills: paths.filter(p => /(^|\/)SKILL\.md$/i.test(p)),
    tree_truncated: false, file_count: paths.length,
  };
}

function binsOf(d) {
  const pkg = d.manifests['package.json'];
  if (pkg) { try { const j = JSON.parse(pkg); if (j.bin) return typeof j.bin === 'string' ? [j.name] : Object.keys(j.bin); } catch {} }
  const py = d.manifests['pyproject.toml'];
  if (py) { const m = py.match(/\[project\.scripts\]([\s\S]*?)(\n\[|$)/); if (m) return m[1].split('\n').map(l => l.split('=')[0].trim()).filter(Boolean); }
  return [];
}

function renderDigest(d) {
  const clip = (s, n) => (s || '').length > n ? s.slice(0, n) + `\n…[clipped at ${n} chars]` : (s || '');
  return `# toskill digest — ${d.slug || d.name}

Collected ${new Date().toISOString()} from ${d.source}. Static analysis only: nothing from the target was executed.
${d.existingSkills.length ? `\n> WARNING: this project already ships ${d.existingSkills.length} SKILL.md (${d.existingSkills.join(', ')}). Improve it rather than duplicating it.\n` : ''}
## Facts
- description: ${d.description || '(none)'}
- language: ${d.language || '?'} · license: ${d.license || '?'} · stars: ${d.stars ?? '?'} · files: ${d.file_count}${d.tree_truncated ? ' (tree truncated)' : ''}
- topics: ${d.topics.join(', ') || '(none)'} · homepage: ${d.homepage || '(none)'}
- executables (from manifests): ${binsOf(d).join(', ') || '(none found)'}
- docs: ${d.docs.join(', ') || '(none)'}
- examples: ${d.examples.join(', ') || '(none)'}

## Manifests
${Object.entries(d.manifests).map(([k, v]) => `### ${k}\n\`\`\`\n${clip(v, 3000)}\n\`\`\``).join('\n') || '(none)'}

## README
${clip(d.readme, 20000) || '(none)'}

## Agent instructions
Write the SKILL.md from the facts above — only commands that appear in the README, docs or manifests. Then run \`toskill lint\` on it, use the tool for real on 2–3 tasks, and only then \`toskill pr\`. Rules: the description must say WHEN to use the tool; every command must be copy-pasteable; include the tool's stated limits; invent nothing.
`;
}

// ------------------------------------------------------------------ lint ----
const PLACEHOLDER = /\b(TODO|FIXME|XXX|OWNER_LOGIN)\b|<[A-Z_]{3,}>/;

function lint(text) {
  text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');  // tolerate BOM and Windows line endings
  const problems = [];
  const warn = [];
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) problems.push('missing YAML frontmatter (--- name/description ---)');
  const field = k => { const m = (fm ? fm[1] : '').match(new RegExp('^' + k + ':\\s*(.+)$', 'm')); return m ? m[1].trim() : null; };
  const name = field('name');
  const desc = field('description');
  if (!name) problems.push('frontmatter: "name" missing');
  else if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) problems.push(`frontmatter: name "${name}" must be kebab-case [a-z0-9-]`);
  if (!desc) problems.push('frontmatter: "description" missing');
  else {
    if (desc.length < 20) problems.push('description under 20 chars: an agent cannot route on it');
    if (desc.length > 1024) problems.push(`description over 1024 chars (${desc.length})`);
    if (!/\buse (when|for|this|it)\b/i.test(desc) && !/\bwhen\b/i.test(desc))
      problems.push('description never says WHEN to use the skill ("Use when …")');
  }
  const body = text.replace(/^---\n[\s\S]*?\n---/, '');
  if (!/```[\s\S]*?```/.test(body)) problems.push('body has no fenced code block: give at least one copy-pasteable command');
  const ph = text.match(PLACEHOLDER);
  if (ph) problems.push(`placeholder left in the file: "${ph[0]}"`);
  if (Buffer.byteLength(text, 'utf8') > 16384) warn.push(`file is ${Buffer.byteLength(text, 'utf8')} bytes; skills load into context — keep it lean`);
  if (!/limit|does not|cannot|won't|only/i.test(body)) warn.push('no stated limits found; skills that admit limits get merged more');
  return { problems, warn, name };
}

// -------------------------------------------------------------------- pr ----
function prCommands(slug, skillPath) {
  const name = slug.split('/')[1];
  return `# toskill pr — exact commands (review each one; run them yourself, gh CLI required)
gh repo fork ${slug} --clone --default-branch-only
cd ${name}
git switch -c add-agent-skill
cp ${skillPath || 'SKILL.md'} SKILL.md
git add SKILL.md
git commit -m "Add agent skill (SKILL.md)"
git push -u origin add-agent-skill
gh pr create --title "Add agent skill (SKILL.md) so coding agents can use ${name}" --body-file - <<'EOF'
This PR adds a SKILL.md so agents (Claude Code, Codex, Cursor, …) know when and how to use ${name}.

**Tested**: I used it with an agent on real tasks before opening this PR — evidence below.
<paste 2-3 lines of real transcript evidence here; the PR is not ready without them>

**Method**: drafted with toskill (static digest of your README/docs, no code executed), then reviewed
and tested by a human. Happy to adapt to your conventions, or to close this if you don't want it.
EOF

# Before pushing: read CONTRIBUTING.md; if the project asks for issues-first, open an issue instead.`;
}

// ------------------------------------------------------------------ main ----
async function main() {
  const [cmd, target, extra] = process.argv.slice(2);
  if (cmd === 'digest') {
    if (!target) fail('usage: toskill digest <owner/repo | local-path>');
    const d = isSlug(target) ? await digestRemote(target)
      : fs.existsSync(target) ? digestLocal(target)
      : fail(`"${target}" is neither owner/repo nor an existing path`);
    const out = 'toskill-digest.md';
    fs.writeFileSync(out, renderDigest(d));
    console.log(`digest written: ${out} (${d.file_count} files scanned${d.existingSkills.length ? '; existing SKILL.md found — improve, do not duplicate' : ''})`);
  } else if (cmd === 'lint') {
    if (!target || !fs.existsSync(target)) fail('usage: toskill lint <SKILL.md>');
    const { problems, warn, name } = lint(fs.readFileSync(target, 'utf8'));
    warn.forEach(w => console.log('warn: ' + w));
    if (problems.length) { problems.forEach(p => console.error('FAIL: ' + p)); process.exit(1); }
    console.log(`OK: "${name}" passes the format lint (format only — test it on real tasks before any PR)`);
  } else if (cmd === 'pr') {
    if (!isSlug(target)) fail('usage: toskill pr <owner/repo> [SKILL.md]');
    console.log(prCommands(target, extra));
  } else {
    console.log(`toskill — turn any repository into an agent skill (static, local, no deps)

  toskill digest <owner/repo|path>   collect the material, write toskill-digest.md
  toskill lint <SKILL.md>            objective format checks (exit 1 on failure)
  toskill pr <owner/repo> [file]     print the exact gh commands for an upstream PR

Workflow (you + your agent): digest -> the agent writes SKILL.md -> lint -> USE IT on
2-3 real tasks -> pr. Evidence before contribution; a skill nobody tested is spam.`);
  }
}
if (require.main === module) main().catch(e => fail(e.message));
module.exports = { lint, renderDigest, digestLocal, prCommands };
