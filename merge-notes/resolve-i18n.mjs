// Throwaway: resolve a JSON i18n conflict as the UNION of both sides' keys.
//
// Both branches only ADD msgids, so the union is the correct answer. Our side wins on a duplicate only when the values
// differ, in which case the file is reported so it can be looked at instead of silently choosing.
import fs from 'node:fs';

const cwd = process.argv[2];
const files = process.argv.slice(3);
const START = /^<{7} [^\n]*$/;
const MID = /^={7}[^\n]*$/;
const END = /^>{7} [^\n]*$/;

for (const rel of files) {
  const file = `${cwd}/${rel}`;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const out = [];
  let i = 0;
  let resolved = 0;
  let lastEntry = -1;
  const clashes = [];
  while (i < lines.length) {
    if (!START.test(lines[i])) { out.push(lines[i++]); continue; }
    i++;
    const ours = [];
    while (i < lines.length && !MID.test(lines[i])) ours.push(lines[i++]);
    i++;                                            // skip =======
    const theirs = [];
    while (i < lines.length && !END.test(lines[i])) theirs.push(lines[i++]);
    i++;                                            // skip >>>>>>>

    // Each side is a run of "  "key": value",  lines (the last one may lack the comma).
    const entries = (ls) => {
      const map = new Map();
      for (const l of ls) {
        const m = /^\s*("(?:[^"\\]|\\.)*")\s*:\s*([\s\S]*?),?\s*$/.exec(l);
        if (m) map.set(m[1], m[2]);
      }
      return map;
    };
    const a = entries(ours);
    const b = entries(theirs);
    // union, ours first (stable order), then anything only upstream has
    const merged = new Map(a);
    for (const [k, v] of b) {
      if (!merged.has(k)) merged.set(k, v);
      else if (merged.get(k) !== v) clashes.push(k);
    }
    if (!a.size || !b.size) {
      // not the shape we expect (a JSON object body): keep BOTH blocks verbatim rather than guess
      out.push(...ours, ...theirs);
      resolved++;
      continue;
    }
    const indent = /^(\s*)/.exec(ours.find((l) => l.trim()) || '  ')[1] || '  ';
    for (const [k, v] of merged) out.push(`${indent}${k}: ${v},`);
    // every line of a JSON block keeps its comma; the LAST one of the whole object must not.
    lastEntry = out.length - 1;
    resolved++;
  }
  if (lastEntry >= 0) out[lastEntry] = out[lastEntry].replace(/,\s*$/, '');
  fs.writeFileSync(file, out.join('\n'), 'utf8');
  let ok = true;
  try { JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { ok = false; }
  console.log(`  ${rel}: 合并 ${resolved} 处   JSON ${ok ? '✅ 有效' : '❌ 无效'}${clashes.length ? `   值冲突: ${clashes.slice(0, 4).join(', ')}` : ''}`);
}
