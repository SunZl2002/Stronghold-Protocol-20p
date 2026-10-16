// Throwaway: the two remaining conflicts whose resolution needs real merging (not plain "both"), now scripted.
import fs from 'node:fs';

const cwd = process.argv[2];
const L = (f) => fs.readFileSync(`${cwd}/${f}`, 'utf8').split('\n');
const W = (f, lines) => fs.writeFileSync(`${cwd}/${f}`, lines.join('\n'), 'utf8');

/** Replace the first block whose OURS contains `needle` with `text`. */
function fixFirst(file, needle, text) {
  const lines = L(file);
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('<<<<<<<')) continue;
    let mid = -1, end = -1;
    for (let j = i + 1; j < lines.length; j++) {
      if (mid < 0 && lines[j].startsWith('=======')) mid = j;
      else if (mid >= 0 && lines[j].startsWith('>>>>>>>')) { end = j; break; }
    }
    if (mid < 0 || end < 0) continue;
    if (!lines.slice(i + 1, mid).join('\n').includes(needle)) continue;
    W(file, [...lines.slice(0, i), ...text, ...lines.slice(end + 1)]);
    console.log(`  ${file.padEnd(34)} 1 处`);
    return true;
  }
  console.log(`  ${file.padEnd(34)} ⚠️ 未找到含 ${JSON.stringify(needle)} 的块`);
  return false;
}

// ---- server/match/choices.js : imports (union)
fixFirst('server/match/choices.js', 'MAX_DRAFT_CARDS', [
  "import { MAX_DRAFT_CARDS } from '../../shared/constants.js';",
  "import { PLUGIN_GAIN_COUNT_MAX } from '../../shared/plugins/limits.js';",
]);
// ---- server/match/choices.js : the gain loop — upstream's cap AND this fork's `player`
fixFirst('server/match/choices.js', 'rollItemId', [
  '        // This fork passes `player` to rollItemId (per-player pool handling); upstream caps the count, because a',
  '        // gameplay plugin can raise `count` and would otherwise hand out an unbounded number of items.',
  '        const gain = Math.min(PLUGIN_GAIN_COUNT_MAX, count);',
  '        for (let i = 0; i < gain; i++) {',
  '          const id = m.rollItemId({ pool: bs.pool, player: ps });',
  '          if (id) ps.acquireItem(id, { source: \'choice\' });',
  '        }',
]);

// ---- public/js/render/units.js : `_pictureUrl` keeps upstream's "return the url" shape, with the skin threaded in
fixFirst('public/js/render/units.js', 'ICE_TOKENS', [
  '    // this fork (docs/SKINS.md): the skin is part of the picture AND of its identity — switching a skin must not',
  '    // reuse the previous image, which is why `_loadPicture` puts the same suffix on `_pic.key` below.',
  '    const skinOpt = this.info.skin ? { skin: this.info.skin } : undefined;',
  '    return ICE_TOKENS.has(this.info.defId) ? null',
  '      : a && (a.picture',
  '        ? a.picture(this.info.avatar, skinOpt) || a.picture(this.info.defId, skinOpt) || a.picture(this.info.spine, skinOpt)',
  '        : null) || null;',
  '  }',
]);
// ---- public/js/render/units.js : `_loadSpine` — upstream extracted `_modelEntry`; keep it and put the key suffix back
fixFirst('public/js/render/units.js', '_modelEntry', [
  '    // upstream extracted this (0.3.0); this fork passes the unit\'s skin through it (docs/SKINS.md)',
  '    const entry = this._modelEntry(back);',
]);
