// v0.3.1 merge, step 1 (replayable). Everything this session resolved, so a fresh `git merge upstream/v031`
// can be brought back to this point with one command.
//
// Decisions encoded here (see merge-notes/AFTER-MERGE.md for the reasoning):
//   * skins follow UPSTREAM's pipeline (the owner's decision of 2026-10-18, option 1): their skins.js / skinPicker.js /
//     SKINS.md / skins.test.js, their app.js + units.js + assets.js renderer, their loadout.css skin section. Our two
//     switches (skinsOn / skinsAutoEquip) and chatDanmaku survive in DEFAULT_SETTINGS and get wired later.
//   * data/assets.json stays OURS (中日 only, 174 skins bundled).
//   * everything else here is "both sides", kept side by side with the newer/complete half preferred.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const cwd = process.argv[2];
const git = (...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });
const ours = (files) => git('checkout', '--ours', '--', ...files);
const theirs = (files) => git('checkout', '--theirs', '--', ...files);
const edit = (rel, from, to) => {
  const file = `${cwd}/${rel}`;
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes(from)) { console.log(`  !! ${rel}: 片段未找到`); return; }
  fs.writeFileSync(file, text.replace(from, to), 'utf8');
};

// ---- 1. upstream's skin pipeline
theirs(['docs/SKINS.md', 'public/js/ui/skins.js', 'public/js/ui/skinPicker.js', 'test/skins.test.js']);
theirs(['public/js/render/app.js', 'public/js/render/units.js', 'public/js/assets.js']);
ours(['data/assets.json']);
console.log('  ok 皮肤一族取上游，assets.json 取我们');

// ---- 2. 0.3.1's CSS: two files, different selectors on each side -> both
for (const rel of ['public/css/screens/game-panels.css', 'public/css/screens/loadout.css']) {
  const file = `${cwd}/${rel}`;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].startsWith('<<<<<<<')) { out.push(lines[i++]); continue; }
    i++;
    const a = [];
    while (i < lines.length && !lines[i].startsWith('=======')) a.push(lines[i++]);
    i++;
    const b = [];
    while (i < lines.length && !lines[i].startsWith('>>>>>>>')) b.push(lines[i++]);
    i++;
    out.push(...a, ...b);
  }
  fs.writeFileSync(file, out.join('\n'), 'utf8');
}
// loadout.css: our `.lo-skin__badge` block lost its closing brace at the conflict boundary
edit('public/css/screens/loadout.css',
  '  border: 1px solid rgba(78, 216, 175, .4);\n/* ---- 干员皮肤',
  '  border: 1px solid rgba(78, 216, 175, .4);\n}\n\n/* ---- 干员皮肤');
console.log('  ok 两个 CSS（都留 + 补花括号）');

// ---- 3. docs/DEPLOY.md: our pre-cache note + upstream's extractor note (theirs already covers the 0.2.0 sentence)
{
  const file = `${cwd}/docs/DEPLOY.md`;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const s = lines.findIndex((l) => l.startsWith('<<<<<<<'));
  const m = lines.findIndex((l, i) => i > s && l.startsWith('======='));
  const e = lines.findIndex((l, i) => i > m && l.startsWith('>>>>>>>'));
  const mine = lines.slice(s + 1, m);
  const keep = [mine[0], ''];               // the 预缓存 paragraph only
  const theirLines = lines.slice(m + 1, e);
  fs.writeFileSync(file, [...lines.slice(0, s), ...keep, ...theirLines, ...lines.slice(e + 1)].join('\n'), 'utf8');
  console.log('  ok DEPLOY.md');
}

// ---- 4. tools/setup.mjs: option union + both steps
edit('tools/setup.mjs',
  "function parseArgs(argv) {\n<<<<<<< HEAD\n  const o = { check: false, assets: true, skins: true, local: 'ask', scenes: 'ask', game: null, yes: false, quiet: false, help: false, source: process.env.SP_ASSET_SOURCE || 'direct' };\n=======\n  const o = { check: false, offline: false, refresh: false, assets: true, local: 'ask', scenes: 'ask', game: null, yes: false, quiet: false, help: false, source: process.env.SP_ASSET_SOURCE || 'direct' };\n>>>>>>> upstream/v031",
  "function parseArgs(argv) {\n  // this fork adds `skins`; upstream 0.3.1 adds `offline` and `refresh`\n  const o = { check: false, offline: false, refresh: false, assets: true, skins: true, local: 'ask', scenes: 'ask', game: null, yes: false, quiet: false, help: false, source: process.env.SP_ASSET_SOURCE || 'direct' };");
edit('tools/setup.mjs', '<<<<<<< HEAD\n  // 5b. operator skins', '  // 5b. operator skins');
edit('tools/setup.mjs',
  "  }\n=======\n  // Startup/update launchers run this same setup before starting the game. No runtime downloader.\n  await preparePluginOfficialTables(ROOT, { ...opts, log });\n>>>>>>> upstream/v031",
  "  }\n  // upstream 0.3.1: official tables for plugin operators outside the roster, prepared here too\n  await preparePluginOfficialTables(ROOT, { ...opts, log });");
console.log('  ok setup.mjs');

