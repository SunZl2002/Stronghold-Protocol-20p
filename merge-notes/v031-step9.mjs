// v0.3.1 merge, step 9: server/match/match/spDraft.js — `rollPool` was spliced the same way `rollItemId` was (this
// fork's two lines, then upstream's whole method). ONE is written back: upstream 0.3.1's body (with `exclude`) plus this
// fork's GROUP pool (`poolFor(player)`) and the `player` / `exclude` pair it forwards to rollItemId.
import fs from 'node:fs';

const cwd = process.argv[2];
const file = `${cwd}/server/match/match/spDraft.js`;
const lines = fs.readFileSync(file, 'utf8').split('\n');

const a = lines.findIndex((l) => l.trim().startsWith('rollPool(poolId, { shopLevel = 6, extra = null, chessOf = null, player = null }'));
if (a < 0) throw new Error('我们的 rollPool 头没找到');
// the merged head: this fork's 2 lines, then upstream's declaration, pools/p/lvl lines and its equip branch
let b = a;
while (b < lines.length && !lines[b].includes('const id = this.rollItemId({ pool: poolId, shopLevel: lvl, exclude });')) b++;
const c = lines.findIndex((l, i) => i > b && l.includes('return id ? { kind: \'item\', id } : null;'));
if (c < 0) throw new Error("equip 分支的 return 没找到");
console.log(`  替换 ${a + 1}..${c + 1}（${c - a + 1} 行）`);

const ONE = [
  '  rollPool(poolId, { shopLevel = 6, extra = null, chessOf = null, player = null, exclude = [] } = {}) {',
  "    const pools = this.gd.choices.pools && typeof this.gd.choices.pools === 'object' ? this.gd.choices.pools : {};",
  "    const p = typeof poolId === 'string' && Object.hasOwn(pools, poolId) ? pools[poolId] : null;",
  '    if (!p || typeof p !== \'object\') return null;',
  '    const lvl = Math.max(1, Math.min(6, Number.isInteger(shopLevel) ? shopLevel : 6));',
  "    // this fork: the chess side reads the drawing player's GROUP pool (20-player rooms split stock per group)",
  '    const pool = this.poolFor(player);',
  "    if (p.kind === 'equip') {",
  '      const id = this.rollItemId({ pool: poolId, shopLevel: lvl, player, exclude });',
  "      return id ? { kind: 'item', id } : null;",
  '    }',
];

const out = [...lines.slice(0, a), ...ONE, ...lines.slice(c + 1)];
fs.writeFileSync(file, out.join('\n'), 'utf8');
console.log(`  rollPool 声明: ${(out.join('\n').match(/^\s+rollPool\(/gm) || []).length}`);
