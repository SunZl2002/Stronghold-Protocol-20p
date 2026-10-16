// Throwaway: platform.js — this fork's 紧急保护 (emergency freeze) hooks beside upstream's 0.3.0 rehearsal hooks.
// Every hunk is "each side added its own thing in the same place", so both stay.
import fs from 'node:fs';

const cwd = process.argv[2];
const file = `${cwd}/server/match/match/platform.js`;
const lines = fs.readFileSync(file, 'utf8').split('\n');

const START = /^<{7} /, MID = /^={7}/, END = /^>{7} /;
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

  const a = ours.join('\n').trim();
  const b = theirs.join('\n').trim();

  // hunk 1: the stale-report guard. Upstream adds `b.rehearsalResult` to the early return AND keeps b.progress/b.result;
  // this fork adds `b.yield`. One expression, so it is merged rather than duplicated.
  if (/b\.yield/.test(a) && /b\.rehearsalResult/.test(b)) {
    out.push(
      '      // A report that crossed the match end (the last b.progress of a field, a delegated rehearsal\'s answer) is',
      '      // stale: ignored, never an error (DESIGN §14 — an error frame without a rid would surface as a toast in the',
      '      // browser). This fork adds `b.yield` (a result too large for the socket) to upstream\'s list.',
      "      if (msg && msg.t === 'b.rehearsalResult') return OK;",
      "      return this.clientCombat && msg && (msg.t === 'b.progress' || msg.t === 'b.result' || msg.t === 'b.yield') ? OK : fail(ERR.WRONG_PHASE);",
    );
    continue;
  }

  // hunk 2: the authorisation-loss pair. Ours routes through the emergency freeze; upstream also tells the rehearsal
  // scheduler. Both effects must happen.
  if (/emergencyFrozen/.test(a) && /_rehearsalHostChanged/.test(b)) {
    out.push(
      "      if (this.emergencyFrozen) this._emergencyLostAuthorities.add(playerId);",
      "      else if (this.clientCombat) this._authorityLost(ps, 'disconnect');",
      '      // a rehearsal this host was running falls back to the server (DESIGN §14; a no-op without tasks)',
      '      this._rehearsalHostChanged();',
    );
    continue;
  }

  // everything else in this file is purely additive: keep both sides verbatim
  if (a && b) out.push(...a.split('\n'), ...b.split('\n'));
  else out.push(...(a || b).split('\n'));
}

fs.writeFileSync(file, out.join('\n'), 'utf8');
const left = (out.join('\n').match(/^(<{7}|>{7})/gm) || []).length;
console.log(`  platform.js 处理 ${n} 处 → 残留标记 ${left}`);
