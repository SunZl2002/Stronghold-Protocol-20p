// Lobby-only subscription. Room summaries are requested only while the room browser is open.
// The server owns matching and admission; the client never selects a stale room from its local list.
import { createStore } from './store.js';
import { LOBBY_PAGE_SIZE } from '../../shared/lobbyDiscovery.js';

export const emptyLobbyDiscovery = () => ({
  online: null, roomCount: null, matchCount: null, playingCount: null, joinableCount: null,
  rooms: [], page: 0, totalPages: 1, pageSize: LOBBY_PAGE_SIZE,
  open: false, loading: false, ready: false, error: false,
  // D039 online roster: asked for on demand when the player opens it, and dropped when it closes (it is presence, so
  // a stale copy is worse than none).
  onlineOpen: false, players: [], rosterLoading: false, rosterError: false,
});

/** Injectable controller for route/reconnect cleanup and out-of-order watch replies. */
export function createLobbyDiscovery({ net, target = createStore(emptyLobbyDiscovery()) }) {
  let active = false;
  let connected = false;
  let generation = 0;
  let watchKey = null;
  let wanted = { list: false, page: 0, roster: false };
  let rosterGeneration = 0;
  let unsubscribe = [];

  function apply(message) {
    if (!active || !connected || !message || typeof message !== 'object') return;
    const counts = {};
    for (const key of ['online', 'roomCount', 'matchCount', 'playingCount', 'joinableCount']) {
      if (Number.isInteger(message[key]) && message[key] >= 0) counts[key] = message[key];
    }
    const patch = { ...counts, ready: true, error: false };
    // A pushed old page may race a page change. Its summary is useful, its list is not.
    const pages = Math.max(1, Number(message.totalPages) || 1);
    const clamped = wanted.page >= pages && message.page === pages - 1;
    if (wanted.list && Array.isArray(message.rooms) && (message.page === wanted.page || clamped)) {
      wanted = { list: true, page: message.page };
      watchKey = `true:${message.page}`;
      Object.assign(patch, {
        rooms: message.rooms, page: message.page,
        totalPages: pages,
        pageSize: Number(message.pageSize) || LOBBY_PAGE_SIZE, loading: false,
      });
    } else if (!wanted.list) patch.loading = false;
    target.set(patch);
  }

  function watch(force = false) {
    if (!active || !connected) return;
    const key = `${wanted.list}:${wanted.page}`;
    if (!force && key === watchKey) return;
    watchKey = key;
    const ticket = ++generation;
    target.set({ loading: true, error: false });
    Promise.resolve().then(() => {
      if (!active || !connected || ticket !== generation) return null;
      return net.request('lobby.watch', { on: true, list: wanted.list, page: wanted.page });
    }).then((reply) => {
      if (!active || !connected || ticket !== generation) return;
      if (reply?.t === 'lobby.state') apply(reply);
      // An unchanged view is acknowledged with ok, not an identical directory frame.
      target.set({ loading: false });
    }).catch(() => {
      if (!active || !connected || ticket !== generation) return;
      watchKey = null; // explicit retry or reconnect may request again
      target.set({ loading: false, error: true });
    });
  }

  function onStatus(status) {
    const next = status?.status === 'online';
    if (next === connected) return;
    connected = next;
    watchKey = null;
    generation++;
    if (connected) watch();
    else target.set({ ...emptyLobbyDiscovery(), open: wanted.list, page: wanted.page });
  }

  /**
   * D039: fetch the online roster. Not part of the watch subscription — the server pushes a bare count and the roster
   * only while its modal is open, so presence churn costs nothing to anyone who never opens it.
   */
  function loadRoster() {
    if (!active || !connected || !wanted.roster) return;
    const ticket = ++rosterGeneration;
    target.set({ rosterLoading: true, rosterError: false });
    Promise.resolve().then(() => {
      if (!active || !connected || ticket !== rosterGeneration) return null;
      return net.request('lobby.online', {});
    }).then((reply) => {
      if (!active || !connected || ticket !== rosterGeneration) return;
      if (reply?.t === 'lobby.online') {
        const players = Array.isArray(reply.players)
          ? reply.players.filter((p) => p && typeof p.playerId === 'string' && typeof p.name === 'string')
          : [];
        target.set({ players, rosterLoading: false, rosterError: false });
        return;
      }
      target.set({ rosterLoading: false, rosterError: true });
    }).catch(() => {
      if (!active || !connected || ticket !== rosterGeneration) return;
      target.set({ rosterLoading: false, rosterError: true });
    });
  }

  return {
    target,
    start() {
      if (active) return;
      active = true;
      connected = net.status === 'online';
      unsubscribe = [
        net.on('lobby.state', (message) => {
          // request() handles rid replies with its generation guard; this listener handles pushes.
          if (message?.rid == null) apply(message);
        }),
        net.on('status', onStatus),        net.on('welcome', () => {
          if (!connected) onStatus({ status: 'online' });
          else watch();
        }),
      ];
      watch();
    },
    show() {
      if (wanted.list && wanted.page === 0 && target.get().open) return;
      wanted = { list: true, page: 0, roster: wanted.roster };
      target.set({ open: true, rooms: [], page: 0, error: false });
      watch();
    },
    close() {
      wanted = { list: false, page: 0, roster: wanted.roster };
      target.set({ open: false, rooms: [], page: 0, error: false });
      watch();
    },
    page(page) {
      if (!wanted.list) return;
      const next = Math.max(0, Math.min(9999, Math.floor(Number(page) || 0)));
      if (wanted.page === next) return;
      wanted = { list: true, page: next, roster: wanted.roster };
      target.set({ page: next, rooms: [], error: false });
      watch();
    },
    refresh() { watch(true); },
    /** D039: open the online roster and ask for a fresh copy. */
    openOnline() {
      if (!active) return;
      wanted = { ...wanted, roster: true };
      target.set({ onlineOpen: true, rosterError: false });
      loadRoster();
    },
    /** D039: close it and forget the copy — it is presence, and stale presence misleads. */
    closeOnline() {
      wanted = { ...wanted, roster: false };
      rosterGeneration++;
      target.set({ onlineOpen: false, players: [], rosterLoading: false, rosterError: false });
    },
    refreshOnline() { loadRoster(); },
    dispose() {
      if (!active) return;
      active = false;
      generation++;
      for (const stop of unsubscribe) stop();
      unsubscribe = [];
      if (connected) Promise.resolve().then(() => net.request('lobby.watch', { on: false })).catch(() => {});
      connected = false;
      watchKey = null;
    },
  };
}
