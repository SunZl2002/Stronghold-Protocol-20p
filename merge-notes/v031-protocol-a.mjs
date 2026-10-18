// Throwaway: shared/protocol.js — four hunks, each a real union (both sides added schema entries).
import fs from 'node:fs';

const cwd = process.argv[2];
const file = `${cwd}/shared/protocol.js`;
const lines = fs.readFileSync(file, 'utf8').split('\n');

// collect the hunks as index ranges
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

// hunk 1: keep this fork's whole lobby block, then upstream's `test` / `testAck` folded into room.create / room.join
const h1 = hunks[0];
const oursRoomCreate = h1.ours.find((l) => l.includes("'room.create'"));
const oursRoomJoin = h1.ours.find((l) => l.includes("'room.join'"));
const keep1 = h1.ours.filter((l) => l !== oursRoomCreate && l !== oursRoomJoin);
const merged1 = [
  ...keep1,
  '    // room.create: this fork adds capacity / spectatorCapacity / assetCache; upstream 0.3.1 adds `test` — only the literal',
  '    // true (DESIGN §34.8), so a string cannot sneak in as "not a test", and the server refuses it unless SP_TEST_MODE is on.',
  "    'room.create': { mode: (v) => v === 'solo' || v === 'coop', difficulty: (v) => DIFFICULTIES.includes(v), capacity: (v) => ROOM_CAPACITIES.includes(v),",
  '      spectatorCapacity: (v) => SPECTATOR_CAPACITIES.includes(v), test: (v) => v === true,',
  "      assetCache: isAssetCacheReadiness, $optional: ['capacity', 'spectatorCapacity', 'test', 'assetCache'] },",
  '    // room.join: this fork\'s assetCache readiness beside upstream\'s testAck',
  "    'room.join': { code: (v) => isStr(v, ROOM_CODE_LEN + 2) && /^[A-Za-z0-9]+$/.test(v), testAck: (v) => v === true,",
  "      assetCache: isAssetCacheReadiness, $optional: ['testAck', 'assetCache'] },",
];

// hunk 2: documentation only — upstream's wording describes the charId-keyed model this fork adopted
const h2 = hunks[1].theirs;

// hunk 3: room.spectate — our assetCache + upstream's testAck
const h3 = [
  "    'room.spectate': { code: (v) => isStr(v, ROOM_CODE_LEN + 2) && /^[A-Za-z0-9]+$/.test(v), testAck: (v) => v === true,",
  "      assetCache: isAssetCacheReadiness, $optional: ['testAck', 'assetCache'] },",
];

// hunk 4: our g.choice (MAX_DRAFT_CARDS + draftScope) AND upstream's plugin interaction windows
const h4 = [
  hunks[3].ours[0],
  '    // a plugin interaction window (PLUGIN API v2, docs/PLUGINS.md §10b): offerId is the window\'s declared id, idx the',
  '    // slot picked; g.offerRefresh redraws one slot (the window\'s own `refresh.perSlot` bounds how often). The host',
  '    // applies the window\'s declared effect primitive — a plugin never receives these messages itself.',
  ...hunks[3].theirs.slice(3),
];

const replacements = [merged1, h2, h3, h4];
let out = [...lines];
for (let k = hunks.length - 1; k >= 0; k--) {
  const { s, e } = hunks[k];
  out = [...out.slice(0, s), ...replacements[k], ...out.slice(e + 1)];
}
fs.writeFileSync(file, out.join('\n'), 'utf8');
const text = out.join('\n');
console.log(`  protocol.js 残留标记 ${(text.match(/^(<{7}|>{7})/gm) || []).length}`);
for (const k of ['test: (v) => v === true', 'testAck', 'MAX_DRAFT_CARDS', 'draftScope', 'g.offer', 'g.offerRefresh']) {
  console.log(`  ${text.includes(k) ? 'ok' : '!!'} ${k}`);
}
