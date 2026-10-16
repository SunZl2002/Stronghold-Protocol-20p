// Throwaway: resolve the protocol/net comment-and-list conflicts by taking BOTH sides' content and merging the few
// lines that overlap. Applied by line number after checking the markers, because both files are large.
import fs from 'node:fs';

const cwd = process.argv[2];

/** Replace a marker block [s..e] (1-based, inclusive of the three markers) with `text` (array of lines). */
function spliceBlock(file, s, mid, e, text) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  if (!lines[s - 1].startsWith('<<<<<<<')) throw new Error(`${file}:${s} is not a marker`);
  if (!lines[mid - 1].startsWith('=======')) throw new Error(`${file}:${mid} is not a separator`);
  if (!lines[e - 1].startsWith('>>>>>>>')) throw new Error(`${file}:${e} is not an end marker`);
  const out = [...lines.slice(0, s - 1), ...text, ...lines.slice(e)];
  fs.writeFileSync(file, out.join('\n'), 'utf8');
}

// ---- shared/protocol.js
{
  const f = `${cwd}/shared/protocol.js`;
  // hunk 2 first (higher line numbers), so the first replacement does not shift it
  spliceBlock(f, 564, 568, 584, [
    "  // `cs` (DESIGN §32, optional): the content hash the reporting browser ran the battle on — its spec's `cs`. In a room",
    '  // with gameplay plugins (P1c, DESIGN §32.6) the match refuses a result without it or with another one (and runs the',
    "  // battle itself); a vanilla room's browser sends none",
    "  'b.result': { battleId: isId, result: isBattleResult, cs: isContentHash, $optional: ['cs'] },",
    '  // A result too large for the socket (or beyond the result list caps) is re-simulated by the server instead.',
    "  'b.yield': { battleId: isId },",
    '  // A delegated bot layout rehearsal (DESIGN §14): the match\'s current host answers the candidates it was handed with',
    "  // the S2C 'b.rehearsal' frame. `choice` is the index of the candidate its browser picked, in the order the task sent",
    '  // them — a malicious or buggy client can only name one of the server\'s own candidate layouts, never a layout or a',
    '  // match state of its own; `error: true` says this client cannot run the task at all (no module Worker, or the',
    '  // simulation data did not load), so the server takes the rehearsal over at once instead of waiting for its timeout.',
    '  // An unknown task, another sender or a task the server already took over is ignored; an invalid `choice` makes the',
    '  // server run the candidates itself. `choice` stops at 7 because a match rehearses at most 8 candidates.',
    "  'b.rehearsalResult': {",
    '    taskId: isId, choice: (v) => v === undefined || isInt(v, 0, 7), error: (v) => v === undefined || v === true,',
    "    $optional: ['choice', 'error'],",
    '  },',
  ]);
  spliceBlock(f, 7, 11, 15, [
    "import { cultivatedStats, isPotential, isCultivate, POTENTIAL_DEFAULT, CULTIVATE_DEFAULT, hasPotentialData } from './potential.js';",
    "import { isAssetCacheReadiness } from './assetCache.js';",
    "import { isChatTextInput } from './matchChat.js';",
    "import { isContentHash } from './plugins/identity.js';",
    "import { isPluginId } from './plugins/manifest.js';",
  ]);
  console.log('  shared/protocol.js ok');
}

// ---- server/net.js
{
  const f = `${cwd}/server/net.js`;
  spliceBlock(f, 77, 84, 90, [
    ' * (a ≤ 160-id list, the same way), room.diy (≤ 8 自选 picks checked against the data, the same way), room.spectate /',
    " * lobby.spectate (taking a spectator seat in a running match resends its state like a watcher's g.watch — server/lobby.js",
    ' * spectate), room.setPlugins (a new visual set: every member downloads its art manifest — server/plugins/visualSet.js),',
    ' * and lobby.watch with on:true/list:true (a paginated room directory, at most 50 rows per reply) and lobby.online',
    " * (this fork's D039 roster, at most 200 rows per reply).",
    ' */',
    "export const HEAVY_TYPES = new Set(['g.watch', 'room.loadout', 'room.skins', 'room.ownership', 'room.diy', 'room.spectate', 'lobby.spectate', 'room.setPlugins', 'lobby.watch', 'lobby.online']);",
  ]);
  spliceBlock(f, 33, 36, 42, [
    "//                                          `diyKitted` (0.2.0 自选编队 — which operators a DIY slot may field) and",
    "//                                          `content` ({ vanilla: <cs> }, the server's content hash — DESIGN §32)",
    '//   onMessage(session, msg) → { ok: true, reply?: object } | { error: ERR code, detail?: string } | undefined — or a',
    '//                                          Promise of one (a room whose match runs in a match host worker, DESIGN §32.6:',
    '//                                          the reply goes out when it settles; a rejection is INTERNAL)',
  ]);
  console.log('  server/net.js ok');
}
