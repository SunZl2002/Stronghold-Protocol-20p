// 干员皮肤：客户端状态与同步 (docs/SKINS.md).
//
// Two different things live here, and keeping them apart is what makes 「按需安装」 work:
//
//   * the CATALOGUE (data/skins.json) — every skin the project knows about, installed or not: ids, names, series.
//     It carries no URLs, because a skin that is not installed has no files to point at.
//   * what is INSTALLED (data/assets.json → chars[charId].skins) — the skins whose models are actually on this
//     server. `availableSkins()` marks which is which, and the picker greys out (or offers to install) the rest.
//
// The choice itself is a plain `{ [chessId]: skinId }` map, persisted per browser in localStorage and mirrored to
// the server through `room.skins` — the same shape and the same wiring as the operator loadout (ui/loadoutSync.js),
// except that this one is PUBLIC: the server puts it in `Match.publicView().players[]`, which is how a teammate
// sees your skin.

import { createStore, loadPref, savePref } from '../store.js';
import { data } from '../data.js';
import { chessSkinPortraitUrl, chessSkinAvatarUrl, chessPortraitUrl, chessAvatarUrl } from './assetUrls.js';

export const SKINS_PREF = 'skins';
/** Marks that this browser has already been seeded with the default skins (see installDefaultSkins). */
export const SKINS_DEFAULT_PREF = 'skinsDefault';
export const SYNC_DEBOUNCE_MS = 500;
export const RETRY_MS = 1500;

function readStored() {
  const raw = loadPref(SKINS_PREF, null);
  const out = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [chessId, skinId] of Object.entries(raw)) {
      if (typeof chessId === 'string' && typeof skinId === 'string' && skinId) out[chessId] = skinId;
    }
  }
  return out;
}

/**
 * 默认皮肤 (D037): every operator whose skin has an installed model wears it. Keyed by CHESS id — the catalogue and
 * the manifest are grouped by OPERATOR id, and a choice is per chess (docs/SKINS.md). Only chess that may wear a skin
 * take one: never a golden / hidden / 自选 record, which is why this mirrors `isLoadoutSlot`.
 *
 * Prefers a skin whose Spine model is actually on this server: a source-missing skin (3 of the 174 today) still gets
 * a picker entry, but it would fall back to the operator's own model, so a dressed operator would look undressed.
 * @param {typeof data} [store] the data store to read (tests pass their own; the app uses the singleton)
 * @returns {Record<string, string>} `{ [chessId]: skinId }`
 */
export function defaultSkins(store = data) {
  const cat = store.get('skins');
  const assets = store.get('assets');
  if (!cat || !cat.chars || !assets || !assets.chars) return {};
  const chessList = store.list('chess');   // keyed by chess id, so chess.json must be loaded too (see the guard below)
  if (!chessList.length) return {};
  const out = {};
  for (const [charId, list] of Object.entries(cat.chars)) {
    if (!Array.isArray(list) || !list.length) continue;
    const installed = assets.chars[charId]?.skins || {};
    const pick = list.find((s) => installed[s.id]?.spine) || null;
    if (!pick) continue; // nothing installed for this operator: leave it on its own model
    for (const c of chessList) {
      if (c.charId !== charId || c.isGolden || c.visible === false || c.isHidden || c.isDiy) continue;
      out[c.chessId] = pick.id;
    }
  }
  return out;
}

/**
 * Dress every operator on a browser that has never chosen a skin (D037, the owner's request of 2026-10-14).
 *
 * Runs only once per browser and only with the catalogue AND the manifest loaded, because the default cannot be
 * computed at module load (`data` is still idle then — the store would come up empty). `sp.pref.skinsDefault` records
 * that the seed happened, so a player who deliberately clears the skins keeps them cleared: without that marker an
 * empty stored map is indistinguishable from a fresh browser and the defaults would come back on every reload.
 *
 * Safe to call repeatedly (every `loadSkinData`), and it never overwrites an existing choice.
 * @returns {boolean} whether it seeded anything
 */
export function installDefaultSkins() {
  if (loadPref(SKINS_DEFAULT_PREF, false)) return false;
  // all three, because the default map is keyed by chess id: the catalogue and the manifest alone yield nothing
  if (data.status('skins') !== 'ready' || data.status('assets') !== 'ready' || data.status('chess') !== 'ready') return false;
  const seeded = defaultSkins();
  savePref(SKINS_DEFAULT_PREF, true);
  if (Object.keys(seeded).length) setSkins({ ...seeded, ...skinsStore.get().entries }); // an existing pick wins
  return true;
}

/**
 * The chosen skins (per browser), the sync state, and the skin currently being installed — kept apart from the
 * app store for the same reason the loadout is.
 */
export const skinsStore = createStore({ entries: readStored(), sync: 'idle' });

/** Replace the whole selection (persisted at once; the sync picks the change up). */
export function setSkins(entries) {
  const next = {};
  for (const [chessId, skinId] of Object.entries(entries && typeof entries === 'object' ? entries : {})) {
    if (typeof skinId === 'string' && skinId) next[chessId] = skinId;
  }
  savePref(SKINS_PREF, next);
  skinsStore.set({ entries: next });
}

/** Choose a skin for one operator. */
export function setSkin(chessId, skinId) {
  setSkins({ ...skinsStore.get().entries, [chessId]: skinId });
}

/** Drop one operator's choice (it goes back to its default model). */
export function clearSkin(chessId) {
  const next = { ...skinsStore.get().entries };
  delete next[chessId];
  setSkins(next);
}