// ---- 5. DEFAULT_SETTINGS union: upstream's keys + our fork-only three
edit('public/js/ui/gameLogic/settings.js',
  " *  of the operator's own model. A pure client preference (never sent): off, only this player's own pieces wear a skin.\n */\nexport const DEFAULT_SETTINGS = Object.freeze({ bgm: 0.6, sfx: 0.8, voice: 0.8, voiceLang: 'cn', voiceNative: false, voiceOverrides: Object.freeze({}), muted: false, damageNumbers: true, officialDamageNumbers: false, ammoEnergyCount: false, combatMetrics: false, prepDeployFold: true, quality: 'high', officialFx: 'auto', otherSkins: true, textSize: 'sm', keys: DEFAULT_HOTKEYS });",
  " *  of the operator's own model. A pure client preference (never sent): off, only this player's own pieces wear a skin.\n *  skinsOn: 设置「显示皮肤」 (this fork) — the wider switch: off draws EVERY piece, this player's own included, with the\n *  operator's default model. skinsAutoEquip: 设置「一键装备皮肤」 (this fork, D037) — seeds one skin per operator until the\n *  player chooses. chatDanmaku: 设置「聊天弹幕」 (this fork), ON by default.\n */\nexport const DEFAULT_SETTINGS = Object.freeze({ bgm: 0.6, sfx: 0.8, voice: 0.8, voiceLang: 'cn', voiceNative: false, voiceOverrides: Object.freeze({}), muted: false, damageNumbers: true, officialDamageNumbers: false, ammoEnergyCount: false, combatMetrics: false, prepDeployFold: true, quality: 'high', officialFx: 'auto', otherSkins: true, skinsOn: true, skinsAutoEquip: true, chatDanmaku: true, textSize: 'sm', keys: DEFAULT_HOTKEYS });");
edit('public/js/ui/gameLogic/settings.js',
  " *  of the operator's own model. A pure client preference (never sent): off, only this player's own pieces wear a skin.\n */\n *  voiceNative",
  " *  of the operator's own model. A pure client preference (never sent): off, only this player's own pieces wear a skin.\n *  voiceNative");
console.log('  ok settings 并集');

// ---- 6. imports + signatures that BOTH sides extended
edit('public/js/battle/simHost.js',
  "// C4 simulation hosts (DESIGN §32.11). The clock belongs to runner.js. Only the vanilla host has a Battle on the page.\n<<<<<<< HEAD\nimport { loadBrowserSim } from './simLoader.js';\nimport { unitStatsEntry, RESULT_LIMITS } from '../../../shared/protocol.js';\n=======\nimport { loadBrowserSim, checkOperatorTraitRuntime } from './simLoader.js';\nimport { unitStatsEntry } from '../../../shared/protocol.js';\n>>>>>>> upstream/v031",
  "// C4 simulation hosts (DESIGN §32.11). The clock belongs to runner.js. Only the vanilla host has a Battle on the page.\nimport { loadBrowserSim, checkOperatorTraitRuntime } from './simLoader.js';\nimport { unitStatsEntry, RESULT_LIMITS } from '../../../shared/protocol.js';");
edit('public/js/main.js',
  "<<<<<<< HEAD\nimport { installLoadoutSync, installOwnershipSync, installDiySync } from './ui/loadoutSync.js';\nimport { installSkinsSync, loadSkinData } from './ui/skins.js';\n=======\nimport { installLoadoutSync, installOwnershipSync, installDiySync, installSkinsSync } from './ui/loadoutSync.js';\n>>>>>>> upstream/v031",
  "import { installLoadoutSync, installOwnershipSync, installDiySync, installSkinsSync } from './ui/loadoutSync.js';");
edit('public/js/ui/teamPanel.js',
  "<<<<<<< HEAD\nexport function TeamPanel({ pub, myId, watching, bubbles, emotes = [], emoteNow = Date.now(), emoteTtl = 3000,\n  onWatch, compact = false, observe = null, self: selfLive = null, cap = 10, uniteLocal = null }) {\n=======\nexport function TeamPanel({ pub, myId, watching, bubbles, onWatch, compact = false, observe = null, self: selfLive = null, cap = 10, uniteLocal = null, spMarks = null }) {\n>>>>>>> upstream/v031",
  "// this fork passes the 表情 (emotes) row; upstream 0.3.1 passes spMarks\nexport function TeamPanel({ pub, myId, watching, bubbles, emotes = [], emoteNow = Date.now(), emoteTtl = 3000,\n  onWatch, compact = false, observe = null, self: selfLive = null, cap = 10, uniteLocal = null, spMarks = null }) {");
edit('public/js/ui/fieldHost.js',
  "<<<<<<< HEAD\n    safeTop = Math.max(0, hud?.top || 0);\n    if (folded && hud && hud.bottom > 0) safeBottom = Math.max(0, h - hud.bottom);\n    corner = cornerBand(h);\n=======\n    safeTop = Math.max(0, (hud?.top || 0) - oy);\n    if (folded) {\n      if (hud && hud.bottom - oy > 0) safeBottom = Math.max(0, h - (hud.bottom - oy));\n      corner = cornerBand(h, oy);\n    }\n>>>>>>> upstream/v031",
  "    // upstream measures from the board host (oy); this fork keeps its chat toggle in the corner band\n    safeTop = Math.max(0, (hud?.top || 0) - oy);\n    if (folded) {\n      if (hud && hud.bottom - oy > 0) safeBottom = Math.max(0, h - (hud.bottom - oy));\n      corner = cornerBand(h, oy);\n    }");
edit('public/js/ui/fieldHost.js',
  "<<<<<<< HEAD\nfunction cornerBand(h) {\n  const btns = document.querySelectorAll('.gm__corner .gm__gear, .gm__corner .ewheel__btn, .gm__corner .mchat-toggle');\n=======\nfunction cornerBand(h, oy = 0) {\n  const btns = document.querySelectorAll('.gm__corner .gm__gear, .gm__corner .ewheel__btn');\n>>>>>>> upstream/v031",
  "function cornerBand(h, oy = 0) {\n  // this fork's 聊天 toggle is one of the corner buttons, so its tap area counts too\n  const btns = document.querySelectorAll('.gm__corner .gm__gear, .gm__corner .ewheel__btn, .gm__corner .mchat-toggle');");
console.log('  ok 四个「两边都加了」的文件');
