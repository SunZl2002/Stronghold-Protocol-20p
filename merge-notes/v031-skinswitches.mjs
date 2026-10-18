// v0.3.1 merge, step 14: ui/skins.js is upstream 0.3.1's file now, and it has ONE switch (显示其他玩家的皮肤). This fork's
// two older switches are ported on top of it (D037), which is what the owner's option-1 decision asked for:
//   * 显示皮肤 `skinsOn`         — the WIDER switch: off draws EVERY piece with the operator's default model, this
//                                  player's own included. `chosenSkin` returns null, so every surface follows at once.
//   * 一键装备皮肤 `skinsAutoEquip` — on (the default) an operator with no stored choice wears the first skin it can
//                                  actually play (a model-bearing one), derived on read rather than seeded into storage.
// Both arrive as injected policies so this module never imports the settings store (which imports it back).
import fs from 'node:fs';

const cwd = process.argv[2];
const file = `${cwd}/public/js/ui/skins.js`;
let text = fs.readFileSync(file, 'utf8');

if (text.includes('export function skinsVisible')) { console.log('  -- 已移植过'); process.exit(0); }

// 1. chosenSkin: honour both switches
const before = [
  'export function chosenSkin(charId, entries = null) {',
  '  const id = str(charId);',
  '  if (!id) return null;',
  '  const want = str((entries || skinsStore.get()[SKINS_KEY] || {})[id]);',
  '  if (!want) return null;',
  '  return availableSkins(id).some((x) => !x.own && x.playable && x.id === want) ? want : null;',
  '}',
].join('\n');
const after = [
  'export function chosenSkin(charId, entries = null) {',
  '  if (!skinsVisible()) return null;',
  '  const id = str(charId);',
  '  if (!id) return null;',
  '  const playable = availableSkins(id).filter((x) => !x.own && x.playable);',
  '  const want = str((entries || skinsStore.get()[SKINS_KEY] || {})[id]);',
  '  // 一键装备皮肤 (this fork, D037): a browser that never chose wears the first playable skin of every operator',
  '  if (!want) return skinsAutoEquip() && playable.length ? playable[0].id : null;',
  '  return playable.some((x) => x.id === want) ? want : null;',
  '}',
].join('\n');
if (!text.includes(before)) throw new Error('chosenSkin 的形状和预期不同');
text = text.replace(before, after);

// 2. the fork's switch block, appended
text += `

// ---- 本多人分支：显示皮肤 / 一键装备皮肤 (D037) ------------------------------------------------------------
// upstream 0.3.1 只有一个开关（显示其他玩家的皮肤，settings.otherSkins，render/app.js 读）。这一分支原来的两个开关保留在
// 它之上：显示皮肤（skinsOn，更宽——关掉时连自己的棋子也画原皮）与一键装备皮肤（skinsAutoEquip，默认开——没选过的浏览器
// 给每个干员穿上第一套能上场的外观）。两者都以注入策略的形式进来，这样本模块不必 import 设置 store（那会形成循环引用）。

/** @type {() => boolean} whether this browser draws skins at all */
let skinsShown = () => true;
/** @param {() => boolean} fn 设置「显示皮肤」 */
export function setSkinsPolicy(fn) { if (typeof fn === 'function') skinsShown = fn; }
/** Whether this browser draws skins at all (the global switch). */
export function skinsVisible() { try { return skinsShown() !== false; } catch { return true; } }

/** @type {() => boolean} whether this browser dresses its operators automatically */
let skinsAuto = () => true;
/** @param {() => boolean} fn 设置「一键装备皮肤」 */
export function setSkinsAutoPolicy(fn) { if (typeof fn === 'function') skinsAuto = fn; }
/** Whether this browser dresses its operators automatically. */
export function skinsAutoEquip() { try { return skinsAuto() !== false; } catch { return true; } }

/** A cheap "the settings changed" subscription: a component reading this version repaints when a switch moves. */
const policyStore = createStore({ v: 0 });
export function bumpSkinsPolicy() { policyStore.set('v', (policyStore.get().v || 0) + 1); }
export const useSkinsPolicy = () => policyStore.get().v;

/** How many operators carry a stored choice (the settings dialog shows the dress's extent). Writes nothing. */
const dressedCount = () => Object.keys(skinsStore.get()[SKINS_KEY] || {}).length;
export function clearDefaultSkins() { return dressedCount(); }
export function restoreDefaultSkins() { return dressedCount(); }
`;
fs.writeFileSync(file, text, 'utf8');
const out = text;
for (const k of ['skinsVisible', 'skinsAutoEquip', 'bumpSkinsPolicy', 'clearDefaultSkins', 'restoreDefaultSkins', 'setSkinsPolicy', 'setSkinsAutoPolicy']) {
  console.log(`  ${out.includes('export function ' + k) || out.includes('export const ' + k) ? 'ok' : '!!'} ${k}`);
}
