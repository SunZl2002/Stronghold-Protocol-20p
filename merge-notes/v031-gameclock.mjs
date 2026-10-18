// v0.3.1 merge, step 25: this fork reads the GAME clock (`sched.gameNow()`) — the clock pause and the emergency freeze
// stop — but a few callers replace `m.sched` with a narrow stub (test/match/verification-slices.test.js swaps in one to
// watch timers; server/match/testTrace.js does it for a journal replay). Those stubs have `now()` and no `gameNow()`, so
// the match recorded `this.sched.gameNow is not a function` and errorCount became 1.
//
// Match gets one accessor with the fallback and every match-side read goes through it. FreezeScheduler keeps its own
// definition (that is where the clock lives).
import fs from 'node:fs';

const cwd = process.argv[2];

// 1. the accessor, next to the other clock helpers in infra.js
{
  const file = `${cwd}/server/match/match/infra.js`;
  let text = fs.readFileSync(file, 'utf8');
  if (text.includes('gameNow() {')) { console.log('  -- 访问器已在'); }
  else {
    const anchor = '  scaled(ms) { return Math.max(0, Math.round(ms * this.timerScale)); }';
    if (!text.includes(anchor)) throw new Error('scaled 锚点没找到');
    text = text.replace(anchor, [
      anchor,
      '',
      '  /**',
      "   * The GAME clock: wall time unless the match is frozen (pause / emergency), in which case it stops. A caller may",
      '   * replace `this.sched` with a narrow stub that has `now()` only (test harnesses and the journal replay do), so the',
      '   * fallback keeps that clock readable instead of throwing inside a guarded callback.',
      '   */',
      '  gameNow() {',
      "    return typeof this.sched.gameNow === 'function' ? this.sched.gameNow() : this.sched.now();",
      '  }',
    ].join('\n'));
    fs.writeFileSync(file, text, 'utf8');
    console.log('  ok infra.js: Match.gameNow()');
  }
}

// 2. every match-side `this.sched.gameNow()` → `this.gameNow()`
const TARGETS = [
  'server/match/match/clientCombat.js',
  'server/match/match/infra.js',
  'server/match/match/pause.js',
  'server/match/match/phases.js',
  'server/match/match/setupVote.js',
];
for (const rel of TARGETS) {
  const file = `${cwd}/${rel}`;
  let text = fs.readFileSync(file, 'utf8');
  const n = (text.match(/this\.sched\.gameNow\(\)/g) || []).length;
  if (!n) { console.log(`  -- ${rel}: 无`); continue; }
  // keep the accessor's own body intact
  text = text.replace(/return typeof this\.sched\.gameNow === 'function' \? this\.sched\.gameNow\(\) : this\.sched\.now\(\);/g, 'return typeof this.sched.gameNow === \'function\' ? this.sched.gameNow() : this.sched.now();');
  text = text.replace(/(?<!typeof )this\.sched\.gameNow\(\)/g, 'this.gameNow()');
  fs.writeFileSync(file, text, 'utf8');
  console.log(`  ok ${rel}: ${n} 处`);
}
