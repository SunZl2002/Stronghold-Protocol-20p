// v0.3.1 merge, step 6: screens/game.js — two mechanical injuries from the union.
//   1. the hunk that adds upstream's TestConsole: its upstream side ends the outer template literal (`;` after the closing
//      backtick), so concatenating it after this fork's DanmakuLayer line closes the template early. The TestConsole line
//      moves inside the template and the closing backtick + semicolon stay at the end.
//   2. both sides declare `const editable` (this fork guards on !emergency, upstream on !offerBlocksPrep): ONE declaration.
import fs from 'node:fs';

const cwd = process.argv[2];
const file = `${cwd}/public/js/screens/game.js`;
const lines = fs.readFileSync(file, 'utf8').split('\n');

// 1. the template literal: DanmakuLayer's line must not end it, TestConsole's must
const danmaku = lines.findIndex((l) => l.includes('<${DanmakuLayer} />'));
const test = lines.findIndex((l) => l.includes('<${TestConsole} />'));
if (danmaku < 0 || test < 0) throw new Error(`模板行没找到（danmaku ${danmaku}, test ${test}）`);
console.log(`  danmaku 行 ${danmaku + 1}, TestConsole 行 ${test + 1}`);
if (test !== danmaku + 1) throw new Error(`两行不相邻（${danmaku}, ${test}），脚本假设不成立`);
lines[danmaku] = lines[danmaku].replace(/`;\s*$/, '`');
lines[test] = lines[test].replace(/\}`;?\s*$/, '}`;');

// 2. the two `editable` declarations
const edits = [];
lines.forEach((l, i) => { if (l.startsWith('  const editable = ')) edits.push(i); });
if (edits.length !== 2) throw new Error(`editable 声明 ${edits.length} 个，期望 2`);
const merged = '  // ONE declaration: this fork\'s !emergency guard AND upstream\'s offer-blocked prep (an open plugin offer blocks editing)\n'
  + '  const editable = !emergency && !offerBlocksPrep(pub?.offers) && phase === PHASE.PREP && !!priv && alive && !priv.ready && !watchingOther && !hasPersonalChoice;';
lines.splice(edits[1], 1);
lines[edits[0]] = merged;

fs.writeFileSync(file, lines.join('\n'), 'utf8');
const text = lines.join('\n');
console.log(`  editable 声明: ${(text.match(/const editable =/g) || []).length}`);
console.log(`  DanmakuLayer 行尾: ${JSON.stringify(lines.find((l) => l.includes('<${DanmakuLayer} />')).trimEnd().slice(-12))}`);
console.log(`  TestConsole 行尾: ${JSON.stringify(lines.find((l) => l.includes('<${TestConsole} />')).trimEnd().slice(-12))}`);
