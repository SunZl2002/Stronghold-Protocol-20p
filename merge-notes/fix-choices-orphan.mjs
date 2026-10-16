// Throwaway: drop the orphaned for-loop tail choices.js's resolver leaves behind.
//
// Indentation alone identifies it (no quotes in the match, so nothing can be mangled by a shell):
//     [10] <orphan call>      <- directly under the loop's closing brace
//     [ 8] }                  <- and its stray closing brace
// which sits between the loop's own `}` at [8] and `handled = true;` at [8].
import fs from 'node:fs';

const file = `${process.argv[2]}/server/match/choices.js`;
const lines = fs.readFileSync(file, 'utf8').split('\n');
const indent = (l) => (/^(\s*)/.exec(l ?? '') || ['', ''])[1].length;

const drop = new Set();
for (let i = 2; i < lines.length - 1; i++) {
  const isOrphanCall = indent(lines[i]) === 10 && /acquireItem/.test(lines[i]);
  const loopClosed = indent(lines[i - 1]) === 8 && lines[i - 1].trim() === '}';
  const strayClose = indent(lines[i + 1]) === 8 && lines[i + 1].trim() === '}';
  const nextIsHandled = indent(lines[i + 2]) === 8 && /^handled = true;/.test(lines[i + 2].trim());
  if (isOrphanCall && loopClosed && strayClose && nextIsHandled) { drop.add(i); drop.add(i + 1); }
}

if (!drop.size) { console.log('  未找到孤儿（已正常）'); process.exit(0); }
fs.writeFileSync(file, lines.filter((_, i) => !drop.has(i)).join('\n'), 'utf8');
console.log(`  清掉 ${drop.size / 2} 处孤儿 for 收尾（行 ${[...drop].map((i) => i + 1).join(', ')}）`);
