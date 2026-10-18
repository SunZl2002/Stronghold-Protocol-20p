// v0.3.1 merge, step 24: this fork's operator card carries one more section than upstream's — the 皮肤 picker, between
// 技能 and 模组 (D041). test/helpers/dom.js mountVNodes names ChessDetail's blocks POSITIONALLY from the list it is given,
// so every upstream test that mounts that card must name the extra block or every later name shifts by one.
//
// The picker itself now renders (its section takes charId, not the chess record), which is why these two started failing:
// before, the extra named block had nothing in it.
import fs from 'node:fs';

const cwd = process.argv[2];
const DECL = "const SECTIONS_WITH_SKIN = ['head', 'garrison', 'trait', 'stats', 'skill', 'skin', 'module', 'equip', 'talents', 'actions'];";

for (const rel of ['test/ui/feedback1-gaps.test.js', 'test/ui/diy-ui.test.js']) {
  const file = `${cwd}/${rel}`;
  let text = fs.readFileSync(file, 'utf8');
  const changed = [];
  if (!text.includes('SECTIONS_WITH_SKIN')) {
    // after the last top-level import line
    const lines = text.split('\n');
    let last = 0;
    lines.forEach((l, i) => { if (/^import .*;$/.test(l) || /^const .*await import\(/.test(l)) last = i; });
    lines.splice(last + 1, 0, '', '// this fork\'s card adds the 皮肤 picker after 技能, so the positional list that names its blocks says so', DECL);
    text = lines.join('\n');
    changed.push('decl');
  }
  const n = (text.match(/list: CHESS_SECTIONS/g) || []).length;
  if (n) { text = text.replace(/list: CHESS_SECTIONS/g, 'list: SECTIONS_WITH_SKIN'); changed.push(`${n} 处 list`); }
  fs.writeFileSync(file, text, 'utf8');
  console.log(`  ${rel}: ${changed.length ? changed.join(' + ') : '无需改动'}`);
}
