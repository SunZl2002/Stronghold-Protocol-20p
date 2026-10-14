// tools/inject-skins-assets.mjs — 将 08-skins.json 的 174 款皮肤资产注入到 data/assets.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSkel } from './assets/skel.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESEARCH_PATH = path.join(ROOT, 'docs', 'research', '08-skins.json');
const ASSETS_PATH = path.join(ROOT, 'data', 'assets.json');

const research = JSON.parse(fs.readFileSync(RESEARCH_PATH, 'utf8'));
const assets = JSON.parse(fs.readFileSync(ASSETS_PATH, 'utf8'));

/**
 * 干员原皮的动作数据只保留皮肤骨骼**真的有**的那些。
 *
 * 皮肤与原皮的动画集并不完全一致：实测 `Skill_Start` 在原皮里有、在某款皮肤的骨骼里没有，
 * 照抄过去客户端 `state.setAnimation(0, 'Skill_Start')` 会抛 `Animation not found`。
 * 所以按皮肤骨骼的真实动画名过滤一遍；解析失败（返回空数组）时退回原样 —— 宁可多给，
 * 也不要因为解析器不可用而把动作数据静默丢光。
 * @param {any} anims 原皮的 anims
 * @param {string[]} have 皮肤骨骼的动画名
 */
function filterAnims(anims, have) {
  if (!anims || typeof anims !== 'object' || !have.length) return anims;
  const ok = (n) => typeof n === 'string' && have.includes(n);
  const out = {};
  for (const [role, clip] of Object.entries(anims)) {
    if (typeof clip === 'string') { if (ok(clip)) out[role] = clip; continue; }
    if (!clip || typeof clip !== 'object') { out[role] = clip; continue; }
    const kept = {};
    for (const [k, v] of Object.entries(clip)) {
      if (typeof v === 'string') { if (ok(v)) kept[k] = v; continue; }
      if (v && typeof v === 'object') {
        const inner = {};
        for (const [k2, v2] of Object.entries(v)) if (typeof v2 !== 'string' || ok(v2)) inner[k2] = v2;
        if (Object.keys(inner).length) kept[k] = inner;
        continue;
      }
      kept[k] = v;
    }
    if (Object.keys(kept).length) out[role] = kept;
  }
  return out;
}

/** 皮肤骨骼的真实动画名；解析失败返回空数组（调用方据此退回原样）。 */
function skelAnimations(skelPath) {
  try {
    return parseSkel(new Uint8Array(fs.readFileSync(skelPath))).animations || [];
  } catch {
    return [];
  }
}

if (!assets.chars) {
  console.error('✘ assets.json 缺少 chars 字段');
  process.exit(1);
}

let injectedCount = 0;
let charsCount = 0;

for (const [charId, skinList] of Object.entries(research.skins || {})) {
  const charRec = assets.chars[charId];
  if (!charRec) continue;

  charRec.skins = charRec.skins || {};
  charsCount++;

  for (const s of skinList) {
    const skinId = s.skinId;
    const stem = s.stem;

    // 提取 avatar：优先使用本地离线内置头像路径
    const localAvatar = path.join(ROOT, 'public', 'assets', 'char', 'skin_avatar', `${stem}.png`);
    const avatarUrl = fs.existsSync(localAvatar)
      ? `/assets/char/skin_avatar/${stem}.png`
      : (s.avatar?.url || null);

    const skinEntry = {
      name: s.name,
      group: s.group || '',
      avatar: avatarUrl,
    };

    // 半身立绘（商店卡片那一张）：和 spine 一样，只在文件真的落地时才写 —— 上游只有一部分皮肤有立绘，
    // 缺的那些让客户端回退到干员原皮立绘（tools/fetch-skin-portraits.mjs）
    const localPortrait = path.join(ROOT, 'public', 'assets', 'char', 'skin_portrait', `${stem}.png`);
    if (fs.existsSync(localPortrait)) skinEntry.portrait = `/assets/char/skin_portrait/${stem}.png`;

    // 只有在本地磁盘确实存在该皮肤的 Spine 骨骼时才注入 spine 字段，否则留空由渲染器平滑使用干员原皮骨骼
    const localFrontSkel = path.join(ROOT, 'public', 'assets', 'spine', 'op', charId, stem, 'front', `${stem}.skel`);
    if (fs.existsSync(localFrontSkel)) {
      const defaultFront = charRec.spine?.front || {};
      const defaultBack = charRec.spine?.back || {};

      // 皮肤骨骼真实的动画名：原皮的动作数据要按它过滤，否则客户端会播一个不存在的动画
      const frontAnims = skelAnimations(localFrontSkel);
      skinEntry.spine = {
        front: {
          skel: `/assets/spine/op/${charId}/${stem}/front/${stem}.skel`,
          atlas: `/assets/spine/op/${charId}/${stem}/front/${stem}.atlas`,
          textures: [`/assets/spine/op/${charId}/${stem}/front/${stem}.png`],
          pma: false,
          anims: filterAnims(defaultFront.anims || {}, frontAnims),
          animations: defaultFront.animations || {},
          events: defaultFront.events || ['OnAttack', 'OnStart'],
          hits: defaultFront.hits || {},
          bounds: defaultFront.bounds || null,
        },
      };

      const localBackSkel = path.join(ROOT, 'public', 'assets', 'spine', 'op', charId, stem, 'back', `${stem}.skel`);
      if (fs.existsSync(localBackSkel)) {
        skinEntry.spine.back = {
          skel: `/assets/spine/op/${charId}/${stem}/back/${stem}.skel`,
          atlas: `/assets/spine/op/${charId}/${stem}/back/${stem}.atlas`,
          textures: [`/assets/spine/op/${charId}/${stem}/back/${stem}.png`],
          pma: false,
          anims: filterAnims((defaultBack.anims || defaultFront.anims) || {}, skelAnimations(localBackSkel)),
          animations: defaultBack.animations || defaultFront.animations || {},
          events: defaultBack.events || ['OnAttack', 'OnStart'],
          hits: defaultBack.hits || {},
          bounds: defaultBack.bounds || null,
        };
      }
    }

    charRec.skins[skinId] = skinEntry;
    injectedCount++;
  }
}

// 更新 stats
assets.stats = assets.stats || {};
assets.stats.skins = injectedCount;
assets.stats.charsWithSkins = charsCount;

// 安全写入，保持原有排版
fs.writeFileSync(ASSETS_PATH, JSON.stringify(assets), 'utf8');
console.log(`✔ 成功向 data/assets.json 注入 ${charsCount} 名干员的共 ${injectedCount} 套皮肤资产条目。`);
