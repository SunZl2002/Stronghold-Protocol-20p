// Throwaway: public/js/screens/game.js — five additive hunks. This fork brings the chat button, emotes and the token-based
// draft busy state; upstream 0.3.1 brings the test console, room rules (morphMode), offers (OfferOverlay) and spMarks.
// The ChoiceOverlay keeps THIS FORK's `busyToken` contract, because this fork's choiceOverlay.js is the one that stayed.
import fs from 'node:fs';

const cwd = process.argv[2];
const file = `${cwd}/public/js/screens/game.js`;
const lines = fs.readFileSync(file, 'utf8').split('\n');

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
if (hunks.length !== 5) throw new Error(`期望 5 块，实际 ${hunks.length}`);

const repl = [
  // 1. the away/autoplay chat entry (this fork) + the ended banner + upstream's test console
  [...hunks[0].ours, hunks[0].theirs[1]],
  // 2. both sides declare different locals here: editable (this fork) and roomRules / morphMode (upstream)
  [...hunks[1].ours, ...hunks[1].theirs],
  // 3. the root className: this fork's has-chat / is-spectator, upstream's offer-driven has-sp and spdraft
  [
    hunks[2].ours[0],
    hunks[2].ours[1],
    "    return html`<div class=${cx('screen', 'gm', `gm--${mode}`, hasChat && 'has-chat', spectator && 'is-spectator', drag && 'is-dragging', barCollapsed && 'is-collapsed', (sp || hasPersonalChoice || offerBlocksPrep(pub?.offers)) && 'has-sp', sp && 'has-spdraft', pen && 'is-pen', readyWhy && 'has-readywhy')}",
  ],
  // 4. TeamPanel: this fork's emotes row + upstream's spMarks
  [...hunks[3].ours, hunks[3].theirs[1]],
  // 5. upstream's OfferOverlay + this fork's token-based ChoiceOverlay
  [hunks[4].theirs[0], ...hunks[4].ours],
];

let out = [...lines];
for (let k = hunks.length - 1; k >= 0; k--) {
  const { s, e } = hunks[k];
  out = [...out.slice(0, s), ...repl[k], ...out.slice(e + 1)];
}
fs.writeFileSync(file, out.join('\n'), 'utf8');
const text = out.join('\n');
console.log(`  game.js 残留标记 ${(text.match(/^(<{7}|>{7})/gm) || []).length}`);
for (const k of ['MatchChatButton', 'TestConsole', 'offerBlocksPrep', 'spMarks', 'OfferOverlay', 'busyToken', 'emoteNow', 'morphMode']) {
  console.log(`  ${text.includes(k) ? 'ok' : '!!'} ${k}`);
}
