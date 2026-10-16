// Throwaway: finish public/js/render/units.js — the two hunks where upstream extracted methods and this fork added the
// skin argument. Keep upstream's shape (`_modelEntry`, `_loadPicture` setting `_pic` itself) and thread `skin` through.
import fs from 'node:fs';

const file = `${process.argv[2]}/public/js/render/units.js`;
const L = fs.readFileSync(file, 'utf8').split('\n');

// hunk 1 (777..793): upstream keeps `_pictureUrl()` returning the url and `_loadPicture` assigning `_pic`; this fork
// inlines both into `_pictureUrl` so the cache key can carry the skin. Resolution: keep upstream's split, and put the
// skin into BOTH — the url lookup and the cache key that `_loadPicture` builds.
const hunk1 = [
  '    // this fork (docs/SKINS.md): the skin is part of the picture AND of its identity — switching models must not',
  "    // reuse the previous image, so `_loadPicture` puts the same suffix on `_pic.key`.",
  '    return ICE_TOKENS.has(this.info.defId) ? null',
  '      : a && (a.picture',
  "        ? a.picture(this.info.avatar, this.info.skin ? { skin: this.info.skin } : undefined)",
  "          || a.picture(this.info.defId, this.info.skin ? { skin: this.info.skin } : undefined)",
  "          || a.picture(this.info.spine, this.info.skin ? { skin: this.info.skin } : undefined)",
  '        : null) || null;',
  '  }',
];

const out = [
  ...L.slice(0, 776),                 // 1..776
  ...hunk1,                           // replaces 777..793
  ...L.slice(793),                    // 794..
];

// hunk 2's markers have shifted by (793-777+1) - hunk1.length; recompute rather than guess
let text = out.join('\n');
text = text.replace(
  /^<{7} [^\n]*\n([\s\S]*?)^={7}[^\n]*\n([\s\S]*?)^>{7} [^\n]*$/m,
  (whole, ours, theirs) => {
    const merged = theirs.replace(
      /const entry = this\._modelEntry\(back\);/,
      'const entry = this._modelEntry(back);   // this fork: `_modelEntry` passes `info.skin` on',
    );
    return merged;
  },
);
// and fix the `_pic` key in _loadPicture so a skin change is not cached as the old picture
text = text.replace(
  "this._pic = { key: String(this.info.avatar || this.info.defId || 'unknown'), color:",
  "this._pic = { key: String(this.info.avatar || this.info.defId || 'unknown') + (this.info.skin ? `|${this.info.skin}` : ''), color:",
);

fs.writeFileSync(file, text, 'utf8');
const left = (text.match(/^<{7}|^>{7}/gm) || []).length;
console.log(`  残留标记 ${left}`);
const t2 = text.split('\n');
for (let i = 774; i <= 792; i++) console.log(`  ${i + 1}: ${(t2[i] || '').slice(0, 120)}`);
