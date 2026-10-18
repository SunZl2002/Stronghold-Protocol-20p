// v0.3.1 merge, step 12: server/match/match/spDraft.js — enterSpDraft kept upstream's leftover single-draft line beside this
// fork's group version. The group version already produced `pages` (and returns early when there are none), so upstream's
// `generateDraft` call — which also read the ungrouped `this.itemPool` — is dead and, worse, references a function the
// merged imports replaced (ReferenceError: generateDraft is not defined on every 机变 round).
import fs from 'node:fs';

const cwd = process.argv[2];
const file = `${cwd}/server/match/match/spDraft.js`;
let text = fs.readFileSync(file, 'utf8');

const stray = "    const draft = generateDraft(this.gd, this.rngDraft, this.round, { stageId: this.stageId, bondAvailable: (bondId) => this.bondLive(bondId), itemAvailable: id => this.itemPool.canGain(id) });\n";
if (!text.includes(stray)) { console.log('  -- 上游的 generateDraft 行不在（已清理）'); process.exit(0); }
text = text.replace(stray, '');

const guard = '    if (!draft || !alive.length) { this.beforePrepOffers(); return; }';
if (!text.includes(guard)) throw new Error('`!draft || !alive.length` 守卫没找到');
text = text.replace(guard, '    if (!alive.length) { this.beforePrepOffers(); return; }');

fs.writeFileSync(file, text, 'utf8');
console.log('  ok 删掉上游的单份 generateDraft 调用，守卫只看 alive');
console.log(`  generateDraft 仍出现: ${(text.match(/generateDraft\b/g) || []).length}`);
