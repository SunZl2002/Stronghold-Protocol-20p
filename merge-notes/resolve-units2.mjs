// Throwaway: public/js/render/units.js — resolved from the EXACT block layout, which is now known:
//
//   777 `<<<<<<<`  778-782 ours            783 `=======`  784-792 theirs          793 `>>>>>>>`
//   865 `<<<<<<<`  866 ours                867 `=======`  868 theirs               869 `>>>>>>>`
//
// Block 1's THEIRS side runs PAST `_pictureUrl`: it ends with `_loadPicture`'s head, `url`, `old` and its own `_pic`
// record. That is what broke two earlier attempts (a wholesale replace deletes the next method's head; keeping both
// sides re-declares `skinOpt`). So the region is rebuilt explicitly, in upstream's shape, with this fork's skin.
import fs from 'node:fs';

const file = `${process.argv[2]}/public/js/render/units.js`;
const lines = fs.readFileSync(file, 'utf8').split('\n');

const isMark = (n, tag) => (lines[n - 1] || '').startsWith(tag);
if (!isMark(777, '<<<<<<<') || !isMark(783, '=======') || !isMark(793, '>>>>>>>')
  || !isMark(865, '<<<<<<<') || !isMark(867, '=======') || !isMark(869, '>>>>>>>')) {
  throw new Error('units.js 的冲突布局与预期不符 —— 停下，别猜');
}

const region1 = [
  '    // this fork (docs/SKINS.md): the skin is part of the picture AND of its identity — `_loadPicture` puts the same',
  '    // suffix on `_pic.key` below, so switching a skin never reuses the previous image.',
  '    const skinOpt = this.info.skin ? { skin: this.info.skin } : undefined;',
  '    return ICE_TOKENS.has(this.info.defId) ? null',
  '      : a && (a.picture',
  '        ? a.picture(this.info.avatar, skinOpt) || a.picture(this.info.defId, skinOpt) || a.picture(this.info.spine, skinOpt)',
  '        : null) || null;',
  '  }',
  '',
  '  /** @param {boolean} [replace] another picture replaces a shown one: the old one stays on the diamond until it is there */',
  '  _loadPicture(replace = false) {',
  '    const a = this.ctx.assets;',
  '    const url = this._pictureUrl();',
  '    const old = replace && this._pic && this._pic.state === "img" ? this._pic : null;',
  // the skin belongs in the key, together with the fields upstream's version sets
  "    this._pic = { key: String(this.info.avatar || this.info.defId || 'unknown') + (this.info.skin ? `|${this.info.skin}` : ''), color: this._frameColor(), img: null, state: 'none', shown: null, t0: nowMs(), url, prev: !!old };",
];

const region2 = [
  '    // upstream extracted `_modelEntry` (0.3.0); this fork passes the unit\'s skin through it (docs/SKINS.md)',
  '    const entry = this._modelEntry(back);',
];

// highest region first so line numbers hold
let out = [...lines.slice(0, 864), ...region2, ...lines.slice(869)];
out = [...out.slice(0, 776), ...region1, ...out.slice(793)];

let text = out.join('\n');
// `_modelEntry` itself: upstream's extraction, with the skin threaded through
text = text.replace(
  /( {2}_modelEntry\(back = this\._wantsBack\(\)\) \{\n {4}const a = this\.ctx\.assets;\n {4}const id = this\.info\.spine \|\| this\.info\.defId;\n) {4}return a && a\.spineEntry && id \? a\.spineEntry\(id, \{ back \}\) \|\| null : null;/,
  '$1    // this fork (docs/SKINS.md): the skin picks the model; spineEntry falls back to the base operator when that\n'
  + '    // skin has no model, so a skin can never make a unit render nothing.\n'
  + '    return a && a.spineEntry && id\n'
  + '      ? a.spineEntry(id, this.info.skin ? { back, skin: this.info.skin } : { back }) || null\n'
  + '      : null;',
);
// `_clearPicture` builds the same key, or a later comparison sees a different picture
text = text.replace(
  /(_clearPicture\(\) \{\n)[\s\S]{0,200}?key: String\(this\.info\.avatar \|\| this\.info\.defId \|\| 'unknown'\),/,
  "$1    // the key must match what _loadPicture builds, skin suffix included, or a comparison sees a different picture\n    this._pic = { key: String(this.info.avatar || this.info.defId || 'unknown') + (this.info.skin ? `|${this.info.skin}` : ''),",
);

fs.writeFileSync(file, text, 'utf8');
console.log(`  units.js 残留标记 ${(text.match(/^<{7}|^>{7}/gm) || []).length}`);
for (const [n, re] of [
  ['_modelEntry 传 skin', /_modelEntry\(back = this\._wantsBack\(\)\)[\s\S]{0,400}?skin: this\.info\.skin/],
  ['_pictureUrl 传 skin', /_pictureUrl\(\)[\s\S]{0,600}?a\.picture\(this\.info\.avatar, skinOpt\)/],
  ['_loadPicture key 带皮肤', /_loadPicture[\s\S]{0,600}?info\.skin/],
  ['_clearPicture key 带皮肤', /_clearPicture[\s\S]{0,400}?info\.skin/],
]) console.log(`  ${re.test(text) ? '✅' : '❌'} ${n}`);
