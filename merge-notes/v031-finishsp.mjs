// v0.3.1 merge, step 16: finishSpDraft called the prep entry TWICE (the merge had left one `enterPrep()` beside the
// surviving `beforePrepOffers()`), so the `prep` plugin window would open twice — the second one never resolves and every
// offer test after it fails. One call, after the timers are cancelled.
import fs from 'node:fs';

const cwd = process.argv[2];
const file = `${cwd}/server/match/match/spDraft.js`;
const lines = fs.readFileSync(file, 'utf8').split('\n');

const start = lines.findIndex((l) => l.trim().startsWith('finishSpDraft() {'));
if (start < 0) throw new Error('finishSpDraft 没找到');
let end = start;
while (end < lines.length && lines[end] !== '  }') end++;

const body = [
  '  finishSpDraft() {',
  '    if (this.phase !== PHASE.SP_DRAFT) return;',
  '    for (const g of this.sp.groups) this.clearDraftGroupTimer(g);',
  '    this.cancel(this._turnTimer);',
  '    this._turnTimer = null;',
  '    this.beforePrepOffers();',
  '  }',
];
console.log(`  原 ${end - start + 1} 行 → ${body.length} 行`);
const out = [...lines.slice(0, start), ...body, ...lines.slice(end + 1)];
fs.writeFileSync(file, out.join('\n'), 'utf8');
const text = out.join('\n');
console.log(`  finishSpDraft 内 beforePrepOffers: ${(text.slice(text.indexOf('  finishSpDraft() {')).match(/beforePrepOffers/g) || []).length}`);
