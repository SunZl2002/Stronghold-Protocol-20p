// v0.3.1 merge, step 2 (replayable). Run AFTER v031-step1.mjs.
//
// What this encodes:
//   * upstream's server-side skin pipeline (the owner's option-1 decision): the files where every hunk is the same skin
//     feature written twice — upstream's is the one that stays;
//   * the three hunks that are a REAL union rather than "take theirs":
//       - player/economy.js   upstream's `shopBias: bondBias` rule + this fork's GROUP pool (`itemPoolFor`)
//       - match/infra.js      this fork's game-clock deadline + upstream's test-hook reset
//       - match/views.js      this fork's emergency-frozen fields + upstream's `offers`
//   * shared/protocol.js and gameLogic/settings.js are handled by their own helpers (v031-protocol-a/b, v031-settings).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const cwd = process.argv[2];
const git = (...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const theirs = (files) => git('checkout', '--theirs', '--', ...files);
const edit = (rel, from, to) => {
  const file = `${cwd}/${rel}`;
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes(from)) { console.log(`  !! ${rel}: 片段未找到`); return; }
  fs.writeFileSync(file, text.replace(from, to), 'utf8');
};

// ---- 1. the same skin feature on both sides: upstream's implementation wins
theirs([
  'server/match/player/basics.js', 'server/match/player/round.js', 'server/match/player/views.js',
  'server/sim/battle/players.js', 'server/sim/snapshot.js', 'server/sim/units.js',
  'server/net.js',
]);
console.log('  ok 服务端皮肤一族取上游');

// ---- 2. economy.js: upstream's bondBias + this fork's grouped pool
edit('server/match/player/economy.js', [
  '<<<<<<< HEAD',
  '    const id = this.pool.rollItem(this.m.rngShop, this.shop.level, this.m.itemPoolFor(this));',
  '=======',
  '    // startRound rolls the shop before recompute, so the cached this.bonds can be one round behind.',
  '    // bondBias therefore calls computeBonds at the roll (no rng). The official rule passes null and',
  "    // does not call it, so the shop's rng stays today's two draws.",
  '    let bias = null;',
  "    if (ruleOption(this.m?.rules, 'shopBias') === 'bondBias') {",
  '      const bonds = computeBonds(this.gd, this);',
  '      bias = new Set();',
  '      for (const [id, st] of Object.entries(bonds)) if (st && st.active) bias.add(id);',
  '    }',
  '    const id = this.m.pool.rollItem(this.m.rngShop, this.shop.level, this.m.itemPool, bias);',
  '>>>>>>> upstream/v031',
].join('\n'), [
  '    // upstream 0.3.1: a `shopBias: bondBias` rule biases the roll toward active bonds (computeBonds is called HERE because',
  '    // startRound rolls the shop before recompute, so this.bonds can be a round behind; it consumes no rng).',
  '    let bias = null;',
  "    if (ruleOption(this.m?.rules, 'shopBias') === 'bondBias') {",
  '      const bonds = computeBonds(this.gd, this);',
  '      bias = new Set();',
  '      for (const [id, st] of Object.entries(bonds)) if (st && st.active) bias.add(id);',
  '    }',
  '    // this fork: the roll reads the PLAYER\'S GROUP pool — 20-player rooms split stock per group, and `Match.itemPool` is',
  "    // only the first group's compatibility getter.",
  '    const id = this.m.pool.rollItem(this.m.rngShop, this.shop.level, this.m.itemPoolFor(this), bias);',
].join('\n'));

// ---- 3. infra.js: our game clock + upstream's test hook
edit('server/match/match/infra.js', [
  '<<<<<<< HEAD',
  '    this.deadline = silent ? 0 : this.sched.gameNow() + ms;',
  '    this._phaseTimer = this.later(ms, () => { this._phaseTimer = null; fn(); });',
  '=======',
  '    this.deadline = silent ? 0 : this.sched.now() + ms;',
  '    this._phaseTimer = this.later(ms, () => { this._phaseTimer = null; if (this.test === true) { this._testArmed = null; this._testHeld = null; } fn(); });',
  '    if (this.test === true) this._testArmed = { seconds, fn, silent: !!silent };',
  '>>>>>>> upstream/v031',
].join('\n'), [
  "    // this fork's phase deadline is on the GAME clock (what pause / emergency freeze stop); the real timer still runs on",
  '    // wall time. upstream 0.3.1 adds the test hook: a held phase must not survive the timer.',
  '    this.deadline = silent ? 0 : this.sched.gameNow() + ms;',
  '    this._phaseTimer = this.later(ms, () => { this._phaseTimer = null; if (this.test === true) { this._testArmed = null; this._testHeld = null; } fn(); });',
  '    if (this.test === true) this._testArmed = { seconds, fn, silent: !!silent };',
].join('\n'));

// ---- 4. match/views.js: emergency fields + offers
edit('server/match/match/views.js', [
  '<<<<<<< HEAD',
  '    // Full public snapshots replace the previous state. Omit inactive protection fields from the normal hot path;',
  "    // their absence in the recovery snapshot also clears the client's frozen state.",
  '    if (this.emergencyFrozen) {',
  '      v.emergencyFrozen = true;',
  '      v.emergencyFrozenAt = this.emergencyFrozenAt;',
  '      v.emergencyReason = this.emergencyReason;',
  '    }',
  '=======',
  '    if (this.offers.length) v.offers = this.offerViews();',
  '>>>>>>> upstream/v031',
].join('\n'), [
  '    // this fork: full public snapshots replace the previous state, so an inactive protection field is simply absent — and',
  "    // its absence in a recovery snapshot clears the client's frozen state.",
  '    if (this.emergencyFrozen) {',
  '      v.emergencyFrozen = true;',
  '      v.emergencyFrozenAt = this.emergencyFrozenAt;',
  '      v.emergencyReason = this.emergencyReason;',
  '    }',
  '    // upstream 0.3.1: the offers a player may take right now ride the public view',
  '    if (this.offers.length) v.offers = this.offerViews();',
].join('\n'));
console.log('  ok 三处真并集（economy / infra / match.views）');
