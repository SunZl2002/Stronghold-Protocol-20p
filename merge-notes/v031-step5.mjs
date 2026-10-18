// v0.3.1 merge, step 5: the parse errors a replay leaves behind.
//
//   * loadout.js  : two `import { SkinSection }` lines (both sides added the section) and two usages — upstream's
//                   SkinSection takes `charId`, so this fork's `<${SkinSection} charId=${chess.charId} />` is the one kept
//                   and the stale `chess=${chess}` line goes with the duplicate import.
//   * ui/settings.js: the same import line twice.
import fs from 'node:fs';

const cwd = process.argv[2];
const read = (rel) => fs.readFileSync(`${cwd}/${rel}`, 'utf8').split('\n');
const write = (rel, l) => fs.writeFileSync(`${cwd}/${rel}`, l.join('\n'), 'utf8');

/** Drop every occurrence of an exact line but the first. */
function firstOnly(rel, line, label) {
  const lines = read(rel);
  const hits = [];
  lines.forEach((l, i) => { if (l === line) hits.push(i); });
  if (hits.length < 2) { console.log(`  -- ${label}: ${hits.length} 次，跳过`); return; }
  const drop = new Set(hits.slice(1));
  write(rel, lines.filter((_, i) => !drop.has(i)));
  console.log(`  ok ${label}: 去掉 ${hits.length - 1} 行重复`);
}

/** Drop the first occurrence of an exact line (used for a stale usage the new API replaced). */
function dropLine(rel, line, label) {
  const lines = read(rel);
  const at = lines.indexOf(line);
  if (at < 0) { console.log(`  -- ${label}: 未找到`); return; }
  write(rel, [...lines.slice(0, at), ...lines.slice(at + 1)]);
  console.log(`  ok ${label}: 删掉第 ${at + 1} 行`);
}

firstOnly('public/js/screens/loadout.js', "import { SkinSection } from '../ui/skinPicker.js';", 'loadout 重复 import SkinSection');
dropLine('public/js/screens/loadout.js', '      <${SkinSection} chess=${chess} />', 'loadout 旧的 SkinSection 用法');
firstOnly('public/js/ui/settings.js', "import { setUiPlugin, uiPluginEntries, uiPlugins } from './uiPlugins.js';", 'settings 重复 import setUiPlugin');