/** The skin this browser picked for an operator, or null. */
export const skinFor = (chessId) => skinsStore.get().entries[chessId] || null;

const str = (v) => (typeof v === 'string' && v ? v : null);

/**
 * The half-body portrait a card should draw for a chess: the chosen skin's when it has one, else the operator's own
 * — the same fallback `chessPortraitUrl` applies, so a caller only ever needs this one call.
 *
 * Reads the choice itself (`skinFor`), because every showing surface draws the LOCAL player's own operator: the
 * 商店卡片, the roster and the detail panels are all client-side and use this browser's choices.
 * @param {any} m manifest
 * @param {any} chess chess.json record
 * @param {string|null} [chessId] the id to read the choice by (defaults to the record's own)
 */
export function portraitFor(m, chess, chessId = null) {
  const id = str(chessId) || str(chess?.chessId);
  return chessSkinPortraitUrl(m, chess, id ? skinFor(id) : null) || chessPortraitUrl(m, chess);
}

/**
 * The 180×180 avatar a roster tile should draw for a chess: the chosen skin's, else the operator's own.
 * @param {any} m manifest
 * @param {any} chess chess.json record
 * @param {string|null} [chessId] the id to read the choice by (defaults to the record's own)
 */
export function avatarFor(m, chess, chessId = null) {
  const id = str(chessId) || str(chess?.chessId);
  return chessSkinAvatarUrl(m, chess, id ? skinFor(id) : null) || chessAvatarUrl(m, chess);
}

/**
 * Every skin of an operator (built-in full set).
 *
 * Takes the OPERATOR id (`char_498_inside`), not the chess id (`chess_char_1_01_a`): both data/skins.json and
 * data/assets.json are grouped per operator, while a skin *choice* is stored per chess — see ui/skinPicker.js.
 * @param {string} charId
 * @returns {{ id: string, name: string, group: string, installed: boolean }[]}
 */
export function availableSkins(charId) {
  const list = data.get('skins')?.chars?.[charId];
  if (!Array.isArray(list)) return [];
  return list.map((s) => ({ id: s.id, name: s.name, group: s.group || '', installed: true }));
}

/** Whether this install has the files for a skin (all 174 skins are built-in). @param {string} charId */
export function isInstalled(charId, skinId) {
  return true;
}

/**
 * Load what the picker needs (the catalogue, and the manifest that says what is installed). The default skins are
 * seeded the moment both arrive on a browser that has never chosen (D037) — `chess` comes along because the default is
 * keyed by chess id.
 */
export function loadSkinData() {
  const allReady = () => data.status('skins') === 'ready' && data.status('assets') === 'ready' && data.status('chess') === 'ready';
  if (allReady()) { installDefaultSkins(); return; }
  const off = data.subscribe(() => { if (allReady()) { off?.(); installDefaultSkins(); } });
  data.load('skins').catch(() => {});
  data.load('assets').catch(() => {});
  data.load('chess').catch(() => {});
}

/**
 * Keep the server's copy of this browser's skins current.
 *
 * Mirrors installLoadoutSync, minus the sanitising: the loadout has to be checked against data/chess.json before
 * it is sent (a stale entry would be dropped by the server), whereas a skinId needs no lookup to be sent — the
 * server keeps the entries whose chess it recognises and drops the rest, and an unknown skinId is harmless.
 * @param {{ net: any, timers?: { setTimeout: Function, clearTimeout: Function } }} deps
 * @returns {{ flush: () => Promise<void>, dispose: () => void }}
 */
export function installSkinsSync({ net, timers } = {}) {
  const T = timers || { setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms), clearTimeout: (id) => globalThis.clearTimeout(id) };
  let timer = null;
  let seq = 0;
  let pendingJson = null;
  let lastSent = null;
  let disposed = false;

  const setState = (sync) => { if (skinsStore.get().sync !== sync) skinsStore.set({ sync }); };
  const schedule = (ms = SYNC_DEBOUNCE_MS) => {
    if (disposed) return;
    T.clearTimeout(timer);
    setState('pending');
    timer = T.setTimeout(() => { timer = null; void flush(); }, ms);
  };

  async function flush() {
    if (disposed || net.status !== 'online') { setState('idle'); return; }
    try {
      const skins = skinsStore.get().entries;
      const json = JSON.stringify(skins);
      if (json === pendingJson) return;
      if (json === lastSent && pendingJson == null) { setState('synced'); return; }
      const my = ++seq;
      pendingJson = json;
      setState('sending');
      try {
        await net.request('room.skins', { skins });
        if (my !== seq) return;
        pendingJson = null;
        lastSent = json;
        setState('synced');
      } catch (err) {
        if (my !== seq) return;
        pendingJson = null;
        const code = err && err.code;
        if (code === 'RATE' || code === 'TIMEOUT' || code === 'OFFLINE') { schedule(RETRY_MS); return; }
        console.warn('[skins] room.skins refused', code, err && err.detail);
        setState('error');
      }
    } catch (e) {
      console.warn('[skins] sync failed', e);
      setState('error');
    }
  }

  const offWelcome = net.on('welcome', () => { lastSent = null; pendingJson = null; seq++; schedule(50); });
  const offStore = skinsStore.subscribe((s, prev) => { if (s.entries !== prev.entries) schedule(); });

  return {
    flush,
    dispose() {
      disposed = true;
      T.clearTimeout(timer);
      offWelcome?.();
      offStore?.();
    },
  };
}
