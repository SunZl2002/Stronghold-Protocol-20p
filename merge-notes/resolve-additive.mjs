// Throwaway: resolve two additive conflicts by hand.
//
//   .gitignore   — ours added /runtime/ (the announcement store), upstream added a note about a worktree that links
//                  these folders. Different lines, same spot: keep both, and drop upstream's duplicate `/.cache`
//                  because ours already ignores `.cache/` above.
//   CHANGELOG.md — ours is the 未发布 entry for this batch, upstream's is the released 0.3.0. Both are history: keep
//                  both, unreleased first (it is the newer work and the announcement reads the FIRST section).
import fs from 'node:fs';

const cwd = process.argv[2];
const START = /^<{7} [^\n]*$/;
const MID = /^={7}[^\n]*$/;
const END = /^>{7} [^\n]*$/;

function split(file) {
  const lines = fs.readFileSync(`${cwd}/${file}`, 'utf8').split('\n');
  const parts = [];
  let i = 0;
  while (i < lines.length) {
    if (!START.test(lines[i])) { parts.push({ kind: 'plain', text: lines[i] }); i++; continue; }
    i++;
    const ours = [];
    while (i < lines.length && !MID.test(lines[i])) ours.push(lines[i++]);
    i++;
    const theirs = [];
    while (i < lines.length && !END.test(lines[i])) theirs.push(lines[i++]);
    i++;
    parts.push({ kind: 'conflict', ours, theirs });
  }
  return parts;
}

// ---- .gitignore
{
  const parts = split('.gitignore');
  const out = [];
  for (const p of parts) {
    if (p.kind === 'plain') { out.push(p.text); continue; }
    // ours: the /runtime/ rule + its comment.  theirs: the worktree note and its patterns.
    out.push(...p.ours.filter((l) => l.trim()));
    out.push(...p.theirs.filter((l) => l.trim() && l.trim() !== '/.cache'));
  }
  fs.writeFileSync(`${cwd}/.gitignore`, out.join('\n'), 'utf8');
  const left = (fs.readFileSync(`${cwd}/.gitignore`, 'utf8').match(/^<{7}|^>{7}/gm) || []).length;
  console.log(`  .gitignore: 解决，残留标记 ${left}`);
}

// ---- CHANGELOG.md
{
  const parts = split('CHANGELOG.md');
  const out = [];
  for (const p of parts) {
    if (p.kind === 'plain') { out.push(p.text); continue; }
    // both blocks already start with their own "## " heading
    const ours = p.ours.join('\n').replace(/^\n+|\n+$/g, '');
    const theirs = p.theirs.join('\n').replace(/^\n+|\n+$/g, '');
    out.push(ours, '', theirs);
  }
  fs.writeFileSync(`${cwd}/CHANGELOG.md`, out.join('\n'), 'utf8');
  const text = fs.readFileSync(`${cwd}/CHANGELOG.md`, 'utf8');
  const left = (text.match(/^<{7}|^>{7}/gm) || []).length;
  const heads = (text.match(/^## /gm) || []).length;
  console.log(`  CHANGELOG.md: 解决，残留标记 ${left}，## 标题 ${heads} 个`);
  for (const l of text.split('\n')) if (/^## /.test(l)) console.log('      ' + l.slice(0, 40));
}
