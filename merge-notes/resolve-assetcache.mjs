// Throwaway: public/js/assetCache.js is a whole-file conflict because upstream 0.3.0 REPLACED this module.
//
//   theirs: the imported-asset cache (IMPORTED_ASSET_CACHE, importSupport, registerImportedAssetWorker, …) — used by
//           main.js:58, assetDownload.js, assetPack.js, ui/assetImport.js
//   ours:   the browser asset-cache coordinator (assetCache, createAssetCacheManager) — used by main.js:71, net.js,
//           ui/assetCache.js
//
// Neither side is a superset: taking upstream deletes `assetCache`, taking ours deletes `registerImportedAssetWorker`.
// So the file becomes the UNION — upstream's module (it is part of 0.3.0 and its consumers are upstream's own code),
// with this fork's coordinator appended.
import fs from 'node:fs';

const cwd = process.argv[2];
const file = `${cwd}/public/js/assetCache.js`;
const lines = fs.readFileSync(file, 'utf8').split('\n');

let s = -1, mid = -1, end = -1;
for (let i = 0; i < lines.length; i++) {
  if (s < 0 && lines[i].startsWith('<<<<<<<')) { s = i; continue; }
  if (s >= 0 && mid < 0 && lines[i].startsWith('=======')) { mid = i; continue; }
  if (mid >= 0 && lines[i].startsWith('>>>>>>>')) { end = i; break; }
}
if (s !== 0 || mid < 0 || end < 0) throw new Error(`unexpected conflict layout: s=${s} mid=${mid} end=${end}`);

const ours = lines.slice(s + 1, mid);
const theirs = lines.slice(mid + 1, end);

const banner = [
  '// This file carries TWO modules after the 0.3.0 sync, because upstream replaced the module that used to live here and',
  '// this fork keeps its own. Both halves are imported by shipped code, so neither can win:',
  '//',
  '//   1. the imported-asset cache (upstream 0.3.0): IMPORTED_ASSET_CACHE, importSupport, registerImportedAssetWorker, …',
  '//      read by main.js, assetDownload.js, assetPack.js and ui/assetImport.js',
  '//   2. the browser asset-cache coordinator (this fork, docs/ASSET_CACHE.md): assetCache, createAssetCacheManager',
  '//      read by main.js, net.js and ui/assetCache.js',
  '//',
  '// When the two are split again, the coordinator belongs in its own file next to ui/assetCache.js.',
  '',
];

const out = [
  ...banner,
  '// ---- 1/2 imported-asset cache (upstream 0.3.0) --------------------------------------------------------------',
  ...theirs.filter((l, i) => !(i === 0 && l.trim() === '')),
  '',
  '// ---- 2/2 browser asset-cache coordinator (this fork) -------------------------------------------------------',
  ...ours,
  ...lines.slice(end + 1),
];

fs.writeFileSync(file, out.join('\n'), 'utf8');
const left = (out.join('\n').match(/^<{7}|^>{7}/gm) || []).length;
console.log(`  残留标记 ${left}`);
console.log(`  上游半 ${theirs.length} 行 + 我们半 ${ours.length} 行 → 共 ${out.length} 行`);

// every symbol the repo imports from this path must now exist
const text = out.join('\n');
const want = ['IMPORTED_ASSET_CACHE', 'importSupport', 'registerImportedAssetWorker', 'assetCache', 'createAssetCacheManager'];
for (const w of want) {
  const re = new RegExp(`export (?:const|function|class|async function|let) ${w}\\b`);
  console.log(`  ${re.test(text) ? '✅' : '❌'} 导出 ${w}`);
}
