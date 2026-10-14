// Lobby presence, a paged room directory, and atomic quick matching.
// Never broadcasts a complete room.state or match state to directory viewers.

import { randomInt } from 'node:crypto';
import { ERR, ROOM_CAPACITIES } from '../shared/constants.js';
import { LOBBY_PAGE_SIZE, LOBBY_UPDATE_MS } from '../shared/lobbyDiscovery.js';
import { encode, sendRaw } from './net.js';

const OK = Object.freeze({ ok: true });
const fail = (error, detail) => (detail ? { error, detail } : { error });

/** Roster rows are bounded: one frame must never grow with an unbounded population. */
const ROSTER_MAX = 200;
/** Order: idle players first (the ones who can still be joined), then watchers, then players in a match. */
const STATUS_RANK = Object.freeze({ lobby: 0, waiting: 1, spectating: 2, playing: 3 });

/**
 * The one place the four `LOBBY_STATUS` values are decided. The room's own membership wins over any guess made from
 * shapes: a spectator seat is watching, a room with a running match is playing, any other room is waiting, and a
 * player in no room is online in the lobby.
 * @param {any} room the player's room or null
 * @param {string} playerId
 * @returns {'lobby'|'waiting'|'spectating'|'playing'}
 */
function statusOf(room, playerId) {
  if (!room) return 'lobby';
  if (room.spectatorOf(playerId)) return 'spectating';
  return room.match ? 'playing' : 'waiting';
}

/** Public directory data: counts and settings, never identities, tokens, or loadouts. */
export function roomSummary(room) {
  let humanCount = 0;
  let connectedHumanCount = 0;
  let botCount = 0;
  for (const seat of room.seats) {
    if (!seat || seat.left) continue;
    if (seat.isBot) botCount++;
    else {
      humanCount++;
      if (seat.connected) connectedHumanCount++;
    }
  }
  const host = room.seatOf(room.hostId);
  return {
    code: room.allowMatchmaking === false ? null : room.code,
    roomId: room.directoryId,
    allowMatchmaking: room.allowMatchmaking !== false,
    mode: room.mode,
    difficulty: room.difficulty,
    capacity: room.capacity,
    playerCount: humanCount + botCount,
    humanCount,
    botCount,
    inMatch: !!room.match,
    joinable: room.allowMatchmaking !== false && room.mode === 'coop' && !room.match && room.freeSeat() >= 0,
    spectatorCount: room.spectators.length,
    // D034: the room's own cap (0 = spectating off), not the global ceiling.
    spectatorCapacity: room.spectatorCapacity,
    spectatable: room.mode === 'coop' && room.spectators.length < room.spectatorCapacity,
    hostOnline: !!host && !host.left && host.connected,
    disconnectedRetained: humanCount > 0 && connectedHumanCount === 0,
    createdAt: room.createdAt,
  };
}

/**
 * D039: where one connected player is right now, as a `LOBBY_STATUS` value. Server-owned so the client never infers
 * it from room shapes. The room's own membership decides, in this order: a spectator seat is watching, a room with a
 * running match is playing, any other room is waiting, and a player in no room is idle in the lobby.
 * @param {import('./lobby.js').Lobby} lobby
 * @param {import('./net.js').Session} session
 * @returns {'lobby'|'waiting'|'spectating'|'playing'}
 */
export function lobbyStatusOf(lobby, session) {
  return statusOf(lobby.roomOf(session), session.playerId);
}

/**
 * One roster row. The optional `round` only ever carries the match's round number — it says nothing about who else
 * is in the room or how it is configured, so a private room's contents stay private.
 * @param {import('./lobby.js').Lobby} lobby
 * @param {import('./net.js').Session} session
 */
function rosterRow(lobby, session) {
  const room = lobby.roomOf(session);
  const row = { playerId: session.playerId, name: session.name, status: statusOf(room, session.playerId) };
  const round = room?.match?.round;
  if (Number.isInteger(round) && round > 0) row.round = round;
  return row;
}

/**
 * D039: the online roster — connected human sessions with their name, status and (when a match is running) its round.
 * Never AI (a bot has no session), never a token, address or loadout, and never the room's invitation code: a private
 * room stays private even to a roster reader. `round` deliberately carries only the number, which says nothing about
 * who else is in the room or how it is configured. Bounded and stably ordered (idle first, then by name) so two
 * identical populations serialize alike.
 * @param {import('./lobby.js').Lobby} lobby
 * @returns {{ playerId: string, name: string, status: string, round?: number }[]}
 */
