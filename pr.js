'use strict';
const path = require('path');
const { isSlug } = require('./digest.js');
function shellQuote(value, shell) {
  if (/[\0\r\n]/.test(value)) throw new Error('paths and arguments must not contain NUL or newlines');
  return shell === 'powershell' ? "'" + value.replace(/'/g, "''") + "'" : "'" + value.replace(/'/g, "'\"'\"'") + "'";
}
function prCommands(slug, skillPath = 'SKILL.md', { cwd = process.cwd(), shell = process.platform === 'win32' ? 'powershell' : 'sh' } = {}) {
  if (!isSlug(slug)) throw new Error('expected owner/repo');
  if (!['sh', 'powershell'].includes(shell)) throw new Error('shell must be sh or powershell');
  const source = path.resolve(cwd, skillPath), name = slug.split('/')[1], clone = path.resolve(cwd, name), destination = path.join(clone, 'SKILL.md');
  if (source === destination) throw new Error('skill source would be inside the new clone; choose a file outside it');
  const q = value => shellQuote(value, shell);
  const body = 'This PR proposes a SKILL.md for ' + name + '.\n\nMethod: drafted with toskill from a static digest, reviewed by a human.\nEvidence: not supplied by this command. Replace this sentence with actual task results before opening the PR.';
  const intro = '# toskill pr — ' + shell + ' commands for review; nothing is executed.\n# Read CONTRIBUTING.md before pushing. Run the skill on real tasks and replace the evidence text.\n# Source is resolved before changing directories. Clone directory must not exist.\n';
  if (shell === 'powershell') return intro
    + '$ErrorActionPreference = \'Stop\'\n'
    + 'if (-not (Test-Path -LiteralPath ' + q(source) + ' -PathType Leaf)) { throw \'Skill source missing\' }\n'
    + 'if (Test-Path -LiteralPath ' + q(clone) + ') { throw \'Clone directory already exists\' }\n'
    + 'gh repo fork ' + q(slug) + ' --clone --default-branch-only -- ' + q(clone) + '\nif ($LASTEXITCODE) { throw \'Fork/clone failed\' }\n'
    + 'Set-Location -LiteralPath ' + q(clone) + '\ngit switch -c add-agent-skill\nif ($LASTEXITCODE) { throw \'Branch creation failed\' }\n'
    + 'Copy-Item -LiteralPath ' + q(source) + ' -Destination ' + q(destination) + ' -ErrorAction Stop\n'
    + 'git add -- SKILL.md\nif ($LASTEXITCODE) { throw \'Add failed\' }\ngit commit -m \'Add agent skill (SKILL.md)\'\nif ($LASTEXITCODE) { throw \'Commit failed\' }\n'
    + '# Review the diff and save real task evidence in a PR body file before running git push or gh pr create.\n'
    + '# Suggested disclosure:\n' + body.split('\n').map(line => '# ' + line).join('\n');
  return intro + 'set -eu\ntest -f ' + q(source) + '\ntest ! -e ' + q(clone) + '\n'
    + 'gh repo fork ' + q(slug) + ' --clone --default-branch-only -- ' + q(clone) + '\ncd ' + q(clone) + '\n'
    + 'git switch -c add-agent-skill\ncp ' + q(source) + ' ' + q(destination) + '\ngit add -- SKILL.md\ngit commit -m \'Add agent skill (SKILL.md)\'\n'
    + '# Review the diff and save real task evidence in a PR body file before running git push or gh pr create.\n'
    + '# Suggested disclosure:\n' + body.split('\n').map(line => '# ' + line).join('\n');
}
module.exports = { prCommands, shellQuote };

