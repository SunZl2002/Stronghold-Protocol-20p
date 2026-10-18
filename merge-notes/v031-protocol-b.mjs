// Throwaway: protocol.js declared SKIN_LIMITS / isSkinId / isSkinSelection twice — this fork's simple block
// (chess-id keyed, 160 entries) and upstream 0.3.1's fuller one (charId keyed, 256 entries, CHAR_ID/isCharId).
// The server-side skin code follows upstream now, so the upstream block is the one that stays; this removes ours.
import fs from 'node:fs';

const cwd = process.argv[2];
const file = `${cwd}/shared/protocol.js`;
const lines = fs.readFileSync(file, 'utf8').split('\n');

const start = lines.findIndex((l) => l.includes('// ---- 干员皮肤 (docs/SKINS.md): room.skins { skins }'));
if (start < 0) throw new Error('我们的皮肤段没找到');
// drop from the section comment through the blank line after our isSkinSelection
let end = start;
while (end < lines.length && !/^export const isSkinSelection = \(v\) => isMap\(v, SKIN_LIMITS\.entries, isId, isSkinId\);$/.test(lines[end])) end++;
if (end >= lines.length) throw new Error('我们的 isSkinSelection 没找到');
end++;
while (end < lines.length && lines[end].trim() === '') end++;

const note = [
  '// ---- 干员皮肤 (docs/SKINS.md) — see the SKIN_LIMITS block below: upstream 0.3.1 keyed a choice by operator charId and',
  '// this fork adopted that model, so the older chess-id-keyed helpers that used to live here are gone.',
];
const out = [...lines.slice(0, start), ...note, ...lines.slice(end)];
fs.writeFileSync(file, out.join('\n'), 'utf8');
const text = out.join('\n');
const count = (text.match(/export const SKIN_LIMITS/g) || []).length;
console.log(`  SKIN_LIMITS 声明数: ${count}  ${count === 1 ? 'ok' : '!!'}`);
console.log(`  残留标记 ${(text.match(/^(<{7}|>{7})/gm) || []).length}`);
