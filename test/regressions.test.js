'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawnSync } = require('node:child_process');
const { lint, parseFrontmatter, digestLocal, digestRemote, renderDigest, prCommands, shellQuote, resolveTarget, LIMITS } = require('../cli.js');
const fence = String.fromCharCode(96).repeat(3);
const good = ['---','name: demo-tool','description: Use when converting a synthetic example.','---',fence+'bash','node demo.js',fence,'Limits: only synthetic examples.'].join('\n');
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'toskill-regression-'));
  t.after(() => fs.rmSync(dir,{recursive:true,force:true}));
  return dir;
}
test('literal and folded YAML descriptions are decoded before checks', () => {
  for (const indicator of ['>', '>-', '|', '|-']) {
    const text = good.replace('description: Use when converting a synthetic example.','description: '+indicator+'\n  Use when converting\n  a synthetic example.');
    const parsed = parseFrontmatter(text);
    assert.equal(parsed.errors.length,0);
    assert.match(parsed.fields.description,/Use when converting/);
    assert.ok(parsed.fields.description.length > 20);
    assert.deepEqual(lint(text,{strict:true}).problems,[]);
  }
});
test('quoted scalars, BOM/CRLF and metadata scalar map are supported', () => {
  const text = good.replace('name: demo-tool',"name: 'demo-tool' # note")
    .replace('description: Use when converting a synthetic example.','description: "Use when converting: a synthetic example."\nmetadata:\n  author: "A. Builder"\n  version: "1.0"');
  assert.deepEqual(lint('\uFEFF'+text.replace(/\n/g,'\r\n'),{strict:true}).problems,[]);
});
test('invalid, duplicate, null, comment-only and unsupported YAML fail structural checks', () => {
  const descriptions = ['Use when needed: unquoted colon.', '# use when xxxxxxxxxxxxxxxxxxx', 'null', '[Use when converting]', '&alias Use when converting'];
  for (const desc of descriptions) assert.ok(lint(good.replace(/description: .*/, 'description: '+desc)).specProblems.length,desc);
  assert.ok(lint(good.replace('name: demo-tool','name: demo-tool\nname: second')).specProblems.some(x=>/duplicate/.test(x)));
  assert.ok(lint(good.replace('description: Use when converting a synthetic example.','description: "unterminated')).specProblems.length);
});
test('structural checks enforce name boundaries, length and directory match', () => {
  for(const name of ['demo-','demo--tool','-demo','A','x'.repeat(65)]) assert.ok(lint(good.replace('name: demo-tool','name: '+name)).specProblems.length,name);
  assert.ok(lint(good,{directoryName:'other'}).specProblems.some(x=>/parent directory/.test(x)));
  assert.ok(lint(good.replace(/description: .*/,'description: '+ 'x'.repeat(1025))).specProblems.some(x=>/1024/.test(x)));
});
test('editorial policy is advisory by default and explicit in strict mode', () => {
  const prose='---\nname: prose\ndescription: Short\n---\nA prose skill is allowed.';
  assert.equal(lint(prose).problems.length,0);
  assert.ok(lint(prose).warn.some(x=>/20 chars/.test(x)));
  assert.ok(lint(prose,{strict:true}).problems.some(x=>/code block/.test(x)));
});
test('empty/prose fences and lowercase placeholders fail strict editorial checks', () => {
  for(const content of ['', 'This is ordinary prose.']) assert.ok(lint(good.replace('node demo.js',content),{strict:true}).problems.some(x=>/code block/.test(x)));
  assert.ok(lint(good+'\ntodo: replace <owner>',{strict:true}).problems.some(x=>/placeholder/.test(x)));
  assert.ok(lint(good.replace('Limits: only synthetic examples.','Unlimited power.'),{strict:true}).problems.some(x=>/limits/.test(x)));
});
test('deep skill is detected; a configured truncation is reported', t => {
  const root=fixture(t), deep=path.join(root,'a','b','c','d','e');
  fs.mkdirSync(deep,{recursive:true});fs.writeFileSync(path.join(deep,'SKILL.md'),good);
  assert.equal(digestLocal(root).existingSkills.length,1);
  const short=digestLocal(root,{limits:{...LIMITS,maxDepth:2}});
  assert.equal(short.coverage.inventory_complete,false);
  assert.equal(short.tree_truncated,true);
  assert.match(renderDigest(short),/INCOMPLETE/);
});
test('local docs content, file caps and rendered clipping are explicit', t => {
  const root=fixture(t);fs.mkdirSync(path.join(root,'docs'));
  fs.writeFileSync(path.join(root,'docs','usage.md'),'node useful-example.js\n'+'x'.repeat(50));
  fs.writeFileSync(path.join(root,'README.md'),'r'.repeat(100));
  const d=digestLocal(root,{limits:{...LIMITS,maxFileBytes:80,docChars:10,readmeChars:20}});
  assert.ok(d.documents['docs/usage.md'].includes('useful-example'));
  const rendered=renderDigest(d);
  assert.match(rendered,/content clipped at 80 bytes/);
  assert.match(rendered,/rendered excerpt clipped at 10 characters/);
  assert.match(rendered,/rendered excerpt clipped at 20 characters/);
  const capped=digestLocal(root,{limits:{...LIMITS,maxFiles:1}});
  assert.equal(capped.coverage.inventory_complete,false);
});
test('existing local owner/repo-shaped path wins; github: selects remote', t => {
  const root=fixture(t), target=path.join(root,'owner','repo');fs.mkdirSync(target,{recursive:true});
  assert.equal(resolveTarget(target).local,path.resolve(target));
  assert.equal(resolveTarget('github:owner/repo').remote,'owner/repo');
});
test('remote tree/content failures are reported; every content request pins the commit', async () => {
  const seen=[], sha='a'.repeat(40);
  const request=async url=>{
    seen.push(url);
    if(url.endsWith('/repos/acme/widget'))return {name:'widget',default_branch:'main'};
    if(url.includes('/commits/'))return {sha};
    if(url.includes('/git/trees/'))return {truncated:true,tree:[{type:'blob',path:'README.md'},{type:'blob',path:'docs/usage.md'}]};
    if(url.includes('/contents/README'))throw new Error('HTTP 403');
    return {encoding:'base64',content:Buffer.from('node useful.js').toString('base64')};
  };
  const d=await digestRemote('acme/widget',{request});
  assert.equal(d.coverage.inventory_complete,false);
  assert.equal(d.coverage.content_complete,false);
  assert.match(renderDigest(d),/HTTP 403/);
  assert.ok(seen.filter(x=>x.includes('/contents/')).every(x=>x.endsWith('?ref='+sha)));
  assert.match(d.documents['docs/usage.md'],/useful/);
  const missing=await digestRemote('acme/widget',{request:async url=>{if(url.includes('/git/trees/'))throw Error('offline');return request(url);}});
  assert.match(renderDigest(missing),/tree request failed: offline/);
});
test('CLI refuses overwriting a digest unless force was requested', t => {
  const root=fixture(t);fs.writeFileSync(path.join(root,'README.md'),'# fixture');
  const cli=path.resolve(__dirname,'..','cli.js');
  const run=args=>spawnSync(process.execPath,[cli,...args],{cwd:root,encoding:'utf8'});
  assert.equal(run(['digest',root]).status,0);
  fs.writeFileSync(path.join(root,'toskill-digest.md'),'sentinel');
  assert.equal(run(['digest',root]).status,1);
  assert.equal(fs.readFileSync(path.join(root,'toskill-digest.md'),'utf8'),'sentinel');
  assert.equal(run(['digest',root,'--force']).status,0);
});
test('PR source resolves before cd, destinations differ and shell metacharacters stay quoted', t => {
  const root=fixture(t), source="my skill's $(echo injected);.md";
  for(const shell of ['sh','powershell']){
    const out=prCommands('acme/widget',source,{cwd:root,shell});
    assert.ok(out.includes(shellQuote(path.resolve(root,source),shell)));
    assert.ok(out.includes(shellQuote(path.resolve(root,'widget','SKILL.md'),shell)));
    assert.doesNotMatch(out,/cp SKILL\.md SKILL\.md|I used it with an agent/);
    assert.match(out,/Evidence: not supplied/);
    assert.ok(!out.split('\n').some(x=>/^(?:git push|gh pr create)/.test(x)));
  }
  assert.throws(()=>prCommands('acme/widget','widget/SKILL.md',{cwd:root}),/inside the new clone/);
  assert.throws(()=>prCommands('acme/widget','line\nbreak',{cwd:root}),/newlines/);
  assert.throws(()=>prCommands('acme/widget;echo injected','SKILL.md',{cwd:root}),/owner\/repo/);
});
test('default source is the original working directory and output prints only', t => {
  const root=fixture(t), out=prCommands('acme/widget',undefined,{cwd:root,shell:'sh'});
  assert.ok(out.includes(shellQuote(path.join(root,'SKILL.md'),'sh')));
  assert.equal(fs.existsSync(path.join(root,'widget')),false);
});