export function lobbyRoster(lobby) {
  const out = [];
  for (const session of lobby.registry.all()) {
    if (session.connected) out.push(rosterRow(lobby, session));
  }
  out.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]
    || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0));
  return out.slice(0, ROSTER_MAX);
}

/** Fully disconnected rooms go last; both sections retain the original waiting/running ordering. */
export function compareRoomSummaries(a, b) {
  const group = (room) => (room.inMatch ? 2 : room.joinable ? 0 : 1);
  return Number(!!a.disconnectedRetained) - Number(!!b.disconnectedRetained)
    || group(a) - group(b) || a.createdAt - b.createdAt
    || ((a.roomId || a.code) < (b.roomId || b.code) ? -1 : (a.roomId || a.code) > (b.roomId || b.code) ? 1 : 0);
}

export class LobbyDiscovery {
  /** @param {import('./lobby.js').Lobby} lobby */
  constructor(lobby, { timers = globalThis, chooseIndex = randomInt } = {}) {
    this.lobby = lobby;
    this.timers = timers;
    this.chooseIndex = chooseIndex;
    this.watchers = new Map();
    this.timer = null;
    this.closed = false;
  }

  /** lobby.watch: only connected players outside any room receive directory updates. */
  watch(session, { on, list = false, page = 0, rid }) {
    if (!on) { this.forget(session.playerId); return OK; }
    if (this.lobby.emergency?.active) return fail(ERR.SERVER_EMERGENCY);
    if (this.closed || !session.connected) return fail(ERR.BAD_TARGET, 'not connected');
    if (this.lobby.roomOf(session)) return fail(ERR.BAD_TARGET, 'leave your room first');
    const prev = this.watchers.get(session.playerId);
    // Repeating an unchanged subscription cannot amplify into a payload per request.
    if (prev && prev.list === list && prev.page === page && prev.ws === session.ws) return OK;
    const watcher = { session, ws: session.ws, list, page, last: prev?.last ?? null };
    this.watchers.set(session.playerId, watcher);
    const state = this.snapshot(watcher);
    // Network adds the request id to this direct reply. Keeping it out of the fingerprint ensures a repeated
    // subscription does not create a different payload merely because its rid changed.
    if (Number.isInteger(rid)) {
      const frame = encode(state);
      if (frame === watcher.last) return OK;
      watcher.last = frame;
      return { ok: true, reply: state };
    }
    this.sendView(watcher, state);
    return OK;
  }

