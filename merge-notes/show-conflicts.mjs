// Throwaway: dump only the named files' conflict hunks, so a batch can be read without paging a 3000-line file.
import fs from 'node:fs';

const cwd = process.argv[2];
const files = process.argv.slice(3);

for (const f of files) {
  const file = `${cwd}/${f}`;
  if (!fs.existsSync(file)) { console.log(`=== ${f}: 不存在`); continue; }
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  console.log(`\n${'#'.repeat(90)}\n# ${f}  (${lines.length} 行)\n${'#'.repeat(90)}`);
  let i = 0;
  let h = 0;
  while (i < lines.length) {
    if (!/^<{7} /.test(lines[i])) { i++; continue; }
    h++;
    console.log(`\n--- hunk ${h} @ ${i + 1} ---`);
    for (let k = Math.max(0, i - 4); k < i; k++) console.log(`  ctx| ${lines[k].slice(0, 140)}`);
    i++;
    console.log('  OURS:');
    while (i < lines.length && !/^={7}/.test(lines[i])) { console.log(`    ${lines[i].slice(0, 140)}`); i++; }
    i++;
    console.log('  THEIRS:');
    while (i < lines.length && !/^>{7} /.test(lines[i])) { console.log(`    ${lines[i].slice(0, 140)}`); i++; }
    i++;
    for (let k = i; k < Math.min(lines.length, i + 2); k++) console.log(`  ctx| ${lines[k].slice(0, 140)}`);
  }
}
