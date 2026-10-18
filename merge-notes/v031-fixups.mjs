// v0.3.1 merge, step 4 (replayable): the fix-ups a fresh replay needs after the resolvers.
//
// The resolvers concatenate both sides for "purely additive" hunks, and v0.3.1 moved / repeated some declarations, so a
// few files come out with the same name declared twice. This script removes the duplicates it knows about. Anything not
// matched is reported (never silently skipped).
import fs from 'node:fs';

const cwd = process.argv[2];
const read = (rel) => fs.readFileSync(`${cwd}/${rel}`, 'utf8').split('\n');
const write = (rel, lines) => fs.writeFileSync(`${cwd}/${rel}`, lines.join('\n'), 'utf8');

/** Delete the SECOND block that matches `isHead`, plus its leading /** doc lines, through `isTail`. */
function dedupe(rel, isHead, isTail, label) {
  const lines = read(rel);
  const heads = [];
  lines.forEach((l, i) => { if (isHead(l)) heads.push(i); });
  if (heads.length < 2) { console.log(`  -- ${label}: 只出现 ${heads.length} 次，跳过`); return; }
  const at = heads[1];
  let start = at;
  while (start > 0 && lines[start - 1].startsWith('/**')) start--;
  let end = at;
  while (end < lines.length && !isTail(lines[end])) end++;
  write(rel, [...lines.slice(0, start), ...lines.slice(end + 1)]);
  console.log(`  ok ${label}: 删掉 ${start + 1}..${end + 1}`);
}

// tools/package.mjs: the isPluginResource / RUNTIME_RESEARCH pair appears twice (upstream moved them), and so does
// AUTHOR_TEST_FILES. isPluginResource + RUNTIME_RESEARCH are adjacent, so removing the second pair fixes both.
dedupe('tools/package.mjs',
  (l) => l.startsWith('export const isPluginResource ='),
  (l) => /^export const RUNTIME_RESEARCH =/.test(l),
  'package.mjs isPluginResource/RUNTIME_RESEARCH');
dedupe('tools/package.mjs',
  (l) => l.startsWith('export const AUTHOR_TEST_FILES ='),
  (l) => l.startsWith('export const AUTHOR_TEST_FILES ='),
  'package.mjs AUTHOR_TEST_FILES');

// ---- the ones whose shape is not a simple pair: reported so the next pass knows they are still open
const OPEN = [
  'public/js/screens/loadout.js    SkinSection declared twice (upstream added its own skin section)',
  'public/js/ui/settings.js        setUiPlugin declared twice',
  'public/js/screens/game.js       a hunk whose upstream side closes the outer template literal + two `editable` declarations',
  'server/match/match/intents.js   SyntaxError: Unexpected token ":"',
  'server/match/match/phases.js    SyntaxError: Unexpected token "{"',
  'server/match/match/spDraft.js   SyntaxError: Unexpected token "*"',
  'shared/protocol.js              SyntaxError: Unexpected string',
];
console.log('  仍待处理:');
for (const l of OPEN) console.log('    · ' + l);
