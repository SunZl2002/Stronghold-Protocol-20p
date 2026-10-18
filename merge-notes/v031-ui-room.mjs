// Throwaway: public/js/screens/lobby.js — six additive hunks. This fork brings the D039 directory (online pill,
// roster, room list, quick match) and the announcements button; upstream 0.3.1 brings the test-mode room, the notices /
// S.W.E.E.P. report, and its topbar__tools grouping. The topbar pieces are split across two adjacent hunks, so they are
// composed once: hunk 4 ends with the announcement button, hunk 5 starts the grouped tools.
import fs from 'node:fs';

const cwd = process.argv[2];
const file = `${cwd}/public/js/screens/lobby.js`;
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
if (hunks.length !== 6) throw new Error(`期望 6 块，实际 ${hunks.length}`);

const repl = [
  // 1. imports: this fork's DEFAULT_SEATS / ROOM_CAPACITIES + upstream's MAX_SPECTATORS and confirmDialog
  [
    "import { DIFFICULTIES, DIFFICULTY_NAMES, DIFFICULTY_COLORS, ROOM_CODE_LEN, MAX_SEATS, MAX_SPECTATORS, DEFAULT_SEATS, ROOM_CAPACITIES, modeIdFor, ERR } from '../../../shared/constants.js';",
    "import { html, confirmDialog, Button, Icon, MicroLabel, Panel, TextField, PingPill, AvatarFrame, Tooltip, Spinner, DifficultyIcon, doctorNo } from '../ui/components.js';",
  ],
  // 2. imports: the D039 discovery module + upstream's notices button
  [
    "import { createLobbyDiscovery } from '../lobbyDiscovery.js';",
    "import { LobbyOnlinePill, LobbyOnlineRoster, LobbyDiscoveryPanel, LobbyRoomList } from '../ui/lobbyDiscovery.js';",
    "import { NoticesButton } from '../ui/notices.js';",
  ],
  // 3. room.create: this fork's capacity + upstream's test-mode field; keep quick match and the directory calls
  [
    '    const create = () => run(\'create\', () => net.request(\'room.create\', {',
    "      mode: roomMode, difficulty, ...(roomMode === 'coop' ? { capacity } : {}), ...(testMode && asTest ? { test: true } : {}),",
    '    }));',
    ...hunks[2].ours.slice(1),
  ],
  // 4. the left half of the topbar: this fork's pill / asset cache / announcements
  [
    '          <${LobbyOnlinePill} count=${discoveryState.online} connected=${online}',
    '            onOpen=${() => discovery.openOnline()} open=${discoveryState.onlineOpen} />',
    '          <${AssetCacheButton} />',
    '          <${AnnouncementButton} variant="secondary" />',
  ],
  // 5. the grouped tools: upstream's notices / settings / guide / S.W.E.E.P. + the install button
  [
    '          <${ResumeMatchButton} />',
    '          <span class="topbar__sep" aria-hidden="true"></span>',
    '          <div class="topbar__tools">',
    '            <${NoticesButton} />',
    '            <${SettingsButton} class="lobby-settings" variant="secondary" square=${true} />',
    '            <${GuideButton} class="lobby-guide" variant="secondary" square=${true} />',
    '            <${Button} variant="secondary" size="sm" icon="book" class="lobby-sweep" onClick=${() => setSweepOpen(true)}',
    "              title=${t('S.W.E.E.P.报告：盟约、策略与敌方资料')}>S.W.E.E.P.<//>",
    '            <${PwaInstallButton} class="lobby-pwa" square=${true} />',
    '          </div>',
  ],
  // 6. the overlays: this fork's room list + online roster, upstream's S.W.E.E.P. report
  [
    ...hunks[5].ours,
    "      ${sweepOpen ? html`<${SweepReport} onClose=${() => setSweepOpen(false)} />` : null}",
  ],
];

let out = [...lines];
for (let k = hunks.length - 1; k >= 0; k--) {
  const { s, e } = hunks[k];
  out = [...out.slice(0, s), ...repl[k], ...out.slice(e + 1)];
}
fs.writeFileSync(file, out.join('\n'), 'utf8');
const text = out.join('\n');
console.log(`  screens/lobby.js 残留标记 ${(text.match(/^(<{7}|>{7})/gm) || []).length}`);
for (const k of ['LobbyOnlinePill', 'AnnouncementButton', 'NoticesButton', 'lobby-sweep', 'SweepReport', 'ResumeMatchButton', 'quickMatch', 'asTest', 'AssetCacheButton', 'LobbyOnlineRoster']) {
  console.log(`  ${text.includes(k) ? 'ok' : '!!'} ${k}`);
}
