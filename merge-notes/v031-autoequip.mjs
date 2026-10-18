// v0.3.1 merge, step 19: 一键装备皮肤 must not change what `chosenSkin` means. Upstream's `chosenSkin(charId)` answers
// "what did this browser CHOOSE" and returns null when nothing is stored — that null is the picker's 默认 tile, and
// upstream's tests assert it. Seeding inside `chosenSkin` turned every operator into "wearing something", which broke
// `皮肤 picker: the choice`, `a stored id that is not one of this operator's wear-able skins counts as 默认` and
// `clearSkin drops one entry…`.
//
// So the dress becomes an explicit seed over the store (this fork's original shape): `autoEquipSkins()` writes one entry
// per operator that has none, and `restoreDefaultSkins()` / `clearDefaultSkins()` are its two directions.
import fs from 'node:fs';

const cwd = process.argv[2];
const file = `${cwd}/public/js/ui/skins.js`;
let text = fs.readFileSync(file, 'utf8');

// 1. chosenSkin back to upstream's rule
const bad = [
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
const good = [
  'export function chosenSkin(charId, entries = null) {',
  '  if (!skinsVisible()) return null;',
  '  const id = str(charId);',
  '  if (!id) return null;',
  '  const want = str((entries || skinsStore.get()[SKINS_KEY] || {})[id]);',
  '  if (!want) return null;',
  '  return availableSkins(id).some((x) => !x.own && x.playable && x.id === want) ? want : null;',
  '}',
].join('\n');
if (!text.includes(bad)) throw new Error('chosenSkin 不是脚本写下的形状');
text = text.replace(bad, good);

// 2. the dress writes the store instead of overriding the read
const oldTail = [
  '/** How many operators carry a stored choice (the settings dialog shows the dress\'s extent). Writes nothing. */',
  'const dressedCount = () => Object.keys(skinsStore.get()[SKINS_KEY] || {}).length;',
  'export function clearDefaultSkins() { return dressedCount(); }',
  'export function restoreDefaultSkins() { return dressedCount(); }',
].join('\n');
const newTail = [
  '/** How many operators carry a stored choice (the settings dialog shows the dress\'s extent). */',
  'const dressedCount = () => Object.keys(skinsStore.get()[SKINS_KEY] || {}).length;',
  '',
  '/**',
  ' * 一键装备皮肤 (D037): give every operator that has no choice yet the first appearance it can actually wear. Writes the',
  ' * store, so `chosenSkin` keeps meaning "what this browser chose" — the picker\'s 默认 tile still shows for an operator',
  ' * whose skins are all art-only. Returns how many operators the dress added.',
  ' * @returns {number}',
  ' */',
  'export function autoEquipSkins() {',
  '  if (!skinsVisible() || !skinsAutoEquip()) return 0;',
  '  const chars = data.get(\'assets\')?.chars;',
  '  if (!chars || typeof chars !== \'object\') return 0;',
  '  const current = skinsStore.get()[SKINS_KEY] || {};',
  '  const next = { ...current };',
  '  let added = 0;',
  '  for (const charId of Object.keys(chars)) {',
  '    if (next[charId]) continue;',
  '    const first = availableSkins(charId).find((x) => !x.own && x.playable);',
  '    if (first) { next[charId] = first.id; added++; }',
  '  }',
  '  if (added) setSkins(next);',
  '  return added;',
  '}',
  '',
  '/** Settings → 一键装备皮肤 switched off: the dress stops, and the stored choices stay (turning it back on re-seeds). */',
  'export function clearDefaultSkins() { return dressedCount(); }',
  '/** Settings → 一键装备皮肤 switched back on: dress the operators that still have no choice. */',
  'export function restoreDefaultSkins() { return autoEquipSkins(); }',
].join('\n');
if (!text.includes(oldTail)) throw new Error('尾部不是脚本写下的形状');
text = text.replace(oldTail, newTail);

fs.writeFileSync(file, text, 'utf8');
console.log('  ok chosenSkin 恢复上游语义；一键装备改为写 store 的 autoEquipSkins()');
