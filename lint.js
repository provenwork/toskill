'use strict';
const { parseFrontmatter } = require('./frontmatter.js');
const PLACEHOLDER = /\b(?:TODO|FIXME|XXX|OWNER_LOGIN)\b|<(?:owner(?:\/repo)?|repo|path|[A-Z_]{3,})>/i;
function lint(text, { strict = false, directoryName } = {}) {
  const { fields, body, errors } = parseFrontmatter(text);
  const specProblems = errors.map(x => 'frontmatter: ' + x), editorial = [], warn = [];
  const name = fields.name, desc = fields.description;
  if (typeof name !== 'string' || !name.trim()) specProblems.push('frontmatter: "name" missing or not a string');
  else {
    if (name.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) specProblems.push('frontmatter: name must be kebab-case, 1–64 chars, no consecutive or trailing hyphens');
    if (directoryName && name !== directoryName) specProblems.push('frontmatter: name must match parent directory "' + directoryName + '"');
  }
  if (typeof desc !== 'string' || !desc.trim()) specProblems.push('frontmatter: "description" missing or not a non-empty string');
  else {
    if (Array.from(desc).length > 1024) specProblems.push('description over 1024 characters');
    if (desc.trim().length < 20) editorial.push('description under 20 chars (editorial hint, not a format requirement)');
    if (!/\b(?:use (?:when|for|this|it)|when|trigger)\b/i.test(desc)) editorial.push('description has no recognized WHEN / trigger phrase (English heuristic)');
  }
  if (fields.compatibility != null && (typeof fields.compatibility !== 'string' || fields.compatibility.length > 500)) specProblems.push('compatibility must be a string of at most 500 characters');
  const commandBlocks = [...body.matchAll(/^(\x60{3,}|~{3,})(bash|sh|shell|console|powershell|ps1|cmd)[^\n]*\n([\s\S]*?)^\1[ \t]*$/gm)];
  if (!commandBlocks.some(m => m[3].split('\n').some(line => /^(?:\$\s+)?(?:npx|npm|node|python(?:3)?|pip|uv|go|cargo|git|gh|curl|echo|printf|make|docker|pwsh|Get-\w+|Set-\w+|Copy-\w+|[./\\][^\s]+)\b/.test(line.trim())))) editorial.push('body has no recognized non-empty shell command code block (example heuristic, not command validation)');
  const ph = text.match(PLACEHOLDER);
  if (ph) editorial.push('placeholder left in the file: "' + ph[0] + '"');
  if (!/\b(?:limits?|does not|cannot|won't|only)\b/i.test(body)) editorial.push('no stated limits found (English heuristic)');
  if (Buffer.byteLength(text, 'utf8') > 16384) warn.push('file exceeds 16384 bytes; consider smaller referenced documents');
  if (!strict) warn.push(...editorial);
  return { problems: [...specProblems, ...(strict ? editorial : [])], specProblems, editorial, warn, name };
}
module.exports = { lint, parseFrontmatter };

