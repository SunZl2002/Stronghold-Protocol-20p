// v0.3.1 merge, step 15: server/match/match/spDraft.js — every prep entry must go through `beforePrepOffers()`, which owns
// upstream 0.3.1's `prep` plugin window. Three paths in this fork's group draft called `enterPrep()` directly, so a window
// declared at `prep` could never hold the round (the window opened only afterwards, and `the prep of the round holds until
// the window closes` failed). The test console's own jump keeps its direct call: upstream's file does the same there, on
// purpose (docs in that file: "phase prep from ROUND_START calls enterPrep and therefore skips a 机变 draft").
import fs from 'node:fs';

const cwd = process.argv[2];
const file = `${cwd}/server/match/match/spDraft.js`;
let text = fs.readFileSync(file, 'utf8');

const swaps = [
  ['    if (!this.alivePlayers().length) { this.enterPrep(); return; }',
    '    if (!this.alivePlayers().length) { this.beforePrepOffers(); return; }'],
  ['    if (!pages || !pages.length) { this.enterPrep(); return; }',
    '    if (!pages || !pages.length) { this.beforePrepOffers(); return; }'],
  ['    this.enterPrep();',
    '    this.beforePrepOffers();'],
];

for (const [from, to] of swaps) {
  if (!text.includes(from)) { console.log(`  -- 未找到: ${from.trim()}`); continue; }
  text = text.split(from).join(to);
  console.log(`  ok ${from.trim().slice(0, 60)}`);
}
fs.writeFileSync(file, text, 'utf8');
console.log(`  剩余直接 enterPrep(): ${(text.match(/this\.enterPrep\(\)/g) || []).length}`);
