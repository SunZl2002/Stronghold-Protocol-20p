// v0.3.1 merge, step 13: `useSkin` (this fork's per-CHESS skin read) no longer lives in ui/skins.js, because that file is
// upstream 0.3.1's now and it keys a choice by operator charId (`chosenSkin(charId)`). ui/skinChoice.js bridges the two;
// the four screens that asked per chess import from there.
import fs from 'node:fs';

const cwd = process.argv[2];
const EDITS = [
  ['public/js/screens/loadout.js', "import { useSkin } from '../ui/skins.js';", "import { useSkin } from '../ui/skinChoice.js';"],
  ['public/js/screens/ownership.js', "import { useSkin } from '../ui/skins.js';", "import { useSkin } from '../ui/skinChoice.js';"],
  ['public/js/ui/detailPanel.js', "import { useSkin } from './skins.js';", "import { useSkin } from './skinChoice.js';"],
  ['public/js/ui/gameComponents.js', "import { useSkin } from './skins.js';", "import { useSkin } from './skinChoice.js';"],
];

for (const [rel, from, to] of EDITS) {
  const file = `${cwd}/${rel}`;
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes(to)) { console.log(`  -- ${rel}: 已指向 skinChoice`); continue; }
  if (!text.includes(from)) { console.log(`  !! ${rel}: import 行不符`); continue; }
  fs.writeFileSync(file, text.replace(from, to), 'utf8');
  console.log(`  ok ${rel}`);
}

// any other importer of useSkin?
import { execFileSync } from 'node:child_process';
const hits = execFileSync('git', ['-C', cwd, 'grep', '-n', 'useSkin', '--', 'public'], { encoding: 'utf8' })
  .split('\n')
  .filter((l) => /import .*useSkin/.test(l) && !l.includes('skinChoice.js'));
console.log(hits.length ? `  !! 还有指向 skins.js 的引用:\n${hits.join('\n')}` : '  ok 没有残留的 useSkin import');
