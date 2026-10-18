// v0.3.1 merge, step 3b: ui/gameActions.js — one hunk, a union.
//   upstream 0.3.1 adds `offer` (the plugin interaction window, g.offer / g.offerRefresh);
//   this fork's `choice` carries the draft/group scope (20-player parallel drafts) and a chosen choiceId.
// The combined `choice` accepts BOTH call shapes: an opts object, or a bare choiceId string.
import fs from 'node:fs';

const cwd = process.argv[2];
const file = `${cwd}/public/js/ui/gameActions.js`;
const lines = fs.readFileSync(file, 'utf8').split('\n');

const s = lines.findIndex((l) => l.startsWith('<<<<<<<'));
if (s < 0) { console.log('  -- gameActions.js: 没有冲突块（已解）'); process.exit(0); }
const m = lines.findIndex((l, i) => i > s && l.startsWith('======='));
const e = lines.findIndex((l, i) => i > m && l.startsWith('>>>>>>>'));
if (m < 0 || e < 0) throw new Error('冲突块不完整');

const ours = lines.slice(s + 1, m).find((l) => l.trim().startsWith('choice:'));
if (!ours) throw new Error('我们的 choice 行没找到');

const merged = [
  '  // upstream 0.3.1: a plugin interaction window (g.offer / g.offerRefresh, PLUGINS §10b)',
  ...lines.slice(m + 1, e).filter((l) => l.trim().startsWith('offer:')),
  '  // this fork passes the draft/group scope (20-player parallel drafts) and a chosen choiceId; upstream passes a bare',
  '  // choiceId as the second argument — both shapes are accepted',
  ours.replace('choiceRequestScope(opts)', "choiceRequestScope(typeof opts === 'string' ? { choiceId: opts } : opts)"),
];

const out = [...lines.slice(0, s), ...merged, ...lines.slice(e + 1)];
fs.writeFileSync(file, out.join('\n'), 'utf8');
const text = out.join('\n');
console.log(`  gameActions.js 残留标记 ${(text.match(/^(<{7}|>{7})/gm) || []).length}`);
for (const k of ['offer:', 'choice:', 'choiceRequestScope']) console.log(`  ${text.includes(k) ? 'ok' : '!!'} ${k}`);
