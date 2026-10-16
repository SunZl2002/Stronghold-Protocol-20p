// Throwaway: the four conflicts resolved by hand in the previous sitting but NOT scripted, so a replay lost them.
// Each is "both sides added their own thing"; the merged result is written verbatim by matching the marker blocks.
import fs from 'node:fs';

const cwd = process.argv[2];
const L = (f) => fs.readFileSync(`${cwd}/${f}`, 'utf8').split('\n');

/** Replace the first marker block whose OURS text contains `needle`. */
function fixFirst(file, needle, text) {
  const lines = L(file);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('<<<<<<<')) continue;
    let mid = -1;
    let end = -1;
    for (let j = i + 1; j < lines.length; j++) {
      if (mid < 0 && lines[j].startsWith('=======')) mid = j;
      else if (mid >= 0 && lines[j].startsWith('>>>>>>>')) { end = j; break; }
    }
    if (mid < 0 || end < 0) continue;
    const ours = lines.slice(i + 1, mid).join('\n');
    if (!ours.includes(needle)) continue;
    const out = [...lines.slice(0, i), ...text, ...lines.slice(end + 1)];
    fs.writeFileSync(`${cwd}/${file}`, out.join('\n'), 'utf8');
    const left = (out.join('\n').match(/^<{7}|^>{7}/gm) || []).length;
    console.log(`  ${file.padEnd(34)} 1 处 → 残留标记 ${left}`);
    return true;
  }
  console.log(`  ${file.padEnd(34)} ⚠️ 没找到含 ${JSON.stringify(needle)} 的块`);
  return false;
}

// ---- public/js/ui/settings.js : import list
fixFirst('public/js/ui/settings.js', 'setSkinsPolicy', [
  "import { setSkinsPolicy, setSkinsAutoPolicy, bumpSkinsPolicy, clearDefaultSkins, restoreDefaultSkins } from './skins.js';",
  "import { catalog, loadCatalog, cosmeticPlugins, installedCount, personal, personalApplied, personalSet, pluginName, setPersonalPlugin } from '../content.js';",
  "import { setUiPlugin, uiPluginEntries, uiPlugins } from './uiPlugins.js';",
  "import { UI_LIMITS } from '../../../shared/plugins/ui.js';",
  "import { toast, describeError } from './toasts.js';",
  "import { pluginMicro } from './pluginTag.js';",
  "import { fxAvailable } from '../render/vfx/available.js';",
  "import { resolveOfficialFx } from '../render/vfx/tier.js';",
]);

// ---- public/js/ui/settings.js : the switch block (both sets of toggles stay)
fixFirst('public/js/ui/settings.js', '显示皮肤', [
  "      <${Toggle} label=${t('显示皮肤')} micro=\"OPERATOR SKINS\" value=${s.skinsOn} onChange=${(v) => updateSettings({ skinsOn: v })} />",
  "      <p class=\"set-hint\" data-testid=\"skins-on-note\">${t('关闭后全场干员都显示原皮，包括其他玩家装备的皮肤。')}</p>",
  "      <${Toggle} label=${t('一键装备皮肤')} micro=\"AUTO-EQUIP SKINS\" value=${s.skinsAutoEquip} onChange=${(v) => updateSettings({ skinsAutoEquip: v })} />",
  "      <p class=\"set-hint\" data-testid=\"skins-auto-note\">${s.skinsOn",
  "        ? t('开启时每个干员自动穿上已实装的皮肤；关闭后只显示原皮，但仍能看到其他玩家装备的皮肤。')",
  "        : t('「显示皮肤」已关闭，全场都显示原皮。')}</p>",
  "      <${Toggle} label=${t('聊天弹幕')} micro=\"CHAT DANMAKU\" value=${s.chatDanmaku} onChange=${(v) => updateSettings({ chatDanmaku: v })} />",
  "      <p class=\"set-hint\" data-testid=\"chat-danmaku-note\">${t('开启后，别人发的聊天消息会以弹幕形式从头像旁飘过一次（带策略图标、名称和内容）。关闭则只在聊天框里显示。')}</p>",
  "      <${Toggle} label=${t('秘术师能量')} micro=\"STORED ENERGY\" value=${s.mysticEnergy} onChange=${(v) => updateSettings({ mysticEnergy: v })} />",
  "      <p class=\"set-hint\">${t('在秘术师的血条下方显示储存的攻击能量 / 上限（如 2/3）。官方用干员身上的特效表示，没有这个数字。')}</p>",
  "      <${Toggle} label=${t('作战统计')} micro=\"COMBAT STATS\" value=${s.combatMetrics} onChange=${(v) => updateSettings({ combatMetrics: v })} />",
  "      <p class=\"set-hint\">${t('打开后，对局左下角可以查看自己干员的伤害、治疗和 DPS / HPS。官方界面没有这个窗口。改变玩法的插件对局在 Worker 里演算，统计不到，按钮不显示。')}</p>",
]);

