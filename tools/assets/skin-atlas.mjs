// tools/assets/skin-atlas.mjs — 皮肤 Spine 图集的规范化（可被下载脚本与工具复用，不做任何 IO 副作用）
//
// 为什么需要：fexli/ArknightsResource 的皮肤 atlas **没有顶层的 `size: W,H` 行**，而本仓库
// `tools/fetch-assets.mjs` 产出的原皮 atlas **有**：
//
//   <stem>.png
//   format: RGBA8888
//   filter: Linear,Linear
//   repeat: none
//   size: 512,512        <- 顶层，整张贴图的尺寸（皮肤缺这一行）
//   B_Tail
//     size: 67, 75       <- 区域内的，是附件在贴图上的大小，两种行不能混为一谈
//
// 缺了顶层那行，仓库的素材校验（test/assets.test.js「every atlas on disk has size: lines」）不通过，
// 而且**位置很关键**：解析器按「非缩进行」切分，插错地方会被当成贴图文件名。
// 因此这里**直接复用仓库自己的 `tools/assets/atlas.mjs`**（`parseAtlas` / `normalizeAtlas`），
// 不再手写插入逻辑。
//
// 皮肤模型是**重新下载就会被覆盖**的，所以规范化必须发生在下载环节（`fetch-skin-spines.mjs`），
// 而不是事后补一次。

import fs from 'node:fs';
import { normalizeAtlas, atlasInfo } from './atlas.mjs';

/** PNG 的宽高（IHDR 在固定偏移），读不出返回 null。 */
export function pngSize(buf) {
  if (!buf || buf.length < 24) return null;
  if (!(buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG')) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * 规范化一个皮肤模型目录（{front,back} 两套）：按各自的贴图尺寸补上顶层 `size: W,H`。
 * 已在正确位置写好的会原样跳过（幂等）；贴图读不出或 atlas 缺失就跳过并计数。
 * @param {string} dir 形如 public/assets/spine/op/<charId>/<stem>
 * @returns {{ fixed: number, ok: number, skipped: number }}
 */
export function normalizeSkinAtlasDir(dir) {
  let fixed = 0, ok = 0, skipped = 0;
  for (const side of ['front', 'back']) {
    const d = `${dir}/${side}`;
    let files;
    try { files = fs.readdirSync(d); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith('.atlas')) continue;
      const atlasPath = `${d}/${f}`;
      const stem = f.replace(/\.atlas$/, '');
      try {
        const text = fs.readFileSync(atlasPath, 'utf8');
        if (atlasInfo(text).hasSize) { ok++; continue; }
        const size = pngSize(fs.readFileSync(`${d}/${stem}.png`));
        if (!size) { skipped++; continue; }
        // normalizeAtlas returns { text, changed, ... } — write its `.text`, not the object
        const out = normalizeAtlas(text, { pageSize: () => size });
        if (out.changed) { fs.writeFileSync(atlasPath, out.text, 'utf8'); fixed++; }
        else skipped++;
      } catch { skipped++; }
    }
  }
  return { fixed, ok, skipped };
}
