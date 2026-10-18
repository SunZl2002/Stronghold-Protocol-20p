// Throwaway: server/lobby.js — the last file of the v0.3.1 merge (8 hunks, every one a union).
import fs from 'node:fs';

const cwd = process.argv[2];
const file = `${cwd}/server/lobby.js`;
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
if (hunks.length !== 8) throw new Error(`期望 8 块，实际 ${hunks.length}`);

const repl = [
  // 1. imports: this fork's capacities / crypto / net helpers + upstream's skin checks
  [
    "import { randomBytes, randomInt, randomUUID } from 'node:crypto';",
    "import { DIFFICULTIES, ERR, PHASE, DEFAULT_SEATS, ROOM_CAPACITIES, MAX_SEATS, MAX_SPECTATORS, DEFAULT_SPECTATORS, SPECTATOR_CAPACITIES, ROOM_CODE_LEN, modeIdFor } from '../shared/constants.js';",
    "import { checkLoadout, checkLoadoutOps, cultivationCharIds, checkNotOwned, checkDiyPicks, charPotentialChanges, checkSkinSelection, operatorCharIds } from '../shared/protocol.js';",
    "import { encode, prepareMessage, sendPrepared, isDroppable, isErrCode, sendRaw, sendSession } from './net.js';",
  ],
  // 2. upstream's freezeSkins helper (this fork has no equivalent) — the Room doc comes with it
  [...hunks[1].theirs],
  // 3. the lobby's own fields: this fork's AI ceiling / emergency / asset cache + upstream's test room state
  [...hunks[2].ours, ...hunks[2].theirs],
  // 4. create(): this fork's capacity validation AND upstream's test-room check, which runs before the room is built
  [
    '    create(session, { mode, difficulty, capacity = DEFAULT_SEATS, spectatorCapacity = DEFAULT_SPECTATORS, assetCache, test } = {}) {',
    '      if (this.emergency.active) return fail(ERR.SERVER_EMERGENCY);',
    "      if (!ROOM_CAPACITIES.includes(capacity)) return fail(ERR.BAD_MSG, 'invalid capacity');",
    "      if (spectatorCapacity !== undefined && !SPECTATOR_CAPACITIES.includes(spectatorCapacity)) return fail(ERR.BAD_MSG, 'invalid spectator capacity');",
    '      // upstream 0.3.1: a test room exists only when the process switch allowed it (checked before the room is built)',
    '      if (test === true && this.testEnabled !== true) return fail(ERR.TEST_DISABLED);',
  ],
  // 5. one room: this fork's capacities + AI ceiling, upstream's test flag
  [
    '      // one room: this fork\'s 20-player capacities and AI ceiling, upstream\'s test flag (then the content set and',
    '      // the default plugins, below)',
    '      const room = new Room(code, mode, difficulty, this.now(), capacity, spectatorCapacity);',
    '      room.maxAiPerRoom = this.maxAiPerRoom;',
    '      room.test = test === true;',
  ],
  // 6. join: this fork's asset-cache readiness + upstream's test acknowledgement
  ['    join(session, { code, assetCache, testAck }) {'],
  // 7. spectate: the same pair
  ['    spectate(session, { code, assetCache, testAck }) {'],
  // 8. welcomeInfo: this fork's precache policy / emergency flag + upstream's content identity and notices marker
  [
    '      let info;',
    '      if (!this.vanilla) info = { diyKitted: KITTED_CHARS, requireAssetCache: this.requireAssetCache, emergency: this.emergency };',
    '      else {',
    '        let n;',
    '        try { n = Number(this.plugins?.unofficial?.()) || 0; } catch { n = 0; }',
    '        info = { diyKitted: KITTED_CHARS, requireAssetCache: this.requireAssetCache, emergency: this.emergency,',
    '          content: n > 0 ? { vanilla: this.vanilla.cs, plugins: n } : { vanilla: this.vanilla.cs } };',
    '        // upstream 0.3.1: catalogue metadata, never part of a room or match; omitted when no loaded plugin publishes a',
    '        // notice.',
    '        if (this.plugins?.hasNotices?.()) info.content.notices = true;',
    '      }',
  ],
];

let out = [...lines];
for (let k = 7; k >= 0; k--) {
  const { s, e } = hunks[k];
  out = [...out.slice(0, s), ...repl[k], ...out.slice(e + 1)];
}
fs.writeFileSync(file, out.join('\n'), 'utf8');
const text = out.join('\n');
console.log(`  server/lobby.js 残留标记 ${(text.match(/^(<{7}|>{7})/gm) || []).length}`);
for (const k of ['maxAiPerRoom', 'this.emergency =', 'testEnabled', 'testUnrecognized', 'freezeSkins', 'checkSkinSelection', 'testAck', 'hasNotices', 'spectatorCapacity']) {
  console.log(`  ${text.includes(k) ? 'ok' : '!!'} ${k}`);
}
