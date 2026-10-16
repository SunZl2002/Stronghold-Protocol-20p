// Throwaway: resolve a conflict where each side only ADDED settings, by keeping the union.
//
// Generic on purpose: it reads both sides' `DEFAULT_SETTINGS = Object.freeze({...})` literals, merges the keys (theirs
// first so a shared key keeps upstream's value, ours overriding only where it differs and we added it), and rebuilds
// the comment block by appending the side that contributes the missing paragraphs.
import fs from 'node:fs';

const cwd = process.argv[2];
const rel = process.argv[3];
const file = `${cwd}/${rel}`;
let text = fs.readFileSync(file, 'utf8');

const hunks = [];
const re = /^<{7} [^\n]*\n([\s\S]*?)^={7}[^\n]*\n([\s\S]*?)^>{7} [^\n]*$/gm;
let m;
while ((m = re.exec(text))) hunks.push({ ours: m[1], theirs: m[2], whole: m[0] });

if (hunks.length !== 2) throw new Error(`expected 2 hunks, got ${hunks.length}`);

// ---- hunk 1: DEFAULT_SETTINGS object literals
const objKeys = (s) => {
  const h = /DEFAULT_SETTINGS = Object\.freeze\(\{([\s\S]*?)\}\)/.exec(s);
  if (!h) return null;
  const out = new Map();
  for (const part of h[1].split(/,(?![^(]*\))/)) {
    const t = part.trim();
    if (!t) continue;
    const i = t.indexOf(':');
    if (i < 0) continue;
    out.set(t.slice(0, i).trim(), t.slice(i + 1).trim());
  }
  return out;
};
const a = objKeys(hunks[0].ours);
const b = objKeys(hunks[0].theirs);
if (!a || !b) throw new Error('could not parse DEFAULT_SETTINGS on a side');

// union with OURS' key order, then anything only upstream has, before `keys` (which stays last)
const merged = new Map();
for (const [k, v] of a) if (k !== 'keys') merged.set(k, v);
for (const [k, v] of b) if (k !== 'keys' && !merged.has(k)) merged.set(k, v);
// for keys both sides have, prefer upstream's value unless ours is the only one that is not the old default
for (const [k, v] of b) if (merged.has(k) && k !== 'keys' && a.get(k) !== v) merged.set(k, v);
const keysVal = a.get('keys') || b.get('keys');
const line = `export const DEFAULT_SETTINGS = Object.freeze({ ${[...merged].map(([k, v]) => `${k}: ${v}`).join(', ')}, keys: ${keysVal} });`;

// the doc comment: OURS' paragraphs, then THEIRS' lines that are not already covered
const docLines = (s) => s.split('\n').filter((l) => /^\s*\*/.test(l)).join('\n');
const mergedDoc = `${docLines(hunks[0].ours).trimEnd()}\n${docLines(hunks[0].theirs).trim()}\n */`;
text = text.replace(hunks[0].whole, `${mergedDoc}\n${line}`);

// ---- hunk 2: the @returns type — union the key names, upstream's value wins
const typeKeys = (s) => {
  const h = /@returns \{\{([\s\S]*?)\}\}/.exec(s);
  if (!h) return null;
  const out = new Map();
  for (const part of h[1].replace(/\n/g, ' ').split(',')) {
    const t = part.trim();
    if (!t) continue;
    const i = t.indexOf(':');
    const k = (i < 0 ? t : t.slice(0, i)).trim();
    if (k) out.set(k, i < 0 ? '' : t.slice(i + 1).trim());
  }
  return out;
};
const ta = typeKeys(hunks[1].ours);
const tb = typeKeys(hunks[1].theirs);
const tMerged = new Map(ta);
for (const [k, v] of tb) if (!tMerged.has(k) || !tMerged.get(k)) tMerged.set(k, v);
// prefer upstream's richer value where both describe the same key
for (const [k, v] of tb) if (ta.get(k) && ta.get(k) !== v) tMerged.set(k, v);
const tLine = ` * @returns {{ ${[...tMerged].map(([k, v]) => (v ? `${k}: ${v}` : k)).join(', ')} }}`;
text = text.replace(hunks[1].whole, tLine);

fs.writeFileSync(file, text, 'utf8');
const left = (text.match(/^<{7}|^>{7}/gm) || []).length;
console.log(`  ${rel}: 残留标记 ${left}`);
for (const l of text.split('\n')) if (/DEFAULT_SETTINGS = |@returns \{\{/.test(l)) console.log('    ' + l.trim().slice(0, 210));
