import { useState } from '../../vendor/hooks.module.js';
import { html, Button, Modal } from './components.js';
import { useStore } from '../store.js';
import { net } from '../net.js';
import { toastError } from './toasts.js';
import { DEFAULT_VERSION, roomVersion } from '../versions.js';
import { t } from '../../../shared/i18n.js';

/**
 * 「接管」 (20p): a spectator takes an AI teammate's seat directly — no vote.
 *
 * The entry only exists where it can be used: the viewer is a SPECTATOR of this match and there is an alive AI seat to
 * take. A seated player, a match without AI, a closed room option (同盟设置 → 允许观战者接替 AI, on by default), a solo room,
 * a non-default version and plugin content all draw nothing at all.
 *
 * The room option is on for a co-op room (the host can switch it off before the start) and the handover happens in 休整期
 * (PREP). The seat keeps everything the AI had — operators, gold, hand, board and the results it already earned — so it is
 * flagged as an inherited seat: none of it counts toward the newcomer's personal statistics or rewards
 * (server/aiTakeover.js, `aiTakeoverRound`).
 */
export function AiTakeoverPanel() {
  const room = useStore((s) => s.room), pub = useStore((s) => s.match.public), myId = useStore((s) => s.me.playerId);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  if (!room || room.aiTakeoverEnabled !== true || room.mode === 'solo' || roomVersion(room) !== DEFAULT_VERSION || room.content?.vanilla === false) return null;
  // nothing to draw: not a spectator, or no AI left to inherit
  const spectator = room.spectators?.some((s) => s.playerId === myId) === true;
  const bots = (pub?.players || []).filter((p) => p.isBot && p.alive && !p.left);
  if (!spectator || !bots.length) return null;
  const run = async (botId) => {
    if (busy) return;
    setBusy(true);
    try { await net.request('room.aiRequest', { botId }); setOpen(false); }
    catch (e) { toastError(e); }
    finally { setBusy(false); }
  };
  return html`<button type="button" class="btn ai-participation-entry" onClick=${() => setOpen(true)}>${t('接管')}</button>
    <${Modal} open=${open} onClose=${() => setOpen(false)} title=${t('接管')} width="min(800px,92vw)"
      actions=${html`<${Button} onClick=${() => setOpen(false)}>${t('关闭')}<//>`}>
      <p>${t('观战者可直接接管一个 AI 队友：休整期即可加入，不需要其他人投票；房主可在开局前关闭这个选项。')}</p>
      <p>${t('接替后的席位会带走 AI 此前的表现（干员、资金、手牌与战绩），因此不计入你的个人统计或奖励。')}</p>
      <div class="ai-requests">${bots.map((p) => html`<${Button} key=${p.playerId} disabled=${busy || pub?.phase !== 'PREP'}
        onClick=${() => run(p.playerId)}>${t('接管')} P${p.seat + 1} · ${p.name}<//>`)}</div>
    <//>`;
}
