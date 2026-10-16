// Throwaway: resolve public/js/ui/gameLogic/settings.js, where each side only ADDED settings.
//
// Markers (1-based): 28/42/53 (hunk 1) and 61/64/67 (hunk 2).
//   hunk 1: our doc lines 29-40 and our DEFAULT_SETTINGS (41) | their doc lines 43-51 and their DEFAULT_SETTINGS (52)
//   hunk 2: our 2-line @returns (62-63)                    | their 2-line @returns (65-66)
import fs from 'node:fs';

const file = `${process.argv[2]}/public/js/ui/gameLogic/settings.js`;
const L = fs.readFileSync(file, 'utf8').split('\n');
const at = (n) => L[n - 1];
const must = (n, tag) => { if (!at(n).startsWith(tag)) throw new Error(`line ${n}: ${JSON.stringify(at(n).slice(0, 24))}`); };

must(28, '<<<<<<<'); must(42, '======='); must(53, '>>>>>>>');
must(61, '<<<<<<<'); must(64, '======='); must(67, '>>>>>>>');

/** Merge two single-line `Object.freeze({ k: v, … })` literals: theirs' values win, ours contributes what is missing. */
function mergeDefaults(ourLine, theirLine) {
  const grab = (line) => {
    const start = line.indexOf('({') + 2;
    const end = line.lastIndexOf('})');
    const inner = line.slice(start, end);
    const map = new Map();
    let depth = 0;
    let cur = '';
    const push = () => {
      const x = cur.trim();
      cur = '';
      if (!x) return;
      const i = x.indexOf(':');
      if (i > 0) map.set(x.slice(0, i).trim(), x.slice(i + 1).trim());
    };
    for (const ch of inner) {
      if (ch === '(' || ch === '{') depth++;
      else if (ch === ')' || ch === '}') depth--;
      if (ch === ',' && depth === 0) { push(); continue; }
      cur += ch;
    }
    push();
    return map;
  };
  const a = grab(ourLine);
  const b = grab(theirLine);
  if (!a.size || !b.size) throw new Error(`could not parse a DEFAULT_SETTINGS literal (${a.size}/${b.size})`);
  const out = new Map(b);                       // upstream's keys and order first
  out.delete('keys');
  for (const [k, v] of a) if (k !== 'keys' && !out.has(k)) out.set(k, v);   // then ours
  const keys = b.get('keys') || a.get('keys');
  return `export const DEFAULT_SETTINGS = Object.freeze({ ${[...out].map(([k, v]) => `${k}: ${v}`).join(', ')}, keys: ${keys} });`;
}

/** Add this fork's keys to the upstream @returns type, keeping its two-line shape. */
function mergeType(theirType, extra) {
  const add = extra.filter((k) => !theirType.includes(`${k}:`));
  if (!add.length) return theirType;
  // insert right before the `textSize:` entry, which is on the second line
  return theirType.replace(/,\n( \*   textSize:)/, `, ${add.join(', ')},\n$1`);
}

const mergedLine = mergeDefaults(at(41), at(52));
const theirType = `${at(65)}\n${at(66)}`;
const mergedType = mergeType(theirType, ['skinsOn: boolean', 'skinsAutoEquip: boolean', 'chatDanmaku: boolean']);

const rebuilt = [
  ...L.slice(0, 27),        // 1..27
  ...L.slice(28, 40),       // 29..40  our doc lines
  ...L.slice(42, 51),       // 43..51  their doc lines (voiceNative / combatMetrics / mysticEnergy / officialFx)
  mergedLine,               // replaces both DEFAULT_SETTINGS
  ...L.slice(53, 60),       // 54..60
  mergedType,               // replaces both @returns
  ...L.slice(67),           // 68..end
];
fs.writeFileSync(file, rebuilt.join('\n'), 'utf8');

const left = (rebuilt.join('\n').match(/^<{7}|^>{7}/gm) || []).length;
console.log(`  残留标记 ${left}`);
for (const l of rebuilt) if (/DEFAULT_SETTINGS = |@returns \{\{/.test(l)) console.log('    ' + l.trim().slice(0, 200));
