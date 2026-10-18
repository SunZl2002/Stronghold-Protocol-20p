// v0.3.1 merge, step 10: server/net.js — this file is THIS FORK's transport: the wire codec (`wireVersionOf`,
// `prepareMessage`, `sendPrepared`, `compactWire`), the emergency socket set and `SessionRegistry.byToken(token,
// { allowExpired })`. Upstream 0.3.1 has none of that, so taking upstream's side wholesale deletes the compression layer.
// The file stays ours; the only thing upstream changed here that matters is the shape of a skin selection, which is now
// keyed by operator charId — folded into the doc comment below.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const cwd = process.argv[2];
execFileSync('git', ['-C', cwd, 'checkout', '--ours', '--', 'server/net.js'], { stdio: 'inherit' });

const file = `${cwd}/server/net.js`;
let text = fs.readFileSync(file, 'utf8');
const from = '    /** @type {Readonly<Record<string, string>> | null} checked skin selection { [chessId]: skinId } (lobby-owned, docs/SKINS.md) */';
const to = [
  '    /**',
  '     * @type {Readonly<Record<string, string>> | null} chosen operator skins (lobby-owned, docs/SKINS.md): keyed by operator',
  "     * charId (upstream 0.3.1's model), PUBLIC unlike the loadout — a teammate sees your skin through",
  '     * Match.publicView().players[].skins',
  '     */',
].join('\n');
if (text.includes(from)) { text = text.replace(from, to); console.log('  ok 皮肤注释已更新为 charId 键'); }
else console.log('  !! 皮肤注释没找到（形状可能已变）');
fs.writeFileSync(file, text, 'utf8');
for (const k of ['prepareMessage', 'sendPrepared', 'wireVersionOf', 'compactWire', 'byToken(token, { allowExpired']) {
  console.log(`  ${text.includes(k) ? 'ok' : '!!'} ${k}`);
}
