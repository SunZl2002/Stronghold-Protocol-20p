// tools/fetch-skin-portraits.mjs — 下载皮肤半身立绘（商店卡片的图），并入 data/assets.json 的 skins[].portrait
//
// 来源：fexli/ArknightsResource 的 `charpor/`（README_CN §0x02：干员半身像，干员页 / 抽卡模拟）。
// 命名就是清单里的 `stem`，尺寸 180×360 —— 与干员原皮立绘（public/assets/char/portrait/<charId>_1.png）
// 完全一致，所以商店卡片可以直接换图，不用改 CSS。
//
// 上游只有一部分皮肤有立绘（实测 109/174 有，其余 404）。**缺的不是失败**：注入器只在文件真的落地时
// 才写 `portrait`，缺的那些自然回退到干员原皮立绘，卡片不会开天窗。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESEARCH_PATH = path.join(ROOT, 'docs', 'research', '08-skins.json');
const TARGET_DIR = path.join(ROOT, 'public', 'assets', 'char', 'skin_portrait');
const MIRRORS = [
  (stem) => `https://cdn.jsdelivr.net/gh/fexli/ArknightsResource@main/charpor/${stem}.png`,
  (stem) => `https://raw.githubusercontent.com/fexli/ArknightsResource/main/charpor/${stem}.png`,
];

fs.mkdirSync(TARGET_DIR, { recursive: true });

const research = JSON.parse(fs.readFileSync(RESEARCH_PATH, 'utf8'));

const tasks = [];
for (const skinList of Object.values(research.skins || {})) {
  for (const s of skinList) {
    if (!s.stem) continue;
    tasks.push({ stem: s.stem, skinId: s.skinId, dest: path.join(TARGET_DIR, `${s.stem}.png`) });
  }
}
console.log(`[skin-portraits] 待检查/下载立绘任务总数: ${tasks.length}`);

/** A portrait is a 180×360 PNG; anything else (an HTML error page, an LFS pointer) is rejected. */
function isPortrait(buf) {
  if (buf.length < 1024) return false;
  const png = buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG';
  if (!png) return false;
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  return w === 180 && h === 360;
}

async function downloadOne(task) {
  if (fs.existsSync(task.dest) && fs.statSync(task.dest).size > 1024) return 'skipped';
  for (const mk of MIRRORS) {
    try {
      const res = await fetch(mk(task.stem), { headers: { 'User-Agent': 'Stronghold-Assets-Sync/1.0' } });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (!isPortrait(buf)) continue;
      fs.writeFileSync(task.dest, buf);
      return 'downloaded';
    } catch { /* next mirror */ }
  }
  return 'failed';
}

const CONCURRENCY = 10;
let cursor = 0, downloaded = 0, skipped = 0, failed = 0;
async function worker() {
  while (cursor < tasks.length) {
    const r = await downloadOne(tasks[cursor++]);
    if (r === 'downloaded') downloaded++;
    else if (r === 'skipped') skipped++;
    else failed++;
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

console.log(`[skin-portraits] 完成: 新下载 ${downloaded}, 已存在 ${skipped}, 上游没有 ${failed}`);
if (failed) console.log(`[skin-portraits] 上游没有立绘的 ${failed} 款会回退到干员原皮立绘（不是错误）`);
console.log('[skin-portraits] 接着运行 node tools/inject-skins-assets.mjs 把 portrait 写进 data/assets.json');
