// Throwaway: detailPanel.js's remaining two hunks — both sides pass props the other lacks, so the union carries all.
import fs from 'node:fs';

const cwd = process.argv[2];
const file = `${cwd}/public/js/ui/detailPanel.js`;
const lines = fs.readFileSync(file, 'utf8').split('\n');

const hunks = [];
let i = 0;
while (i < lines.length) {
  if (!lines[i].startsWith('<<<<<<<')) { i++; continue; }
  const s = i;
  i++;
  const ours = [];
  while (i < lines.length && !lines[i].startsWith('=======')) ours.push(lines[i++]);
  i++;
  const theirs = [];
  while (i < lines.length && !lines[i].startsWith('>>>>>>>')) theirs.push(lines[i++]);
  i++;
  hunks.push({ s, e: i - 1, ours, theirs });
}
if (hunks.length !== 2) throw new Error(`期望 2 块，实际 ${hunks.length}`);

// hunk 1: our skin block (kept verbatim) + upstream's multiple-garrison rendering
const h1 = [
  ...hunks[0].ours.filter((l) => !l.includes('blocks.garrison =')),
  ...hunks[0].theirs,
];

// hunk 2: chess detail gets foreignSkin (ours) AND morphMode/onUnequip (upstream); the item detail gets upstream's two
const chessLine = hunks[1].theirs[0].replace(
  'cultOpts=${detail.cultOpts || { ops }} morphMode=${morphMode} onUnequip=${onUnequip}',
  'foreignSkin=${detail.foreignSkin || null} cultOpts=${detail.cultOpts || { ops }} morphMode=${morphMode} onUnequip=${onUnequip}',
);
const h2 = [chessLine, hunks[1].theirs[1]];

let out = [...lines];
for (const [k, repl] of [[1, h2], [0, h1]]) {
  const { s, e } = hunks[k];
  out = [...out.slice(0, s), ...repl, ...out.slice(e + 1)];
}
fs.writeFileSync(file, out.join('\n'), 'utf8');
const text = out.join('\n');
console.log(`  detailPanel.js 残留标记 ${(text.match(/^(<{7}|>{7})/gm) || []).length}`);
for (const k of ['foreignSkin', 'morphMode', 'onUnequip', 'unequipAllowed', 'garrisons.length > 1', 'blocks.skin']) {
  console.log(`  ${text.includes(k) ? 'ok' : '!!'} ${k}`);
}
