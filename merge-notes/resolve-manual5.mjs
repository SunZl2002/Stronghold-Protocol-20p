// Throwaway: replay the hand-made resolutions for five files, by marker line number.
//
// Every one of them is "each side added its own thing in the same place", so the answer is BOTH — with the two places
// where a single expression has to be merged (room.js `canStart`, routes.js listener body) spelled out.
import fs from 'node:fs';

const cwd = process.argv[2];
const L = (f) => fs.readFileSync(`${cwd}/${f}`, 'utf8').split('\n');
const W = (f, lines) => fs.writeFileSync(`${cwd}/${f}`, lines.join('\n'), 'utf8');

/** [s,mid,e] 1-based marker lines -> replacement lines. */
function fix(f, blocks) {
  let lines = L(f);
  // highest block first so earlier line numbers stay valid
  const sorted = [...blocks].sort((a, b) => b.s - a.s);
  for (const b of sorted) {
    if (!lines[b.s - 1].startsWith('<<<<<<<')) throw new Error(`${f}:${b.s} not a start marker`);
    if (!lines[b.mid - 1].startsWith('=======')) throw new Error(`${f}:${b.mid} not a separator`);
    if (!lines[b.e - 1].startsWith('>>>>>>>')) throw new Error(`${f}:${b.e} not an end marker`);
    lines = [...lines.slice(0, b.s - 1), ...b.text, ...lines.slice(b.e)];
  }
  W(f, lines);
  const left = (lines.join('\n').match(/^<{7}|^>{7}/gm) || []).length;
  console.log(`  ${f.padEnd(34)} 残留标记 ${left}`);
}

fix('public/js/main.js', [{
  s: 70, mid: 73, e: 76,
  text: [
    "import { installMatchChat } from './matchChat.js';",
    "import { assetCache } from './assetCache.js';",
    "import { installContent, installContentSet } from './content.js';",
    "import { cosmetics } from './cosmetics.js';",
  ],
}]);

fix('public/js/ui/hud.js', [{
  s: 369, mid: 371, e: 373,
  text: [
    '  // This fork adds onUniteSkipVote (the 联防 skip vote); upstream adds `room` (the plugin/content panel).',
    '  spectators = null, myId = null, isHost = false, onRemoveSpectator = null, onUniteSkipVote = () => {}, room = null }) {',
  ],
}]);

fix('public/js/screens/room.js', [{
  s: 73, mid: 89, e: 97,
  text: [
    '  const emptySeats = seats.filter((s) => !s).length;',
    '  const botCount = occupied.filter((s) => s.isBot).length;',
    '  const maxAiPerRoom = Number.isInteger(room?.maxAiPerRoom) && room.maxAiPerRoom >= 0 ? room.maxAiPerRoom : null;',
    '  const aiLimitReached = maxAiPerRoom !== null && botCount >= maxAiPerRoom;',
    '  const aiLimitExceeded = maxAiPerRoom !== null && botCount > maxAiPerRoom;',
    '  const waiting = !room?.inMatch;',
    "  // a room with gameplay plugins (DESIGN §32.6): every player's page has loaded and checked its content (the host's too)",
    '  const modded = isModdedRoom(room);',
    "  const contentReady = !modded || humans.every((s) => s.content === 'ready');",
    '  return {',
    '    seats, occupied, humans, mine, isHost, readyHumans, isReady,',
    "    // This fork's AI-seat limits and upstream's content gate both decide `canStart`.",
    '    emptySeats, botCount, maxAiPerRoom, aiLimitReached, aiLimitExceeded,',
    '    allowMatchmaking: room?.allowMatchmaking !== false,',
    "    canSetMatchmaking: waiting && isHost && room?.mode === 'coop' && !!mine && !mine.isBot && !mine.left,",
    "    canAddBot: waiting && isHost && room?.mode !== 'solo' && emptySeats > 0 && !aiLimitReached,",
    '    transferableHumans: waiting && isHost && !!mine',
    '      ? others.filter((s) => s.connected !== false && !s.left) : [],',
    '    canStart: waiting && isHost && othersReady && !!mine && !aiLimitExceeded && contentReady',
    '      && (!room?.content?.trusted || humans.every((s) => room.content.trusted.consent[s.seat])),',
  ],
}]);

fix('server/http/files.js', [{
  s: 334, mid: 336, e: 338,
  text: [
    "  // this fork: the response's own encoding (announcements / asset-cache responses use it)",
    "  if (encoding) headers['Content-Encoding'] = encoding;",
    '  // upstream: per-call header overrides, applied last so a caller can win',
    "  if (opts.headers) for (const [k, v] of Object.entries(opts.headers)) if (v != null && v !== '') headers[k] = v;",
  ],
}]);

// routes.js: three blocks, handled highest-first by fix()
fix('server/http/routes.js', [
  {
    s: 162, mid: 166, e: 169,
    text: [
      '    // upstream: the site\'s own CSP (hashed importmap + simulation Worker) when one was supplied',
      "    if (csp) res.setHeader('Content-Security-Policy', csp);",
      '    // this fork: health is optional (serve-only embedders, and the runtime-cache tests, build the handler without the',
      '    // status wiring), and the traffic meter is a counter — it must never be able to fail a request.',
      "    if (health?.traffic) health.traffic.meter(res, splitUrl(req.url || '/')?.rawPath || '/');",
    ],
  },
  {
    s: 85, mid: 100, e: 108,
    text: [
      " *           announcements?: ReturnType<typeof import('../announcements.js').createAnnouncementStore>,",
      " *           assetCache?: ReturnType<typeof import('./assetCache.js').createAssetCacheHandler>,",
      ' *           csp?: string | null,',
      ' *           studio?: { handles: (rawPath: string) => boolean, handle: (req: any, res: any, rawPath: string, query: string) => Promise<void> } | null }} deps',
      " *   trustProxy: whose forwarding headers name the client (net.js clientAddress; the server's TRUST_PROXY); studio: the",
      ' *   plugin studio (server/studio/index.js), or none. announcements / assetCache / emergency are this fork\'s.',
      ' * @returns {(req: import(\'node:http\').IncomingMessage, res: import(\'node:http\').ServerResponse) => void}',
      ' */',
      "export function createRequestHandler({ serveStatic, health, log, trustProxy = 'auto', announcements, assetCache, csp = null, studio = null, trustedRuntime = null, emergency = () => null }) {",
    ],
  },
  {
    s: 53, mid: 55, e: 57,
    text: [
      "// `content` / `trusted` are upstream 0.3.0's plugin fields; `bandwidthEmergency` is this fork's.",
      'export function healthReport({ startedAt, network, registry, lobby, bandwidthEmergency, content = null, traffic, assetIndex, views, trusted }, withTraffic = false) {',
    ],
  },
]);
