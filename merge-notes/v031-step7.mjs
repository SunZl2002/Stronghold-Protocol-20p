// v0.3.1 merge, step 7: server/match/match/phases.js — the merge re-inserted upstream's GLOBAL band-draft tail into this
// fork's per-group method (the same two blocks the v0.3.0 resolution removed). Both go; everything else upstream 0.3.1
// brought to this file (afterBattleCheck / the offer window around startRound) stays.
import fs from 'node:fs';

const cwd = process.argv[2];
const file = `${cwd}/server/match/match/phases.js`;
const lines = fs.readFileSync(file, 'utf8').split('\n');

// A: the global d.idx / _turnTimer advance that must not run for a finished group — the method keeps `return;` + `}`
const c = lines.findIndex((l) => l.includes('a finished group WAITS for the others'));
const u = lines.findIndex((l) => l.includes("(upstream's single-group block used to sit here"));
if (c < 0 || u < 0) throw new Error(`锚点没找到（c ${c}, u ${u}）`);
const beforeA = lines.length;
lines.splice(c + 2, u - (c + 2), '      return;', '    }');
console.log(`  A: 用 return; + } 替换 ${u - (c + 2)} 行`);

// B: upstream's global deadline / expire timer inside `if (!g.untimed)`
const b1 = lines.findIndex((l) => l.trim() === 'd.turnDeadline = this.sched.now() + ms;');
if (b1 < 0) throw new Error('B 起点没找到');
let b2 = b1;
while (b2 < lines.length && !(lines[b2].trim() === 'this.deadline = 0;')) b2++;
// the two lines after that are `    }` (closing the else) and `  }` (closing the if) — keep only the if's closing brace
while (b2 < lines.length && lines[b2].trim() !== '}') b2++;
lines.splice(b1, b2 - b1 + 1, '    }');
console.log(`  B: 删掉 ${b2 - b1 + 1} 行，换成 }`);

fs.writeFileSync(file, lines.join('\n'), 'utf8');
const text = lines.join('\n');
for (const k of ['_turnTimer', 'const expire = () =>', 'this.finishBandDraft(false);', 'return;', 'afterBattleCheck']) {
  console.log(`  ${k}: ${(text.match(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length}`);
}
console.log(`  行数 ${beforeA} → ${lines.length}`);
