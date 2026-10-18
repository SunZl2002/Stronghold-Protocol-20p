// v0.3.1 merge, step 18: test/match/spectator-skin.test.js is THIS FORK's test (I012: the board shows each player's own
// skin), written against the old per-player, chess-id-keyed `setSkins`. Upstream 0.3.1 keys a choice by operator charId —
// one entry covers the normal piece, its elite and a 自选 slot — so the test sets and reads `charId` instead. The subject
// (each seat's own skin reaching the spectator's b.start spec) is unchanged.
import fs from 'node:fs';

const cwd = process.argv[2];
const file = `${cwd}/test/match/spectator-skin.test.js`;
let text = fs.readFileSync(file, 'utf8');

const swaps = [
  // test 1: carry the charId alongside the chess id
  ['  const { chessId, skinId } = pick;', '  const { chessId, charId, skinId } = pick;'],
  ['    ps.setSkins({ [chessId]: skinId });\n    if (ps.skins[chessId] === skinId) got.push(pid);',
   '    ps.setSkins({ [charId]: skinId });\n    if (ps.skins[charId] === skinId) got.push(pid);'],
  // test 2: the picks carry their charId too
  ["    picks.push({ chessId: id, skinId: skins[0].id });", "    picks.push({ chessId: id, charId: rec.charId, skinId: skins[0].id });"],
  ['    ps.setSkins({ [picks[i].chessId]: picks[i].skinId });', '    ps.setSkins({ [picks[i].charId]: picks[i].skinId });'],
];

for (const [from, to] of swaps) {
  if (!text.includes(from)) { console.log(`  !! 未找到: ${from.split('\n')[0].trim().slice(0, 70)}`); continue; }
  text = text.replace(from, to);
  console.log(`  ok ${from.split('\n')[0].trim().slice(0, 70)}`);
}
fs.writeFileSync(file, text, 'utf8');
console.log(`  仍按 chessId 设皮肤: ${(text.match(/setSkins\(\{ \[chessId\]/g) || []).length}`);
