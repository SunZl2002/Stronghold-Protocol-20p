// v0.3.1 merge, step 22: CHESS_SECTIONS is a POSITIONAL contract — upstream's ui tests name the blocks ChessDetail
// returns by walking that array (`mountVNodes(..., { list: CHESS_SECTIONS })`), so this fork's extra 'skin' entry shifted
// every later name by one: the block called 'equip' was really the skin picker, and the 变形同构体 rows under it were 0
// (test/ui/feedback1-gaps.test.js 'a wearer's card').
//
// The skin picker keeps its place on the card — right under the header — but it travels as an extra vnode inserted after
// 'head' instead of as an array entry.
import fs from 'node:fs';

const cwd = process.argv[2];
const file = `${cwd}/public/js/ui/detailPanel.js`;
let text = fs.readFileSync(file, 'utf8');

// 1. the array: upstream's order, unchanged
const before = text.match(/export const CHESS_SECTIONS = Object\.freeze\(\[([^\]]*)\]\);/);
if (!before) throw new Error('CHESS_SECTIONS 没找到');
const names = before[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
if (!names.includes('skin')) { console.log('  -- 数组里已经没有 skin'); }
const upstream = names.filter((n) => n !== 'skin');
text = text.replace(before[0], `export const CHESS_SECTIONS = Object.freeze([${upstream.map((n) => `'${n}'`).join(', ')}]);`);
console.log(`  ok CHESS_SECTIONS: ${names.join(' / ')} → ${upstream.join(' / ')}`);

// 2. the assembly: the picker right after 'head'
const oldOut = '  const out = CHESS_SECTIONS.map((k) => blocks[k]).filter(Boolean);';
const newOut = [
  '  // the 皮肤 picker sits right under the header; it is not a CHESS_SECTIONS entry because that array is the positional',
  "  // contract the UI tests name blocks by (see the note on the array above)",
  '  const out = [];',
  '  for (const k of CHESS_SECTIONS) {',
  '    if (blocks[k]) out.push(blocks[k]);',
  "    if (k === 'head' && blocks.skin) out.push(blocks.skin);",
  '  }',
].join('\n');
if (!text.includes(oldOut)) throw new Error('blocks 组装行没找到');
text = text.replace(oldOut, newOut);
console.log('  ok 组装：skin 排在 head 之后');

fs.writeFileSync(file, text, 'utf8');
