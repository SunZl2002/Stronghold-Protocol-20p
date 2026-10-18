// 皮肤查询 (docs/SKINS.md) — this fork's call sites ask "which skin does this CHESS wear", while upstream 0.3.1's model
// keys a choice by operator charId (`ui/skins.js chosenSkin(charId)`): one entry then covers an operator's normal piece,
// its elite and a 自选 slot fielding it. This resolves the chess id to its charId and reads upstream's store, so every
// surface keeps using the one rule the picker writes.
//
// Reactivity: `chosenSkin` reads the skins store, so calling this during a render re-runs that component when the choice
// changes (the reason the call sites have a line like this at all — a thumbnail otherwise keeps the art it first drew).

import { chosenSkin } from './skins.js';
import { getChess } from '../data.js';

/**
 * @param {string|null|undefined} chessId
 * @returns {{ skinId: string|null }}
 */
export function useSkin(chessId) {
  const rec = typeof chessId === 'string' ? getChess(chessId) : null;
  const charId = rec && typeof rec.charId === 'string' ? rec.charId : null;
  return { skinId: charId ? chosenSkin(charId) : null };
}
