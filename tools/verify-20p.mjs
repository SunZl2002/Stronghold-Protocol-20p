// tools/verify-20p.mjs — the three gates that must pass after every upstream sync.
//
// Why this exists: a git merge that reports no conflicts can still be wrong. In the v0.2.5 merge, upstream
// added code referencing Match.itemPool while this branch had replaced it with one pool per fixed card group;
// git merged cleanly and the result threw at runtime. Nothing but a test catches that.
//
//   node tools/verify-20p.mjs            three gates (golden fast subset)
//   node tools/verify-20p.mjs --full     includes the whole golden corpus (~20 s more)
//   node tools/verify-20p.mjs --gates 2  only one gate (comma separated)
//
// Gate 1 (golden) is the important one: test/golden/*.json are UPSTREAM's baselines and this branch has never
// edited them, so passing proves 1-4 player play still matches upstream bit for bit.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const FULL = argv.includes('--full');
const onlyArg = argv.includes('--gates') ? argv[argv.indexOf('--gates') + 1] : null;
const only = onlyArg ? new Set(String(onlyArg).split(',')) : null;

/** Capacity + grouped-stock regressions: these pin the D001-D032 decision table. */
const CAPACITY_TESTS = [
  'test/lobby-capacity.test.js',
  'test/match/player-capacity.test.js',
  'test/match/draft-capacity.test.js',
  'test/match/unite-capacity.test.js',
  'test/match/unite-vote.test.js',
  'test/match/upstream-v022-capacity.test.js',
  'test/match/upstream-v023-capacity.test.js',
  'test/match/group-drafts.test.js',
  'test/match/group-draft-generation.test.js',
  'test/match/group-draft-audit.test.js',
  'test/match/group-stock.test.js',
  'test/match/group-unite-rounds.test.js',
  'test/match/group-unite-audit.test.js',
  'test/match/shared-stock.test.js',
  'test/match/pool.test.js',
  'test/match/finalAssault.test.js',
  'test/ui/group-drafts.test.js',
  'test/ui/group-draft-views.test.js',
  'test/ui/poolGroups.test.js',
  'test/ui/unite-vote.test.js',
  'test/ui/room-management.test.js',
  'test/room-management.test.js',
  'test/server-settings.test.js',
  'test/lobby-access.test.js',
];

const GATES = [
  {
    id: '1',
    title: '金标准 / golden — 1-4 人玩法必须与上游逐位一致',
    files: ['test/golden.test.js'],
    env: (env) => (FULL ? { ...env, GOLDEN_FULL: '1' } : env),
    why: 'test/golden/*.json 是上游的基准，本分支从未改过；不通过说明容量改动泄漏到了 1-4 人，或解冲突时丢了上游的数值修复。',
  },
  {
    id: '2',
    title: '20 人容量与分组库存回归',
    files: CAPACITY_TESTS,
    why: '这组测试钉住决定表：20 席、默认 8 席、固定分组、每组独立六张、组内真人优先、联防轮数=组数、逐组库存守恒。',
  },
  {
    id: '3',
    title: '版本一致性 / 发布接线',
    files: ['test/version.test.js'],
    why: 'APP_VERSION、package.json、package-lock、CHANGELOG 首行与 README 徽章必须一致。',
  },
];

function run(gate) {
  const missing = gate.files.filter((f) => !existsSync(join(ROOT, f)));
  if (missing.length) {
    console.log(`\n=== 闸门 ${gate.id} · ${gate.title}\n    跳过：文件不存在 ${missing.join(', ')}`);
    return { ...gate, ok: null };
  }
  console.log(`\n=== 闸门 ${gate.id} · ${gate.title}`);
  console.log(`    ${gate.why}`);
  const t0 = Date.now();
  const res = spawnSync(process.execPath, ['--test', ...gate.files], {
    cwd: ROOT,
    stdio: 'inherit',
    env: gate.env ? gate.env(process.env) : process.env,
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const ok = res.status === 0;
  console.log(`    闸门 ${gate.id}：${ok ? '通过' : '失败'}（${secs}s）`);
  return { ...gate, ok, secs };
}

const selected = GATES.filter((g) => !only || only.has(g.id));
if (!selected.length) {
  console.error(`没有匹配的闸门。可选：${GATES.map((g) => g.id).join(', ')}`);
  process.exit(2);
}

console.log('跟随原版更新后的验证（tools/verify-20p.mjs）');
console.log(FULL ? '模式：全量 golden 语料' : '模式：golden 快速子集（加 --full 跑全量）');

const results = selected.map(run);

console.log('\n================ 汇总 ================');
for (const r of results) {
  const mark = r.ok === null ? '跳过' : r.ok ? '通过' : '失败';
  console.log(`闸门 ${r.id}  ${mark.padEnd(4)}  ${r.title}`);
}
const failed = results.filter((r) => r.ok === false);
if (failed.length) {
  console.log('\n结论：不通过。先看失败的是哪一类：');
  console.log('  · 闸门 1 失败且场景移动来自上游自己的数值改动 → 属预期，需在 docs/development/records/ 里逐场景说明原因；');
  console.log('  · 闸门 1 失败且只有你解冲突的文件导致 → 解冲突错了，回去按 DECISIONS.md 重解；');
  console.log('  · 闸门 2 失败 → 20 人特性被上游覆盖或语义冲突，查 docs/development/SYNC_20P.md 步骤 5；');
  console.log('  · npm run golden:update 是最后手段，不是第一步。');
  process.exit(1);
}
console.log('\n结论：全部通过。');
