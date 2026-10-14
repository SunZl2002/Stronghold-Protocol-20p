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

import { createStore, loadPref, savePref, useStore, shallowEqual } from '../store.js';
import { useReducer, useLayoutEffect } from '../../vendor/hooks.module.js';
import { data } from '../data.js';
import { chessSkinPortraitUrl, chessSkinAvatarUrl, chessPortraitUrl, chessAvatarUrl } from './assetUrls.js';

export const SKINS_PREF = 'skins';
/** Marks that this browser has already been seeded with the default skins (see installDefaultSkins). */
export const SKINS_DEFAULT_PREF = 'skinsDefault';
/**
 * The chess that took their skin from the one-click dress (`installDefaultSkins`), not from the player.
 *
 * Needed so 设置 → 一键装备皮肤 can be switched off WITHOUT touching a single stored choice: the entries stay, and
 * `skinFor` simply stops resolving the ones this list names. Before it existed, switching off deleted every entry the
 * seed could reproduce (`clearDefaultSkins`), which also deleted the player's own picks whenever they happened to match
 * a default, and left nothing to restore — switching back on could only re-seed.
 */
export const SKINS_AUTO_PREF = 'skinsAutoSeeded';
export const SYNC_DEBOUNCE_MS = 500;
export const RETRY_MS = 1500;

/** The chess ids currently dressed by the one-click seed. */
function readAutoSeeded() {
  const raw = loadPref(SKINS_AUTO_PREF, null);
  return new Set(Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : []);
}

/**
 * `readAutoSeeded()` is a localStorage read and `skinFor` runs for every card on every render, so the set is cached
 * here and refreshed by the only writer.
 */
let autoSeededCache = readAutoSeeded();

/** Remember which chess the one-click seed dressed (empty set when the dress is not active). */
function writeAutoSeeded(ids) {
  savePref(SKINS_AUTO_PREF, [...ids]);
  autoSeededCache = new Set(ids);
}

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
  // which chess take their skin from the dress rather than from the player: an existing pick is the player's, and is
  // never marked (so 一键装备 off never hides it)
  const auto = new Set();
  for (const chessId of Object.keys(seeded)) if (!Object.hasOwn(skinsStore.get().entries, chessId)) auto.add(chessId);
  writeAutoSeeded(auto);
  // The entries are written even when the dress switch is OFF (the seed runs once per browser, before the player can
  // reach the settings): `skinFor` decides whether they are WORN, so switching the dress on later needs no re-seed.
  if (Object.keys(seeded).length) setSkins({ ...seeded, ...skinsStore.get().entries }); // an existing pick wins
  return true;
}

/**
 * Drop the one-click dress (settings → 一键装备皮肤 switched off).
 *
 * Removes every skin that `installDefaultSkins` would have seeded for the CURRENT catalogue — i.e. the defaults —
 * and leaves anything the player picked by hand. It cannot tell the two apart in the stored map (both are just an
 * entry), so it removes exactly the set a fresh seed would have produced: a hand-picked skin that happens to be the
 * same default is indistinguishable and goes too, which is the honest reading of "关闭一键装备" (the player can pick
 * it again, and the picker is one click away).
 *
 * Keeps the seeded marker so a later reload does not resurrect the defaults, and returns how many it removed.
 * @returns {number}
 */
/**
 * Turn the one-click dress off, WITHOUT touching a single stored choice (settings → 一键装备皮肤).
 *
 * Nothing is deleted: the entries stay exactly as they are, and `skinFor` stops resolving the ones the seed dressed
 * (`SKINS_AUTO_PREF`, recorded by `installDefaultSkins`). That is what makes the two switches independent — 显示皮肤
 * stays the display switch and this one only decides whether the DEFAULTS are worn, so switching it off and on again
 * is lossless.
 *
 * It used to delete the entries a re-seed could reproduce (`clearDefaultSkins`). That silently threw away the
 * player's own picks whenever one matched a default, and left nothing to restore — the old `restoreDefaultSkins`
 * could only re-seed. The report was exactly that: 关闭一键装备皮肤 cleared the shop art even though 显示皮肤 was on.
 * @returns {number} how many chess stopped being dressed
 */
export function clearDefaultSkins() {
  const auto = readAutoSeeded();
  if (!auto.size) return 0;
  writeAutoSeeded(new Set());   // the dress is off; the entries stay
  return auto.size;
}

/**
 * Put the one-click dress back (settings → 一键装备皮肤 switched on again).
 *
 * Re-marks whatever the seed would dress right now, on top of the entries already stored, and never overwrites a
 * choice that is not part of the seed. Because switching off never deleted anything, this is where the player's own
 * picks come back too — including one they made while the dress was off (`setSkin` re-marks it as theirs).
 * @returns {number} how many chess the dress now covers
 */
