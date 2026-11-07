'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { lint, renderDigest, digestLocal, prCommands } = require('../cli.js');

const GOOD = `---
name: demo-tool
description: Run demo-tool to convert CSV files. Use when the user asks to convert or validate CSV data.
---

# demo-tool

\`\`\`bash
npx demo-tool convert in.csv
\`\`\`

Limits: only CSV; does not stream files over 1 GB.
`;

test('a complete skill passes', () => {
  const r = lint(GOOD);
  assert.deepStrictEqual(r.problems, []);
  assert.strictEqual(r.name, 'demo-tool');
});

test('missing frontmatter, placeholder, no code block and no when-clause all fail', () => {
  const r = lint('# just a title\nTODO: write this for OWNER_LOGIN');
  const text = r.problems.join(' | ');
  assert.match(text, /frontmatter/);
  assert.match(text, /placeholder/);
  assert.match(text, /code block/);
  assert.ok(r.problems.length >= 4);
});

test('description must say when to use the skill', () => {
  const r = lint(GOOD.replace(/description: .*/, 'description: A very nice tool that converts CSV files quickly.'));
  assert.ok(r.problems.some(p => p.includes('WHEN')));
});

test('uppercase or spaced names are rejected', () => {
  const r = lint(GOOD.replace('name: demo-tool', 'name: Demo Tool'));
  assert.ok(r.problems.some(p => p.includes('kebab-case')));
});

test('local digest reads a real directory and flags existing skills', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toskill-'));
  fs.writeFileSync(path.join(dir, 'README.md'), '# fixture\nUsage: npx fixture run');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture', bin: { fixture: './x.js' } }));
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.writeFileSync(path.join(dir, 'sub', 'SKILL.md'), '---\nname: x\n---');
  const d = digestLocal(dir);
  assert.strictEqual(d.existingSkills.length, 1);
  const md = renderDigest(d);
  assert.match(md, /fixture/);
  assert.match(md, /Improve it rather than duplicating/);
  assert.match(md, /nothing from the target was executed/i);
});

test('pr output includes disclosure, evidence slot and contributing warning', () => {
  const out = prCommands('acme/widget', 'SKILL.md');
  assert.match(out, /gh repo fork acme\/widget/);
  assert.match(out, /drafted with toskill/);
  assert.match(out, /evidence/);
  assert.match(out, /CONTRIBUTING\.md/);
});
