// v0.3.1 merge, step 21 (retry): the settings dialog's toggles. Line-level, because the merge left the block as
//   526 秘术师能量 (mysticEnergy — a key DEFAULT_SETTINGS no longer has)
//   527 its hint
//   528 作战统计 + 529 its hint   ← duplicated by 530/531
//   530 作战统计 + 531 its hint
// Upstream 0.3.1 merged 弹药数量 (PR #552) and 秘术师能量 (PR #636) into ONE 显示弹药与能量数量 bound to `ammoEnergyCount`,
// whose hint carries both example counts. So 526-529 become that switch, and the duplicate 作战统计 pair goes.
import fs from 'node:fs';

const cwd = process.argv[2];
const file = `${cwd}/public/js/ui/settings.js`;
const lines = fs.readFileSync(file, 'utf8').split('\n');

const find = (needle) => lines.findIndex((l) => l.includes(needle));
const mystic = find("label=${t('秘术师能量')}");
const combat = lines.reduce((acc, l, i) => (l.includes("label=${t('作战统计')}") ? [...acc, i] : acc), []);
if (mystic < 0 || combat.length !== 2) throw new Error(`形状不符（mystic ${mystic}, combat ${combat.join(',')}）`);
console.log(`  秘术师能量 @ ${mystic + 1}, 作战统计 @ ${combat.map((i) => i + 1).join(' / ')}`);

const merged = [
  "      <${Toggle} label=${t('显示弹药与能量数量')} micro=\"AMMO & ENERGY\" value=${s.ammoEnergyCount} onChange=${(v) => updateSettings({ ammoEnergyCount: v })} />",
  "      <p class=\"set-hint\">${t('弹药类技能开启时，在弹药条下方显示剩余弹药 / 总弹药数（如 13/14）；秘术师的血条下方显示储存的攻击能量 / 上限（如 2/3）。官方界面没有这些数字。')}</p>",
];

// replace 526-529 (mystic toggle + hint + first combat pair) with the merged pair
const out = [
  ...lines.slice(0, mystic),
  ...merged,
  ...lines.slice(combat[0] + 2),
];
fs.writeFileSync(file, out.join('\n'), 'utf8');
const text = out.join('\n');
console.log(`  mysticEnergy 残留 ${(text.match(/mysticEnergy/g) || []).length}  作战统计 ${(text.match(/作战统计/g) || []).length}  ammoEnergyCount ${(text.match(/ammoEnergyCount/g) || []).length}`);