export function restoreDefaultSkins() {
  const seeded = defaultSkins();
  const auto = new Set();
  for (const chessId of Object.keys(seeded)) {
    // a chess the player dressed themselves is theirs: only chess with no entry at all become "auto" again
    if (!Object.hasOwn(skinsStore.get().entries, chessId)) auto.add(chessId);
  }
  writeAutoSeeded(auto);
  return auto.size;
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

/** Choose a skin for one operator. A pick made by hand is never "auto", so 一键装备 off will not hide it. */
export function setSkin(chessId, skinId) {
  const auto = readAutoSeeded();
  if (auto.delete(chessId)) writeAutoSeeded(auto);
  setSkins({ ...skinsStore.get().entries, [chessId]: skinId });
}

/** Drop one operator's choice (it goes back to its default model). */
export function clearSkin(chessId) {
  const auto = readAutoSeeded();
  if (auto.delete(chessId)) writeAutoSeeded(auto);
  const next = { ...skinsStore.get().entries };
  delete next[chessId];
  setSkins(next);
}

/**
 * The skin this browser picked for an operator, or null.
 *
 * THE global view switch is applied here, at the single read point, so every caller — a component through `useSkin`,
 * a plain function like `portraitFor`, the canvas renderer, `fallbackField`'s paint-time read — obeys it without
 * repeating the test. The store itself keeps the choices: turning the switch back on restores them, and nothing is
 * sent to the server differently because of a display setting.
 *
 * Components must still subscribe (that is what `useSkin` is for): this function cannot repaint anything on its own.
 */
export const skinFor = (chessId) => {
  if (!skinsVisible()) return null;                                             // 设置 → 显示皮肤
  const entry = skinsStore.get().entries[chessId] || null;
  if (!entry) return null;
  // 设置 → 一键装备皮肤: an entry the DRESS put there is only worn while the dress is on. The player's own picks are
  // never in this set, so this is the whole precedence rule: 显示皮肤 decides whether any skin shows at all, and 一键
  // 装备 decides only whether the automatic ones count. Nothing is deleted either way.
  if (!skinsAutoEquip() && autoSeededCache.has(chessId)) return null;
  return entry;
};

const str = (v) => (typeof v === 'string' && v ? v : null);

/**
 * The global view switch (settings → 干员皮肤, `skinsOn`), read as a POLICY injected by ui/settings.js.
 *
 * Why not import the settings store here: ui/settings.js reaches this module through
 * gameComponents.js (`skins.js → settings.js → gameComponents.js → skins.js`), so importing it would close a cycle.
 * settings.js calls this once at module scope instead, which keeps the dependency one-way.
 *
 * Default true so a browser that never loaded the settings module (a unit test, a partial bundle) behaves exactly as
 * it did before the switch existed.
 */
let skinsShown = () => true;
/** @param {() => boolean} fn whether this browser draws skins at all */
export function setSkinsPolicy(fn) {
  if (typeof fn === 'function') skinsShown = fn;
}

/**
 * The one-click dress switch (settings → 均装备皮肤, `skinsAutoEquip`), the same injected-policy pattern as above.
 * Default true: D037's behaviour is what a browser that never loaded settings should keep.
 */
let skinsAuto = () => true;
/** @param {() => boolean} fn whether this browser dresses its operators automatically */
export function setSkinsAutoPolicy(fn) {
  if (typeof fn === 'function') skinsAuto = fn;
}

/** Whether the one-click dress is on (settings → 一键装备皮肤). */
export function skinsAutoEquip() {
  try { return skinsAuto() !== false; } catch { return true; }
}

/** Whether this browser draws skins at all (the global switch). */
export function skinsVisible() {
  try { return skinsShown() !== false; } catch { return true; }
}

/**
 * A cheap "the settings changed" subscription: force a re-render whenever the policy version moves.
 *
 * `setSkinsPolicy` is injected exactly once, so watching a version counter is what makes the switch live — a
 * component that only read `skinsVisible()` at render time would keep the art it was drawn with until something else
 * repainted it (the same class of bug as the unsubscribed card).
 */
let policyVersion = 0;
const policySubs = new Set();
export function bumpSkinsPolicy() {
  policyVersion++;
  for (const fn of [...policySubs]) { try { fn(policyVersion); } catch { /* a listener must not break the bump */ } }
}

/** Re-render on every `bumpSkinsPolicy` (the settings store calls it when the switch moves). */
function useSettingsVersion() {
  const [, force] = useReducer((c) => c + 1, 0);
  useLayoutEffect(() => {
    policySubs.add(force);
    return () => policySubs.delete(force);
  }, []);
}

/**
 * Re-render a component when THIS operator's skin choice or the global switch changes, and return the skin to draw —
 * `null` when skins are switched off, so every caller falls back to the operator's own art without knowing why.
 *
 * `portraitFor`/`avatarFor` read `skinFor` directly, which makes them pure but INVISIBLE to a component's own
 * subscriptions: a roster row subscribes to the loadout store (its skills, its modules) and nothing re-renders it
 * when the skin picker writes a new skin, so the card kept the art it was first drawn with until the row happened
 * to re-render for another reason. Subscribing per chess id — rather than to the whole store — keeps a skin change
 * from repainting all 112 rows.
 *
 * @param {string|null|undefined} chessId the chess whose choice to watch
 * @returns {string|null} the chosen skin id, or null
 */
export function useSkin(chessId) {
  const id = str(chessId);
  const entries = useStore((s) => s.entries, shallowEqual, skinsStore);
  // subscribed, not read once: flipping EITHER switch must repaint what is already on screen
  useSettingsVersion();
  // resolved through `skinFor` rather than re-deriving it here: one place decides what is worn (the view switch, then
  // the dress switch on top), so a component and a plain caller can never disagree about the same chess
  void entries;
  return id ? skinFor(id) : null;
}

/** The global switch alone, as a subscription (a component that shows no per-operator art still needs to repaint). */
export function useSkinsVisible() {
  useSettingsVersion();
  return skinsVisible();
}

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
