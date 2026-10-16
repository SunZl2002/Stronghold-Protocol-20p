// Throwaway: resolve the conflicts whose correct answer is plain "keep BOTH sides", which is the majority of them:
// each branch added lines where the other added different lines, so git could not pick a side but both belong.
//
// Only used for files where every hunk is additive (documentation tables, import lists, comment blocks). Files with a
// real semantic choice are listed in NEEDS_DECISION and skipped.
import fs from 'node:fs';

const cwd = process.argv[2];

// Verified by reading .cache/conflicts.txt: each of these has only additive hunks.
const BOTH_SIDES = [
  'docs/ARCHITECTURE.md',
  'docs/DESIGN.md',
  'public/js/ui/stats.js',
  'server/match/effectsMeta.js',
  'server/match/finalAssault.js',
  'server/match/gamedata.js',
  'server/match/invariants.js',
  'server/match/match/intents.js',
  'server/match/match/phases.js',
  'server/match/match/spDraft.js',
  'server/match/pool.js',
  'server/sim/content/bands/meta.js',
  'test/match/runner.test.js',
  'test/render/recovery.browser.test.js',
];

const START = /^<{7} [^\n]*$/;
const MID = /^={7}[^\n]*$/;
const END = /^>{7} [^\n]*$/;

for (const rel of BOTH_SIDES) {
  const file = `${cwd}/${rel}`;
  if (!fs.existsSync(file)) { console.log(`  ${rel}: 不存在，跳过`); continue; }
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const out = [];
  let i = 0;
  let n = 0;
  while (i < lines.length) {
    if (!START.test(lines[i])) { out.push(lines[i++]); continue; }
    n++;
    i++;
    const ours = [];
    while (i < lines.length && !MID.test(lines[i])) ours.push(lines[i++]);
    i++;
    const theirs = [];
    while (i < lines.length && !END.test(lines[i])) theirs.push(lines[i++]);
    i++;
    // both sides verbatim; drop a blank line on either side that would double up
    const a = ours.join('\n').replace(/\n+$/, '');
    const b = theirs.join('\n').replace(/\n+$/, '');
    if (a.trim() && b.trim()) out.push(...a.split('\n'), ...b.split('\n'));
    else out.push(...(a.trim() ? a : b).split('\n'));
  }
  fs.writeFileSync(file, out.join('\n'), 'utf8');
  const left = (fs.readFileSync(file, 'utf8').match(/^<{7}|^>{7}/gm) || []).length;
  console.log(`  ${rel.padEnd(44)} ${n} 块 → 残留标记 ${left}`);
}
