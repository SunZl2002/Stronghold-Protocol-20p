// v0.3.1 merge, step 3a: ui/detailPanel.js from a FRESH merge — three hunks, all unions.
//   1. ChessDetail's signature: this fork adds foreignSkin, upstream 0.3.1 adds morphMode / onUnequip.
//   2. the blocks: this fork's 干员皮肤 section, upstream's multiple-garrison rendering.
//   3. the detail props: this fork's foreignSkin, upstream's morphMode / onUnequip / unequipAllowed.
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
if (hunks.length !== 3) throw new Error(`期望 3 块，实际 ${hunks.length}`);

const SIG = [
  "// this fork passes foreignSkin (a teammate's unit carries its own skin); upstream 0.3.1 passes morphMode / onUnequip",
  "export function ChessDetail({ chess, piece, unit, snapHp, editable, onSell, bonds, offBonds = null, loadout, onBond, live = null, hint = null, unitItems = null, standIn = null, diy = null, cultOpts = null, foreignSkin = null, morphMode = 'official', onUnequip = null }) {",
];

const BLOCKS = [
  ...hunks[1].ours.filter((l) => !l.includes('blocks.garrison =')),
  ...hunks[1].theirs,
];

const chessLine = hunks[2].theirs[0].replace(
  'cultOpts=${detail.cultOpts || { ops }} morphMode=${morphMode} onUnequip=${onUnequip}',
  'foreignSkin=${detail.foreignSkin || null} cultOpts=${detail.cultOpts || { ops }} morphMode=${morphMode} onUnequip=${onUnequip}',
);
const PROPS = [chessLine, hunks[2].theirs[1]];

const repl = [SIG, BLOCKS, PROPS];
let out = [...lines];
for (let k = 2; k >= 0; k--) {
  const { s, e } = hunks[k];
  out = [...out.slice(0, s), ...repl[k], ...out.slice(e + 1)];
}
fs.writeFileSync(file, out.join('\n'), 'utf8');
const text = out.join('\n');
console.log(`  detailPanel.js 残留标记 ${(text.match(/^(<{7}|>{7})/gm) || []).length}`);
