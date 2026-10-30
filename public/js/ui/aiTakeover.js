import { useState } from '../../vendor/hooks.module.js';
import { html, Button, Modal } from './components.js';
import { useStore } from '../store.js';
import { net } from '../net.js';
import { toastError } from './toasts.js';
import { DEFAULT_VERSION, roomVersion } from '../versions.js';
import { t } from '../../../shared/i18n.js';

/**
 * 「AI 接管」 (20p): a spectator takes an AI teammate's seat directly — no vote.
 *
 * The room option 「允许观战者接替 AI」 is on for a co-op room (the host can switch it off in 同盟设置 before the start),
 * the seat must still be an alive AI, and the handover happens in 休整期 (PREP). The seat keeps everything the AI had
 * received — inventory, gold, board and the results it already earned — so it is flagged as an inherited seat: none of it
 * counts toward the newcomer's personal statistics or rewards (server/aiTakeover.js, `aiTakeoverRound`).
 */
export function AiTakeoverPanel() {
  const room = useStore((s) => s.room), pub = useStore((s) => s.match.public), myId = useStore((s) => s.me.playerId);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  if (!room || room.aiTakeoverEnabled !== true || room.mode === 'solo' || roomVersion(room) !== DEFAULT_VERSION || room.content?.vanilla === false) return null;
  const run = async (botId) => {
    if (busy) return;
    setBusy(true);
    try { await net.request('room.aiRequest', { botId }); setOpen(false); }
    catch (e) { toastError(e); }
    finally { setBusy(false); }
  };
  const spectator = room.spectators?.some((s) => s.playerId === myId);
  const bots = (pub?.players || []).filter((p) => p.isBot && p.alive && !p.left);
  return html`<button type="button" class="btn ai-participation-entry" onClick=${() => setOpen(true)}>${t('AI 接管')}</button>
    <${Modal} open=${open} onClose=${() => setOpen(false)} title=${t('AI 接管')} width="min(800px,92vw)"
      actions=${html`<${Button} onClick=${() => setOpen(false)}>${t('关闭')}<//>`}>
      <p>${t('观战者可直接接管一个 AI 队友：休整期即可加入，不需要其他人投票；房主可在开局前关闭这个选项。')}</p>
      <p>${t('接替后的席位会带走 AI 此前的表现（干员、资金、手牌与战绩），因此不计入你的个人统计或奖励。')}</p>
      ${spectator
        ? (bots.length
          ? html`<div class="ai-requests">${bots.map((p) => html`<${Button} key=${p.playerId} disabled=${busy || pub?.phase !== 'PREP'}
              onClick=${() => run(p.playerId)}>${t('接管')} P${p.seat + 1} · ${p.name}<//>`)}</div>`
          : html`<p class="t-dim">${t('当前没有可接管的 AI 队友。')}</p>`)
        : html`<p class="t-dim">${t('只有观战者可以接管 AI 队友；你在这局里有自己的席位。')}</p>`}
    <//>`;
}
