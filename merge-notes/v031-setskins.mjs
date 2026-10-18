// v0.3.1 merge, step 20: match/platform.js declared `setSkins` TWICE — this fork's chess-id-keyed one (with its own
// emergency/ended guards) after upstream's charId-keyed one, so the older definition won and the charId model the rest of
// the merge follows never took effect (Match.setSkins tests, the lobby→match skin flow and the prep-scout refresh all
// failed). Upstream's is the one kept.
import fs from 'node:fs';

const cwd = process.argv[2];
const file = `${cwd}/server/match/match/platform.js`;
const lines = fs.readFileSync(file, 'utf8').split('\n');

const heads = [];
lines.forEach((l, i) => { if (l.startsWith('  setSkins(playerId, skins) {')) heads.push(i); });
if (heads.length < 2) { console.log(`  -- setSkins 定义 ${heads.length} 个，跳过`); process.exit(0); }

// the doc comment above the SECOND definition starts at the nearest preceding `  /**`
const decl = heads[1];
let start = decl;
while (start > 0 && lines[start - 1].trim() !== '*/') start--;
start--; // the `/**` line
let end = decl;
while (end < lines.length && lines[end] !== '  }') end++;
// take the blank line after the method too
if (lines[end + 1] === '') end++;

console.log(`  删除 ${start + 1}..${end + 1}（我们那份 chess 键的 setSkins）`);
const out = [...lines.slice(0, start), ...lines.slice(end + 1)];
fs.writeFileSync(file, out.join('\n'), 'utf8');
console.log(`  剩余 setSkins 定义: ${(out.join('\n').match(/^  setSkins\(playerId, skins\) \{/gm) || []).length}`);
