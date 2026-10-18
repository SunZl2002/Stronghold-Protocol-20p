// v0.3.1 merge, step 23: two of THIS FORK's own guards still expect the skin picker to be a CHESS_SECTIONS entry. It no
// longer is (step 22): that array is the positional contract upstream's UI tests name ChessDetail's blocks by, and the
// picker now travels as an extra vnode inserted after 'head'. The picker still sits right under the header — the shape
// these tests describe — so both guards are updated to say where it comes from now.
import fs from 'node:fs';

const cwd = process.argv[2];
const edits = [
  ['test/ui/playtest3.test.js',
    "  // 'skin' joined the list between 技能 and 模组 with the operator-skin section (D041, night batch of 2026-10-14);\n  // test/docs-consistency.test.js guards the same shape.",
    "  // The 皮肤 picker is NOT an entry here since the v0.3.1 merge: CHESS_SECTIONS is the positional contract upstream's UI\n  // tests name ChessDetail's blocks by, so the picker travels as an extra vnode inserted after 'head' (D041 still puts it\n  // right under the header). test/docs-consistency.test.js guards the same shape."],
  ['test/ui/playtest3.test.js',
    "['head', 'garrison', 'trait', 'stats', 'skill', 'skin', 'module', 'equip', 'talents', 'actions']",
    "['head', 'garrison', 'trait', 'stats', 'skill', 'module', 'equip', 'talents', 'actions']"],
  ['test/docs-consistency.test.js',
    "// 'skin' sits between 'skill' and 'module' since D041 put the skin picker on the in-game card, right under the",
    "// The skin picker is inserted after 'head' since the v0.3.1 merge (not a CHESS_SECTIONS entry — that array is the"],
  ['test/docs-consistency.test.js',
    /assert\.match\(panel, \/CHESS_SECTIONS = Object\\\.freeze\(\\\['head', 'garrison', 'trait', 'stats', 'skill', 'skin', 'module',/,
    null],
];

for (const [rel, from, to] of edits) {
  const file = `${cwd}/${rel}`;
  let text = fs.readFileSync(file, 'utf8');
  if (to === null) continue;
  if (!text.includes(from)) { console.log(`  -- ${rel}: 片段未找到（${String(from).slice(0, 40)}…）`); continue; }
  text = text.replace(from, to);
  fs.writeFileSync(file, text, 'utf8');
  console.log(`  ok ${rel}`);
}

// the docs-consistency regex still names 'skin' inside the array; rewrite that one match
{
  const file = `${cwd}/test/docs-consistency.test.js`;
  let text = fs.readFileSync(file, 'utf8');
  const before = text;
  text = text.replace(
    /CHESS_SECTIONS = Object\\\.freeze\(\\\['head', 'garrison', 'trait', 'stats', 'skill', 'skin', 'module'/,
    "CHESS_SECTIONS = Object\\\\.freeze\\\\(\\\\['head', 'garrison', 'trait', 'stats', 'skill', 'module'",
  );
  if (text !== before) { fs.writeFileSync(file, text, 'utf8'); console.log('  ok docs-consistency 正则'); }
  else console.log('  -- docs-consistency 正则未匹配');
}
