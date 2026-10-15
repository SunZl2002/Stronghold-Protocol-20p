// Chat danmaku (I014): a chat message flies across the match screen ONCE, carrying the speaker's 策略 icon, name and
// text. 设置 → 聊天弹幕 turns it on; OFF IS THE OLD BEHAVIOUR, so nothing is rendered unless the switch is on.
//
// A presentation layer over the SAME `m.chat` message the chat panel already consumes — no protocol change and no new
// wire state. The picture is the speaker's STRATEGY identity (`bandId`, public in `m.public.players[]`), rendered by
// the very PlayerAvatar the chat rows use, so a fly-by and its chat line cannot disagree. The operator avatar is NOT
// used: `ops`/`charId` never reach other players, and a player has no single "current operator" to show anyway (the
// owner chose the strategy icon for exactly this reason, 2026-10-15).
import { html } from './components.js';
import { PlayerAvatar } from './gameComponents.js';
import { useStore, createStore } from '../store.js';
import { useEffect } from '../../vendor/hooks.module.js';
import { net } from '../net.js';
import { chatStore } from '../matchChat.js';
import { t } from '../../../shared/i18n.js';

/** How many fly at once before new ones are dropped. A busy room would otherwise curtain the whole board. */
export const DANMAKU_MAX = 5;
/** One crossing, in milliseconds. The CSS animation uses the SAME number (`--danmaku-dur` in game-panels.css). */
export const DANMAKU_MS = 9000;

/** @typedef {{ id: number, seq: number, name: string, text: string, seat: number|null, spectator: boolean, lane: number }} Danmaku */

export const danmakuStore = createStore({ items: /** @type {Danmaku[]} */ ([]), nextId: 1 });

/**
 * Seqs already flown, PER MATCH id. Outside the store, so clearing the store cannot re-open the door to replays.
 *
 * Scoped by match on purpose: `seq` restarts at 1 in every match, so a flat set would swallow the first messages of
 * the NEXT match (their seqs were used by the previous one — a bug that would only show up on the second game).
 */
let seenSeqs = new Set();
let seenMatchId = null;

/** 设置 → 聊天弹幕, injected as a policy (importing ui/settings.js here would close a cycle through gameComponents). */
let enabledPolicy = () => false;
/** The current match's participants, injected by the match screen: (playerId) => participant | null. */
let participantsFor = () => null;

export function setDanmakuEnabledPolicy(fn) {
  if (typeof fn === 'function') enabledPolicy = fn;
}

/**
 * Hand over the current match's participant list so a fly-by can carry its STRATEGY identity. The match screen owns
 * `m.public.players`; re-injecting on each public update keeps this cheap and avoids a second subscription.
 * @param {() => (Map<string, any>|null)} fn
 */
export function setDanmakuParticipants(fn) {
  if (typeof fn === 'function') participantsFor = fn;
}

/** Forget every fly-by and the seq memory — a new match starts clean (the store is RAM-only). */
export function resetDanmaku() {
  seenSeqs = new Set();
  seenMatchId = null;
  if (danmakuStore.get().items.length) danmakuStore.set({ items: [] });
}

/**
 * Show one message as a fly-by. Returns its id, or 0 when refused.
 *
 * The refusals are the interesting part:
 *  - 设置 → 聊天弹幕 is off (opt-in; off must be the old behaviour exactly);
 *  - the caller says nothing is on screen to fly over (the match view is not mounted);
 *  - this (matchId, seq) already flew. `seq` is monotonic WITHIN a match, so a repeat is a REPLAY — a reconnect
 *    republishes the retained history (`m.chatState`), and without this guard every reconnect re-flew the backlog;
 *  - the cap is reached. A dropped message is still in the chat panel, so nothing is lost by dropping it here.
 * @param {{ seq: number, playerId?: string, name?: string, text: string, seat?: number|null, spectator?: boolean }} entry
 * @param {{ visible?: boolean, matchId?: string|null }} [opts]
 */
export function pushDanmaku(entry, { visible = true, matchId = null } = {}) {
  if (!enabledPolicy()) return 0;
  if (!visible) return 0;
  if (!entry || !Number.isSafeInteger(entry.seq) || typeof entry.text !== 'string' || !entry.text) return 0;
  if (matchId !== seenMatchId) { seenMatchId = matchId; seenSeqs = new Set(); }
  if (seenSeqs.has(entry.seq)) return 0;
  const s = danmakuStore.get();
  if (s.items.length >= DANMAKU_MAX) return 0;
  seenSeqs.add(entry.seq);
  const id = s.nextId;
  // A lane per fly-by keeps two crossings from overlapping into one unreadable line; stable for a given id.
  const lane = (id - 1) % DANMAKU_MAX;
  danmakuStore.set({
    items: [...s.items, {
      id, seq: entry.seq, playerId: String(entry.playerId || ''), name: String(entry.name || ''),
      text: entry.text, seat: Number.isInteger(entry.seat) ? entry.seat : null,
      spectator: !!entry.spectator, lane,
    }],
    nextId: id + 1,
  });
  return id;
}

/** Drop one fly-by when its animation ends (the component calls this on `animationend` — never a poll or a timer). */
export function dropDanmaku(id) {
  const s = danmakuStore.get();
  const items = s.items.filter((x) => x.id !== id);
  if (items.length !== s.items.length) danmakuStore.set({ items });
}

/**
 * The fly-by layer. Renders nothing at all while the switch is off or no message is flying, so a browser that never
 * turns this on is byte-identical to before. Positioned by `lane`; removed by its own `animationend`.
 *
 * It listens to the WIRE message `m.chat` rather than watching chatStore for new rows, and that is deliberate:
 * `m.chat` is a live push, while `m.chatState` is the reconnect snapshot. Subscribing to the push is what makes
 * "only fly what is being said now" true BY CONSTRUCTION — a reconnect's retained history can never re-fly.
 */
export function DanmakuLayer() {
  const s = useStore((v) => v, undefined, danmakuStore);
  useEffect(() => {
    const off = net.on('m.chat', (msg) => pushDanmaku(msg, { matchId: chatStore.get().matchId }));
    return () => { off(); resetDanmaku(); };
  }, []);
  if (!s.items.length) return null;
  const participants = participantsFor();
  return html`<div class="danmaku" aria-live="polite" aria-atomic="false" data-testid="danmaku-layer">
    ${s.items.map((m) => {
      // Same shape the chat row builds, so PlayerAvatar resolves the SAME strategy icon here and there.
      const participant = (participants && participants.get(m.playerId)) || {};
      const player = { ...participant, playerId: m.playerId, name: participant.name || m.name, seat: m.seat };
      // A spectator is not a match participant: they live in room.spectators (playerId, name, connected) and are NOT in
      // m.public.players, so they carry no `bandId` and PlayerAvatar falls back to their name's first character — the
      // 「没选干员就只显示名称和内容」 path, reached for a different reason. The 观战 mark is the same msgid the chat row
      // uses (ui/matchChat.js reads m.spectator too), so the two never disagree.
      return html`<div key=${m.id} class="danmaku__item" style=${`--lane:${m.lane}`}
        onAnimationEnd=${() => dropDanmaku(m.id)}>
        <span class="danmaku__avatar"><${PlayerAvatar} player=${player} size="sm" /></span>
        <span class="danmaku__name">${player.name}${m.spectator ? ` · ${t('观战')}` : ''}</span>
        <span class="danmaku__text">${m.text}</span>
      </div>`;
    })}
  </div>`;
}
