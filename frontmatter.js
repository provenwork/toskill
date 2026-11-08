'use strict';
// Bounded YAML subset: scalar fields and a scalar metadata map, not a full YAML parser.
function scalar(raw, line) {
  const value = raw.trim();
  if (!value || value.startsWith('#')) return null;
  if (value.startsWith('"')) {
    const match = value.match(/^("(?:[^"\\]|\\.)*")(?:\s+#.*)?$/);
    if (!match) throw new Error('line ' + line + ': malformed quoted scalar');
    try { return JSON.parse(match[1]); }
    catch { throw new Error('line ' + line + ': unsupported escape; use JSON escapes or a block scalar'); }
  }
  if (value.startsWith("'")) {
    const match = value.match(/^'((?:[^']|'')*)'(?:\s+#.*)?$/);
    if (!match) throw new Error('line ' + line + ': malformed single-quoted scalar');
    return match[1].replace(/''/g, "'");
  }
  const plain = value.replace(/\s+#.*$/, '').trim();
  if (/:\s|:$/.test(plain) || /^[\[\]{},&*!|>@%\x60]/.test(plain) || /^(?:null|~|true|false|[-+]?\d+(?:\.\d+)?)$/i.test(plain)) {
    throw new Error('line ' + line + ': expected a string scalar; quote this value or use | / >');
  }
  return plain;
}
function parseFrontmatter(text) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  if (lines[0] !== '---') return { fields: {}, body: normalized, errors: ['missing YAML frontmatter (--- name/description ---)'] };
  const end = lines.findIndex((s, i) => i > 0 && s === '---');
  if (end < 0) return { fields: {}, body: '', errors: ['frontmatter has no closing --- line'] };
  const fields = Object.create(null), errors = [];
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (line.includes('\t')) { errors.push('line ' + (i + 1) + ': tabs are unsupported in frontmatter'); continue; }
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):(?:[ ]+(.*)|[ ]*)$/);
    if (!match) { errors.push('line ' + (i + 1) + ': unsupported YAML; use scalar fields and optional metadata map'); continue; }
    const [, key, raw = ''] = match;
    if (Object.hasOwn(fields, key)) { errors.push('line ' + (i + 1) + ': duplicate field ' + key); continue; }
    fields[key] = null;
    try {
      const block = raw.match(/^([|>])([-+]?)(?:\s+#.*)?$/);
      if (block) {
        const chunk = [];
        while (i + 1 < end && (!lines[i + 1].trim() || /^ +/.test(lines[i + 1]))) chunk.push(lines[++i]);
        const nonempty = chunk.filter(s => s.trim());
        if (!nonempty.length) { fields[key] = ''; continue; }
        const indent = nonempty[0].match(/^ */)[0].length;
        if (!indent || nonempty.some(s => s.match(/^ */)[0].length < indent)) throw new Error('line ' + (i + 1) + ': inconsistent block indentation');
        const unindented = chunk.map(s => s.trim() ? s.slice(indent) : '');
        let value = unindented.join('\n');
        if (block[1] === '>') value = value.replace(/([^\n])\n(?=[^\n ])/g, '$1 ');
        value = value.replace(/\n*$/, '');
        fields[key] = value + (block[2] === '-' ? '' : '\n');
      } else if (key === 'metadata' && (!raw || raw.startsWith('#'))) {
        const metadata = Object.create(null);
        while (i + 1 < end && /^ +/.test(lines[i + 1])) {
          const sub = lines[++i].match(/^  ([A-Za-z][A-Za-z0-9_-]*): +(.+)$/);
          if (!sub || Object.hasOwn(metadata, sub[1])) throw new Error('line ' + (i + 1) + ': metadata supports unique two-space scalar entries only');
          metadata[sub[1]] = scalar(sub[2], i + 1);
          if (metadata[sub[1]] === null) throw new Error('line ' + (i + 1) + ': metadata values must be strings');
        }
        fields[key] = metadata;
      } else fields[key] = scalar(raw, i + 1);
    } catch (error) { errors.push(error.message); }
  }
  return { fields, body: lines.slice(end + 1).join('\n'), errors };
}
module.exports = { parseFrontmatter };

