// v0.3.1 merge, step 17: server/match/testTrace.js replaces `m.sched` with a narrow stub (it rewrites `now()` to the
// journal's event clock so a replay sees the same timestamps). This fork's `setDeadline` reads the GAME clock
// (`sched.gameNow()`, what pause and the emergency freeze stop), which the stub did not provide — so any traced match,
// and every `test: true` match, threw `this.sched.gameNow is not a function` inside setDeadline and froze in
// BATTLE_CHECK R0 (the two remaining plugin-offer failures).
//
// The stub now forwards `gameNow` to the wrapped scheduler. During a trace the freeze layer is not in play, so the stub's
// own `now()` (the journal's event clock) is the right game time — that keeps a replay deterministic.
import fs from 'node:fs';

const cwd = process.argv[2];
const file = `${cwd}/server/match/testTrace.js`;
const text = fs.readFileSync(file, 'utf8');

const from = `  m.sched = {
    virtual: scheduler.virtual, instant: scheduler.instant,
    now: () => eventNow ?? scheduler.now(),`;
const to = `  m.sched = {
    virtual: scheduler.virtual, instant: scheduler.instant,
    now: () => eventNow ?? scheduler.now(),
    // this fork's phase deadline reads the GAME clock; a traced match is never frozen, so the journal's clock is it
    gameNow: () => eventNow ?? scheduler.now(),`;

if (text.includes('gameNow:')) { console.log('  -- 桩已有 gameNow'); process.exit(0); }
if (!text.includes(from)) throw new Error('桩的形状与预期不同');
fs.writeFileSync(file, text.replace(from, to), 'utf8');
console.log('  ok testTrace 的 sched 桩补上 gameNow');
