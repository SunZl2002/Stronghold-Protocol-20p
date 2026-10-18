// v0.3.1 merge, step 8: server/match/match/spDraft.js — the merge left TWO rollItemId implementations spliced together
// (this fork's truncated head, then upstream's whole body with this fork's lines interleaved). ONE is written back:
// this fork's version (the drawing player's GROUP pool + the `also` list the v0.3.0 resolution fixed) plus upstream
// 0.3.1's `exclude` (Cathy's match-long allowance / distinct choices), applied to every branch.
import fs from 'node:fs';

const cwd = process.argv[2];
const file = `${cwd}/server/match/match/spDraft.js`;
const lines = fs.readFileSync(file, 'utf8').split('\n');

const first = lines.findIndex((l) => l.trim().startsWith('rollItemId({ pool = null, tier = null, maxTier = 6, shopLevel = 6, player = null }'));
if (first < 0) throw new Error('第一个 rollItemId 没找到');
// the second copy ends with the `}` that follows the LAST `return pick(list);` / `return stock.pick(rng, list);`
let last = first;
while (last < lines.length && !lines[last].startsWith('  }')) last++;
// walk forward: the second implementation's closing brace is the next line that is exactly '  }' after its last `return`
const secondDecl = lines.findIndex((l, i) => i > first && l.includes('rollItemId({ pool = null, tier = null, maxTier = 6, shopLevel = 6, exclude = [] }'));
if (secondDecl < 0) throw new Error('第二个 rollItemId 没找到');
let secondEnd = secondDecl;
while (secondEnd < lines.length && lines[secondEnd] !== '  }') secondEnd++;
console.log(`  替换 ${first + 1}..${secondEnd + 1}（${secondEnd - first + 1} 行）`);

const ONE = [
  '  rollItemId({ pool = null, tier = null, maxTier = 6, shopLevel = 6, player = null, exclude = [] } = {}) {',
  "    const pools = this.gd.choices.pools && typeof this.gd.choices.pools === 'object' ? this.gd.choices.pools : {};",
  "    const p = typeof pool === 'string' && Object.hasOwn(pools, pool) ? pools[pool] : null;",
  '    const rng = this.rngMeta;',
  '    // this fork: the row is drawn from the PLAYER\'S GROUP pool (20-player rooms split stock per group)',
  '    const stock = this.itemPoolFor(player);',
  '    // upstream 0.3.1: ids already spent on a match-long allowance (or drawn once in a distinct-choice set) are dropped',
  '    // before sampling; an empty `exclude` costs nothing.',
  '    const notExcluded = (ids) => (exclude.length ? ids.filter((id) => !exclude.includes(id)) : ids);',
  '    const tierList = (lo, hi) => { const out = []; for (let t = lo; t <= hi; t++) for (const id of this.gd.shopItemsByTier[t] || []) out.push(id); return out; };',
  "    const also = p && Array.isArray(p.also) ? p.also.filter((id) => typeof id === 'string' && this.gd.item(id)) : [];",
  '    const withAlso = (list) => {',
  '      const out = notExcluded(list.slice());',
  '      for (const id of also) if (!out.includes(id) && !exclude.includes(id)) out.push(id);',
  '      return out;',
  '    };',
  "    if (p && p.kind === 'equip') {",
  '      // ONE implementation per branch: this fork\'s `stock` (the drawing player\'s GROUP pool) with the pool\'s `also`',
  '      // list (pool_equip_kathe → 突变细胞), and upstream\'s `exclude` filter on top.',
  '      if (Array.isArray(p.weighted) && p.weighted.length) {',
  '        const pairs = p.weighted.filter((x) => Array.isArray(x) && this.gd.item(x[0]) && stock.canGain(x[0]) && !exclude.includes(x[0]));',
  '        for (const id of also) if (!exclude.includes(id) && !pairs.some((x) => x[0] === id)) pairs.push([id, 1]);',
  '        return stock.pick(rng, pairs.map((x) => x[0]), new Map(pairs));',
  '      }',
  '      if (Array.isArray(p.items) && p.items.length) {',
  '        const items = p.items.filter((id) => this.gd.item(id));',
  '        return stock.pick(rng, withAlso(items));',
  '      }',
  '      let list;',
  '      if (Array.isArray(p.tiers) && p.tiers.length) list = p.tiers.flatMap((t) => this.gd.shopItemsByTier[t] || []);',
  "      else list = tierList(1, p.maxTier === 'shopLevel' ? Math.max(1, Math.min(6, shopLevel)) : 6);",
  '      return stock.pick(rng, withAlso(list));',
  '    }',
  '    const list = Number.isInteger(tier) ? tierList(tier, tier) : tierList(1, Math.max(1, Math.min(6, maxTier)));',
  '    return stock.pick(rng, notExcluded(list));',
  '  }',
];

const out = [...lines.slice(0, first), ...ONE, ...lines.slice(secondEnd + 1)];
fs.writeFileSync(file, out.join('\n'), 'utf8');
const text = out.join('\n');
console.log(`  rollItemId 声明: ${(text.match(/^\s+rollItemId\(\{/gm) || []).length}`);
for (const k of ['exclude', 'itemPoolFor(player)', 'withAlso']) {
  console.log(`  ${k}: ${(text.match(new RegExp(k, 'g')) || []).length}`);
}
