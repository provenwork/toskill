#!/usr/bin/env node
'use strict';
const fs = require('fs'), path = require('path');
const digest = require('./digest.js'), linting = require('./lint.js'), pr = require('./pr.js');
const VERSION = '0.1.3';
function options(args) {
  const result = { positional: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (['--strict', '--force'].includes(a)) result[a.slice(2)] = true;
    else if (['--output', '--shell'].includes(a)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(a + ' requires a value');
      result[a.slice(2)] = args[++i];
    } else if (a.startsWith('--')) throw new Error('unknown option ' + a);
    else result.positional.push(a);
  }
  return result;
}
async function main(argv = process.argv.slice(2)) {
  const [cmd, ...rest] = argv;
  if (cmd === 'version' || cmd === '--version') { console.log('toskill ' + VERSION); return 0; }
  const opt = options(rest), [target, extra] = opt.positional;
  if (cmd === 'digest') {
    if (!target || extra) throw new Error('usage: toskill digest <owner/repo | local-path> [--output file] [--force]');
    const resolved = digest.resolveTarget(target), d = resolved.local ? digest.digestLocal(resolved.local) : await digest.digestRemote(resolved.remote);
    const out = path.resolve(opt.output || 'toskill-digest.md');
    fs.writeFileSync(out, digest.renderDigest(d), { flag: opt.force ? 'w' : 'wx' });
    console.log('digest written: ' + out + ' (' + d.file_count + ' files enumerated; ' + (d.coverage.inventory_complete ? 'inventory within stated policy' : 'INCOMPLETE inventory') + ')'); return 0;
  }
  if (cmd === 'lint') {
    if (!target || extra) throw new Error('usage: toskill lint <SKILL.md> [--strict]');
    const r = linting.lint(fs.readFileSync(target, 'utf8'), { strict: !!opt.strict, directoryName: path.basename(target) === 'SKILL.md' ? path.basename(path.dirname(path.resolve(target))) : undefined });
    r.warn.forEach(w => console.log('warn: ' + w)); r.problems.forEach(p => console.error('FAIL: ' + p));
    if (r.problems.length) return 1;
    console.log('OK: "' + r.name + '" passes supported structural checks' + (opt.strict ? ' and editorial heuristics' : '') + '; YAML subset only, usefulness and commands unverified'); return 0;
  }
  if (cmd === 'pr') {
    if (!target || opt.positional.length > 2) throw new Error('usage: toskill pr <owner/repo> [SKILL.md] [--shell sh|powershell]');
    console.log(pr.prCommands(target, extra, { shell: opt.shell })); return 0;
  }
  if (cmd && !['help', '--help'].includes(cmd)) throw new Error('unknown command ' + cmd);
  console.log('toskill ' + VERSION + ' — static repo digest and bounded SKILL.md checks\n\n  toskill digest <owner/repo|path> [--output file] [--force]\n  toskill lint <SKILL.md> [--strict]\n  toskill pr <owner/repo> [file] [--shell sh|powershell]\n\nExisting local paths take priority. Prefix github:owner/repo to force GitHub.\nPR prints review commands only; no push or PR is performed.'); return 0;
}
if (require.main === module) main().then(code => { process.exitCode = code; }).catch(error => { console.error('toskill: ' + error.message); process.exitCode = 1; });
module.exports = { ...digest, ...linting, ...pr, main };

