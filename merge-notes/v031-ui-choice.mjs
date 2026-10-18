// Throwaway: choiceOverlay.js — hunks 1, 2 and 4 are this fork's superset (imports with useRef/MicroLabel, the 20-player
// group tabs / decision order / expanded grid, per-group countdown); hunk 3 is a real union (our MicroLabel + their deco
// and <span class="spov__name">, then our richer subtitle).
import fs from 'node:fs';

const cwd = process.argv[2];
const file = `${cwd}/public/js/ui/choiceOverlay.js`;
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
if (hunks.length !== 4) throw new Error(`期望 4 块，实际 ${hunks.length}`);

const h3 = [
  hunks[2].ours[0],  // <${MicroLabel} tone="mint">${personal ? 教鞭选择 : CONTINGENCY}</${MicroLabel}>
  hunks[2].theirs[0], // <i class="spov__deco">
  hunks[2].theirs[1], // <h2 ... <span class="spov__name">
  hunks[2].ours[2],   // <p class="spov__sub"> with the grouped/done wording
];

let out = [...lines];
const repl = [hunks[0].ours, hunks[1].ours, h3, hunks[3].ours];
for (let k = 3; k >= 0; k--) {
  const { s, e } = hunks[k];
  out = [...out.slice(0, s), ...repl[k], ...out.slice(e + 1)];
}
fs.writeFileSync(file, out.join('\n'), 'utf8');
const text = out.join('\n');
console.log(`  choiceOverlay.js 残留标记 ${(text.match(/^(<{7}|>{7})/gm) || []).length}`);
for (const k of ['MicroLabel', 'spov__deco', 'spov__name', 'spov__groups', 'spov__order', 'spov__grid--expanded', 'sp.turnDeadline']) {
  console.log(`  ${text.includes(k) ? 'ok' : '!!'} ${k}`);
}