  forget(playerId) {
    this.watchers.delete(playerId);
    if (!this.watchers.size && this.timer != null) {
      this.timers.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * D039 `lobby.online`: the online roster, answered on demand. Available to any connected player in any state —
   * including one already inside a room or a running match, who may open the roster to see who else is around; it
   * reads presence only and changes nothing. Refused while the emergency brake is on, like every other lobby query.
   */
  online() {
    if (this.lobby.emergency?.active) return fail(ERR.SERVER_EMERGENCY);
    return { ok: true, reply: { t: 'lobby.online', players: lobbyRoster(this.lobby) } };
  }

  /** Schedule one shared update, irrespective of how many room/presence events occur. */
  changed() {
    if (this.closed || this.lobby.emergency?.active || !this.watchers.size || this.timer != null) return;
    this.timer = this.timers.setTimeout(() => { this.timer = null; this.flush(); }, LOBBY_UPDATE_MS);
    this.timer?.unref?.();
  }

  projection(withRooms) {
    let online = 0;
    for (const session of this.lobby.registry.all()) if (session.connected) online++;
    let matchCount = 0;
    let playingCount = 0;
    let joinableCount = 0;
    const rooms = [];
    for (const room of this.lobby.rooms.values()) {
      if (room.match) {
        matchCount++;
        // Connected present humans include eliminated and autoplay seats; AI and spectators never count.
        playingCount += room.seats.filter((seat) => seat && !seat.isBot && !seat.left && seat.connected).length;
      }
      if (room.allowMatchmaking !== false && room.mode === 'coop' && !room.match && room.freeSeat() >= 0) joinableCount++;
      if (withRooms) rooms.push(roomSummary(room));
    }
    if (withRooms) rooms.sort(compareRoomSummaries);
    return { online, roomCount: this.lobby.rooms.size, matchCount, playingCount, joinableCount, rooms };
  }

  snapshot(watcher, view = this.projection(watcher.list)) {
    const { list, page } = watcher;
    const { online, roomCount, matchCount, playingCount, joinableCount } = view;
    const state = { t: 'lobby.state', online, roomCount, matchCount, playingCount, joinableCount,
      requireAssetCache: this.lobby.requireAssetCache };
    if (list) {
      const totalPages = Math.max(1, Math.ceil(view.rooms.length / LOBBY_PAGE_SIZE));
      const currentPage = Math.max(0, Math.min(page, totalPages - 1));
      // Keep the subscription on the page acknowledged to the client, even if the directory grows again.
      watcher.page = currentPage;
      Object.assign(state, {
        rooms: view.rooms.slice(currentPage * LOBBY_PAGE_SIZE, (currentPage + 1) * LOBBY_PAGE_SIZE),
        page: currentPage,
        pageSize: LOBBY_PAGE_SIZE,
        totalPages,
      });
    }
    return state;
  }

  sendView(watcher, state) {
    const frame = encode(state);
    if (frame != null && frame !== watcher.last && sendRaw(watcher.session.ws, frame)) watcher.last = frame;
  }

  /** Only changed, bounded views are sent; unopened room lists cost no list traffic. */
  flush() {
    if (this.timer != null) { this.timers.clearTimeout(this.timer); this.timer = null; }
    if (this.closed || this.lobby.emergency?.active) return;
    for (const [id, watcher] of this.watchers) {
      if (!watcher.session.connected || watcher.ws !== watcher.session.ws || this.lobby.roomOf(watcher.session)) this.forget(id);
    }
    if (!this.watchers.size) return;
    const view = this.projection([...this.watchers.values()].some((watcher) => watcher.list));
    const pages = new Map();
    for (const watcher of this.watchers.values()) {
      const key = watcher.list ? watcher.page : 'summary';
      let state = pages.get(key);
      if (!state) { state = this.snapshot(watcher, view); pages.set(key, state); }
      if (watcher.list) watcher.page = state.page; // cached views must normalize every subscriber too
      this.sendView(watcher, state);
    }
  }

  /** Capacity preference falls back to fastest; ties are random and the join is synchronous. */
  quickMatch(session, { capacity, assetCache } = {}) {
    if (this.lobby.emergency?.active) return fail(ERR.SERVER_EMERGENCY);
    if (capacity != null && !ROOM_CAPACITIES.includes(capacity)) return fail(ERR.BAD_MSG, 'invalid capacity');
    const current = this.lobby.roomOf(session);
    if (current?.match) return fail(ERR.ROOM_STARTED, 'leave your running match first');
    const admission = this.lobby.assetCacheAdmission(assetCache);
    if (admission) return admission;
    let candidates = [...this.lobby.rooms.values()].filter((room) => room !== current
      && room.allowMatchmaking !== false && room.mode === 'coop' && !room.match && room.freeSeat() >= 0);
    if (capacity != null) {
      const preferred = candidates.filter((room) => room.capacity === capacity);
      if (preferred.length) candidates = preferred;
    }
    if (!candidates.length) return fail(ERR.ROOM_NOT_FOUND, 'no joinable room');
    const vacancies = (room) => room.seats.reduce((count, seat) => count + (seat == null ? 1 : 0), 0);
    const fewest = Math.min(...candidates.map(vacancies));
    const best = candidates.filter((room) => vacancies(room) === fewest);
    const room = best[this.chooseIndex(best.length)];
    return this.lobby.join(session, { code: room.code, assetCache });
  }

  /** Resolve a public identity at request time; stale directory views never bypass the latest admission policy. */
  accessById(session, { roomId, assetCache }, spectate) {
    const room = [...this.lobby.rooms.values()].find((candidate) => candidate.directoryId === roomId);
    if (!room) return fail(ERR.ROOM_NOT_FOUND);
    if (!spectate && room.allowMatchmaking === false) return fail(ERR.BAD_TARGET, 'matchmaking disabled');
    // Existing handlers perform room/role/capacity and asset checks before changing any membership.
    return spectate ? this.lobby.spectate(session, { code: room.code, assetCache })
      : this.lobby.join(session, { code: room.code, assetCache });
  }

  close() {
    if (this.timer != null) this.timers.clearTimeout(this.timer);
    this.timer = null;
    this.watchers.clear();
    this.closed = true;
  }
}
