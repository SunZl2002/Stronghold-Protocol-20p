// Throwaway: settings.js — take upstream's DEFAULT_SETTINGS block (it already carries this fork's three keys after the
// step-1 script's doc edit) and build the @returns union by hand, since both sides end the type at a different key.
import fs from 'node:fs';

const cwd = process.argv[2];
const file = `${cwd}/public/js/ui/gameLogic/settings.js`;
const lines = fs.readFileSync(file, 'utf8').split('\n');

const find = (from) => {
  const s = lines.findIndex((l, i) => i >= from && l.startsWith('<<<<<<<'));
  const m = lines.findIndex((l, i) => i > s && l.startsWith('======='));
  const e = lines.findIndex((l, i) => i > m && l.startsWith('>>>>>>>'));
  return { s, m, e };
};

const b1 = find(0);
const b2 = find(b1.e + 1);
if (b1.s < 0 || b2.s < 0) throw new Error('两处冲突块没找到');

const UNION_RETURNS = " * @returns {{ bgm: number, sfx: number, voice: number, voiceLang: 'cn'|'jp'|'en'|'kr', voiceNative: boolean, voiceOverrides: Record<string, string>, muted: boolean, damageNumbers: boolean, officialDamageNumbers: boolean, ammoEnergyCount: boolean, combatMetrics: boolean, prepDeployFold: boolean, quality: 'high'|'medium'|'low', officialFx: 'auto'|'off'|'lite'|'full', otherSkins: boolean, skinsOn: boolean, skinsAutoEquip: boolean, chatDanmaku: boolean,";

const out = [
  ...lines.slice(0, b1.s),
  ...lines.slice(b1.m + 1, b1.e), // upstream's doc + DEFAULT_SETTINGS (already holds skinsOn / skinsAutoEquip / chatDanmaku)
  ...lines.slice(b1.e + 1, b2.s),
  UNION_RETURNS,
  ...lines.slice(b2.e + 1),
];
fs.writeFileSync(file, out.join('\n'), 'utf8');
const text = out.join('\n');
console.log(`  settings.js 残留标记 ${(text.match(/^(<{7}|>{7})/gm) || []).length}`);
for (const k of ['skinsOn', 'skinsAutoEquip', 'chatDanmaku', 'otherSkins', 'ammoEnergyCount', 'prepDeployFold']) {
  console.log(`  ${text.includes(k) ? 'ok' : '!!'} ${k}`);
}
