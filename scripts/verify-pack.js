'use strict';
// Packs once and verifies that exact archive. No publishing and no registry reads.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { createHash } = require('node:crypto'), { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), pkg = require('../package.json');
const artifacts = path.join(root, '.artifacts');
const allowed = [
  'package.json', 'cli.js', 'frontmatter.js', 'digest.js', 'lint.js', 'pr.js',
  'README.md', 'SKILL.md', 'LICENSE', 'CHANGELOG.md',
  'examples/demo-tool/README.md', 'examples/demo-tool/SKILL.md',
  'examples/demo-tool/demo.js', 'examples/demo-tool/package.json', 'examples/demo-tool/docs/usage.md'
].sort();
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function run(exe, args, options = {}) {
  const result = spawnSync(exe, args, { cwd: root, encoding: 'utf8', ...options });
  if (result.error || result.status !== 0) throw new Error([exe + ' failed', result.error?.message, result.stdout, result.stderr].filter(Boolean).join('\n'));
  return result.stdout.trim();
}
function npm(args, cwd = root) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('run this verifier through npm run verify:pack');
  return run(process.execPath, [npmCli, ...args], { cwd });
}
function verifyArchive(archive) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'toskill-pack-'));
  try {
    const entries = run('tar', ['-tzf', archive]).split(/\r?\n/).filter(Boolean);
    if (entries.some(p => !p.startsWith('package/') || p.split('/').includes('..') || p.includes('\\'))) throw new Error('unexpected archive paths');
    const files = entries.filter(p => !p.endsWith('/')).map(p => p.slice(8)).sort();
    if (JSON.stringify(files) !== JSON.stringify(allowed)) throw new Error('archive inventory differs:\n' + JSON.stringify(files));
    // Tar must not contain symlinks/hardlinks/devices. npm pack should emit regular files only.
    const verbose = run('tar', ['-tvzf', archive]);
    if (verbose.split(/\r?\n/).filter(Boolean).some(line => !line.startsWith('-'))) throw new Error('archive contains a non-regular entry');
    run('tar', ['-xzf', archive, '-C', work]);
    for (const relative of files) if (hash(path.join(work, 'package', relative)) !== hash(path.join(root, relative))) throw new Error('archive content differs from checked source: ' + relative);
    const installed = path.join(work, 'installed');
    fs.mkdirSync(installed);
    npm(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock', '--prefix', installed, '--cache', path.join(work, 'npm-cache'), archive], work);
    const installRoot = path.join(installed, 'node_modules', 'toskill');
    const installedPkg = JSON.parse(fs.readFileSync(path.join(installRoot, 'package.json'), 'utf8'));
    if (installedPkg.version !== pkg.version || installedPkg.dependencies || installedPkg.scripts?.postinstall || installedPkg.scripts?.install || installedPkg.scripts?.preinstall) throw new Error('unexpected installed metadata/dependencies/lifecycle script');
    const cli = path.join(installRoot, installedPkg.bin.toskill);
    if (run(process.execPath, [cli, 'version'], { cwd: work }) !== 'toskill ' + pkg.version) throw new Error('version smoke test failed');
    const example = path.join(installRoot, 'examples', 'demo-tool');
    run(process.execPath, [cli, 'lint', path.join(example, 'SKILL.md'), '--strict'], { cwd: work });
    const digest = path.join(work, 'digest.md');
    run(process.execPath, [cli, 'digest', example, '--output', digest], { cwd: work });
    const rendered = fs.readFileSync(digest, 'utf8');
    if (!rendered.includes('already ships') || !rendered.includes('docs/usage.md') || !rendered.includes('no network or dependency')) throw new Error('installed digest lost fixture content');
    if (run(process.execPath, [path.join(example, 'demo.js'), 'hello'], { cwd: example }) !== 'HELLO') throw new Error('demo result mismatch');
    const pr = run(process.execPath, [cli, 'pr', 'acme/widget', path.join(example, 'SKILL.md')], { cwd: work });
    if (!pr.includes('Evidence: not supplied') || pr.includes('cp SKILL.md SKILL.md')) throw new Error('installed PR smoke failed');
    return { files: files.map(p => ({ path: p, sha256: hash(path.join(root, p)) })), installedSmoke: ['version', 'strict lint', 'digest docs/coverage', 'offline demo', 'PR print only'] };
  } finally {
    const resolved = path.resolve(work), tempRoot = path.resolve(os.tmpdir()) + path.sep;
    if (!resolved.startsWith(tempRoot) || !path.basename(resolved).startsWith('toskill-pack-')) throw new Error('refusing cleanup outside allocated temp directory');
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
function main() {
  const external = process.argv[2];
  fs.mkdirSync(artifacts, { recursive: true });
  let archive;
  if (external) archive = path.resolve(external);
  else {
    run(process.execPath, ['--test']);
    const packed = JSON.parse(npm(['pack', '--json', '--ignore-scripts', '--pack-destination', artifacts]));
    if (packed.length !== 1) throw new Error('expected exactly one packed archive');
    archive = path.join(artifacts, packed[0].filename);
  }
  const result = verifyArchive(archive);
  const manifest = { name: pkg.name, version: pkg.version, archive: path.basename(archive), sha256: hash(archive), verifiedAt: new Date().toISOString(), node: process.version, ...result };
  fs.writeFileSync(path.join(artifacts, 'package-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ archive, sha256: manifest.sha256, files: result.files.length, installedSmoke: result.installedSmoke }, null, 2));
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }

