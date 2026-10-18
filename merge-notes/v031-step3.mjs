// v0.3.1 merge, step 3 (replayable). Run AFTER v031-step2.mjs and the protocol/settings helpers.
//
// Covers the five UI files, all "both sides added":
//   * ui/gameActions.js  - upstream's `offer` (plugin interaction window) beside this fork's `choice` with its draft/group
//     scope; both call shapes are accepted (a bare choiceId string still works).
//   * ui/detailPanel.js  - this fork's skin section + foreignSkin, upstream's multiple garrisons + morphMode/onUnequip.
//   * ui/choiceOverlay.js- hunks 1/2/4 are this fork's superset (group tabs, decision order, expanded grid, per-group
//     countdown); hunk 3 is a union (our MicroLabel + their deco and spov__name span + our richer subtitle).
//   * screens/lobby.js   - this fork's D039 directory and announcements button, upstream's test rooms, notices and the
//     S.W.E.E.P. report; the topbar is composed across two adjacent hunks so nothing is emitted twice.
//   * screens/game.js    - this fork's chat button / emotes / token-based busy state, upstream's test console, room rules,
//     OfferOverlay and spMarks. ChoiceOverlay keeps busyToken because THIS fork's choiceOverlay.js is the one that stayed.
 */
import { execFileSync } from 'node:child_process';

const cwd = process.argv[2];
for (const s of ['v031-ui-detail', 'v031-ui-choice', 'v031-ui-room', 'v031-ui-game']) {
  execFileSync(process.execPath, [new URL(`./${s}.mjs`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), cwd], { stdio: 'inherit' });
}

// gameActions.js: the one hunk that is not covered by a helper (a single-line union)
const fs = await import('node:fs');
const file = `${cwd}/public/js/ui/gameActions.js`;
const text = fs.readFileSync(file, 'utf8');
const from = [
  '<<<<<<< HEAD',
  "  choice: (idx, opts = {}) => act('g.choice', { idx, ...choiceRequestScope(opts) }),",
  '=======',
  "  offer: (offer, idx, refresh = false, cardId) => act(refresh ? 'g.offerRefresh' : 'g.offer', { offerId: offer.id, pluginId: offer.pluginId, seq: offer.seq, idx, cardId }),",
  "  choice: (idx, choiceId) => act('g.choice', choiceId === undefined ? { idx } : { idx, choiceId }),",
  '>>>>>>> upstream/v031',
].join('\n');
const to = [
  '  // upstream 0.3.1: a plugin interaction window (g.offer / g.offerRefresh, PLUGINS §10b)',
  "  offer: (offer, idx, refresh = false, cardId) => act(refresh ? 'g.offerRefresh' : 'g.offer', { offerId: offer.id, pluginId: offer.pluginId, seq: offer.seq, idx, cardId }),",
  '  // this fork passes the draft/group scope (20-player parallel drafts) and a chosen choiceId; upstream passes a bare',
  '  // choiceId as the second argument - both shapes are accepted',
  "  choice: (idx, opts = {}) => act('g.choice', { idx, ...choiceRequestScope(typeof opts === 'string' ? { choiceId: opts } : opts) }),",
].join('\n');
if (text.includes(from)) { fs.writeFileSync(file, text.replace(from, to), 'utf8'); console.log('  ok gameActions.js'); }
else console.log('  !! gameActions.js 片段未找到');