// ---- public/js/assets.js : import list
fixFirst('public/js/assets.js', 'runtimeURL', [
  "import { runtimeURL, runtimeCacheMode } from './runtime.js';",
  "import { cosmetics, createCosmeticLayers, EMPTY_MANIFEST } from './cosmetics.js';",
]);

// ---- test/ui/gameLogic.test.js : the sanitizeSettings expectation
fixFirst('test/ui/gameLogic.test.js', 'skinsOn', [
  '      // the whole sanitized shape: junk falls back to the default per field. Upstream 0.3.0\'s settings (voiceNative /',
  "      // combatMetrics / mysticEnergy / officialFx) and this fork's skin + danmaku switches are all part of it now.",
  '      {',
  "        bgm: 1, sfx: 0, voice: 1, voiceLang: 'cn', voiceNative: false, voiceOverrides: {}, muted: false, damageNumbers: false,",
  "        officialDamageNumbers: false, ammoCount: false, combatMetrics: false, mysticEnergy: false, quality: 'high',",
  "        officialFx: 'auto', textSize: 'sm',",
  '        skinsOn: DEFAULT_SETTINGS.skinsOn, skinsAutoEquip: DEFAULT_SETTINGS.skinsAutoEquip,',
  '        chatDanmaku: DEFAULT_SETTINGS.chatDanmaku,',
  '        keys: { ...DEFAULT_SETTINGS.keys },',
  '      },',
]);

// ---- tools/package.mjs : the two shipped-file manifests
fixFirst('tools/package.mjs', 'PLAYER_DOCS', [
  "// This fork's own docs (announcements, the asset cache, server settings) PLUS upstream 0.3.0's plugin docs.",
  "export const PLAYER_DOCS = ['docs/PLAYING.md', 'docs/DEPLOY.md', 'docs/ANNOUNCEMENTS.md', 'docs/ASSET_CACHE.md', 'docs/SERVER_SETTINGS.md',",
  "  'docs/PLUGINS.md', 'docs/PLUGIN-GUIDE.md', 'docs/PLUGIN-DSL.md', 'docs/PLUGIN-API.md', 'docs/plugin-catalog.example.json'];",
  '/** The author harness has no test-only dependencies; the rest of test/ stays out. */',
  "export const AUTHOR_TEST_FILES = ['test/helpers/battleHarness.js'];",
  '/** Only these repository-owned plugin resources ship, even if an owner\'s plugin was accidentally tracked. */',
  "export const isPluginResource = (rel) => rel === 'plugins/README.md' || rel === 'plugins/AGENTS.md' || rel.startsWith('plugins/_template/');",
  "/** Research tables read at run time: server/sim/nodeData.js (the Node sim's fallback), tools/fetch-assets.mjs and this fork's skin tools (08-skins.json drives the avatar/model fetches). */",
  "export const RUNTIME_RESEARCH = ['docs/research/03-operators.json', 'docs/research/05-enemies.json', 'docs/research/05-maps.json', 'docs/research/07-assets.json', 'docs/research/08-skins.json'];",
]);
fixFirst('tools/package.mjs', 'PLAYER_TOOLS', [
  "// This fork's tools (announcements, the asset cache, server settings, the skin pipeline) PLUS upstream 0.3.0's plugin CLI.",
  "export const PLAYER_TOOLS = ['tools/announcements.mjs', 'tools/asset-cache-pack.mjs', 'tools/crop-board-atlas.mjs', 'tools/doctor.mjs', 'tools/fetch-assets.mjs', 'tools/fetch-skin-avatars.mjs', 'tools/fetch-skin-portraits.mjs', 'tools/fetch-skin-spines.mjs', 'tools/fetch-stats-assets.mjs', 'tools/inject-skins-assets.mjs', 'tools/plugin.mjs', 'tools/server-settings.mjs', 'tools/setup.mjs', 'tools/vendor.mjs'];",
]);
