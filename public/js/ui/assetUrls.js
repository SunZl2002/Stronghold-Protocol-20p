// Asset URL resolution against data/assets.json (docs/ASSETS.md). Pure: every function takes the
// manifest object (or null) and returns a URL string or null — callers draw their own fallback
// (glyph, CSS shape) when null. Only URLs present in the manifest are ever returned, so the client
// never requests files the asset pipeline did not produce (no 404 noise in the console).

const str = (v) => (typeof v === 'string' && v ? v : null);
const obj = (v) => (v && typeof v === 'object' ? v : null);

/** @param {any} m manifest @param {string} key 'group/key' */
export function uiUrl(m, key) {
  return str(obj(obj(m)?.ui)?.[key]);
}

/**
 * Operator avatar for a chess record (golden → E2 art when present).
 * @param {any} m manifest
 * @param {any} chess chess.json record (or { assets: { avatar } })
 */
export function chessAvatarUrl(m, chess) {
  const chars = obj(obj(m)?.chars);
  const id = str(chess?.assets?.avatar) || str(chess?.charId);
  if (!chars || !id) return null;
  if (id.endsWith('_2') && !chars[id]) {
    const base = chars[id.slice(0, -2)];
    return str(base?.avatarE2) || str(base?.avatar);
  }
  return str(chars[id]?.avatar) || (chess?.charId ? str(chars[chess.charId]?.avatar) : null);
}

/**
 * Half-body portrait (180×360) for a chess record (golden → E2 portrait when present).
 * @param {any} m
 * @param {any} chess
 */
export function chessPortraitUrl(m, chess) {
  const chars = obj(obj(m)?.chars);
  const id = str(chess?.assets?.portrait);
  if (!chars) return null;
  if (id) {
    if (id.endsWith('_2')) {
      const base = chars[id.slice(0, -2)];
      if (base) return str(base.portraitE2) || str(base.portrait);
    }
    if (id.endsWith('_1')) {
      const base = chars[id.slice(0, -2)];
      if (base) return str(base.portrait);
    }
  }
  const byChar = chess?.charId ? chars[chess.charId] : null;
  if (!byChar) return null;
  return (chess?.isGolden ? str(byChar.portraitE2) : null) || str(byChar.portrait);
}

/**
 * The URL an INSTALLED skin carries for one art kind, or null. Shared by the avatar and portrait resolvers: the
 * manifest groups skins per OPERATOR (`chars[charId].skins[skinId]`), so the operator comes from the record and the
 * skin id is passed in (`skinFor(chessId)` — the choice itself is per CHESS, ui/skins.js).
 *
 * Only the skin's OWN field counts. `inject-skins-assets` writes `avatar` for every skin it lists but `portrait`
 * only for the files actually on disk (upstream ships a portrait for 131 of the 174), so an absent field yields null
 * and the caller falls back to the operator's art — resolving that fallback here would make "this skin has no
 * portrait" and "this skin is installed" indistinguishable.
 */
function skinArtUrl(m, chess, skinId, kind) {
  const charId = str(chess?.charId);
  const id = str(skinId);
  if (!charId || !id) return null;
  const installed = obj(obj(obj(obj(m)?.chars)?.[charId])?.skins)?.[id];
  return installed ? str(installed[kind]) : null;
}

/** The operator's own art of one kind: the record's own id first (`…_1`), then its charId — chessAvatarUrl's rule. */
function selfArtUrl(m, chess, kind) {
  const chars = obj(obj(m)?.chars);
  const selfId = str(kind === 'portrait' ? chess?.assets?.portrait : chess?.assets?.avatar) || str(chess?.charId);
  return str(obj(chars?.[selfId])?.[kind]) || str(obj(chars?.[str(chess?.charId)])?.[kind]) || null;
}

/**
 * 180×180 avatar of one skin of a chess record, or null — the mirror of chessSkinPortraitUrl. Every installed skin
 * has an avatar (the injector always writes one), so a skin can be shown in the square roster tiles too.
 * @param {any} m manifest
 * @param {any} chess chess.json record (needs `charId`)
 * @param {string|null|undefined} skinId the skin this chess wears, or null/absent for its own art
 */
export function chessSkinAvatarUrl(m, chess, skinId = null) {
  const url = skinArtUrl(m, chess, skinId, 'avatar');
  if (url) return url;
  // a skin whose avatar field is missing (never written) still shows the operator's face rather than a glyph
  return str(skinId) && obj(obj(obj(m)?.chars)?.[str(chess?.charId)])?.skins?.[str(skinId)] ? selfArtUrl(m, chess, 'avatar') : null;
}

/**
 * Half-body portrait of one skin of a chess record (D038), or null.
 *
 * The manifest groups skins per OPERATOR (`chars[charId].skins[skinId]`, written by
 * tools/inject-skins-assets.mjs) while the choice is per CHESS (`{ [chessId]: skinId }`, ui/skins.js) — so the
 * operator is resolved from the record and the skin id is passed in (`skinFor(chessId)`).
 *
 * `inject-skins-assets` writes a skin's `portrait` only for files really on disk, and upstream ships one for 131 of
 * the 174 skins. A skin without one falls back to the operator's own portrait — but ONLY when the manifest actually
 * has that art for this record (a manifest built without the operator's portraits must answer null so the caller
 * keeps its own fallback instead of being handed a URL the server cannot serve). No choice, an unknown skin, or an
 * operator with no art all yield null. Pure: it reads the manifest only.
 * @param {any} m manifest
 * @param {any} chess chess.json record (needs `charId` and `assets.portrait`)
 * @param {string|null|undefined} skinId the skin this chess wears, or null/absent for its own art
 */
export function chessSkinPortraitUrl(m, chess, skinId = null) {
  const id = str(skinId);
  const charId = str(chess?.charId);
  if (!id || !charId) return null;   // no choice: the caller draws the operator's own art itself
  const rec = obj(obj(obj(m)?.chars)?.[charId]);
  const skinMap = obj(rec?.skins);
  // A manifest that lists skins for this operator but not this id is a stale choice (another season's preset, an
  // uninstalled skin): answer null so the caller keeps its own fallback. A manifest with no skin map at all is the
  // ordinary "operator wears its own art" case, which resolves to that art below.
  if (skinMap && !obj(skinMap[id])) return null;
  const entry = obj(skinMap?.[id]);
  // its own portrait when upstream ships one…
  if (str(entry?.portrait)) return str(entry.portrait);
  // …else, for a skin that HAS a model but no half-body portrait, its 180×180 avatar. Upstream ships a model for 34 of
  // the dressed chess but no `charpor` file, and those cards showed the OPERATOR's art while the battlefield showed the
  // skin — an operator that looks undressed on every card (the report "明明有皮肤 这个设置还是不起作用"). A square avatar
  // cropped by `.scard__art` (object-fit: cover) is a smaller picture than a portrait, but it IS the skin.
  // Guarded on the skin's own spine: a skin with nothing installed still resolves to the operator's art below, so a
  // manifest without skin art keeps behaving exactly as it did.
  if (entry?.spine && str(entry?.avatar)) return str(entry.avatar);
  // else the operator's own art, so a card that drew the skin's art before a re-fetch never goes blank
  return selfArtUrl(m, chess, 'portrait');
}

/** Skill icon of a chess record (manifest `skills[iconId]`, else the empty skill sprite). */
export function skillIconUrl(m, chess) {
  const skills = obj(obj(m)?.skills);
  const id = str(chess?.assets?.skillIcon) || str(chess?.skill?.iconId) || str(chess?.skill?.skillId);
  if (skills && id && skills[id]) return str(skills[id]);
  const byId = obj(obj(m)?.skillsById);
  const alt = byId && chess?.skill?.skillId ? byId[chess.skill.skillId] : null;
  if (skills && alt && skills[alt]) return str(skills[alt]);
  return uiUrl(m, 'skillIcon/empty');
}

/**
 * Skill icon of one skill record (DESIGN §16 `skills[]`: iconId / skillId), else the empty skill sprite — or null with
 * `{ empty: false }` (the asset manifest only carries the default skills' icons: callers then draw a lettered S1–S3
 * tile instead of a blank square).
 */
export function skillRecordIconUrl(m, skill, { empty = true } = {}) {
  const skills = obj(obj(m)?.skills);
  for (const id of [str(skill?.iconId), str(skill?.skillId)]) if (skills && id && skills[id]) return str(skills[id]);
  const byId = obj(obj(m)?.skillsById);
  const alt = byId && skill?.skillId ? byId[skill.skillId] : null;
  if (skills && alt && skills[alt]) return str(skills[alt]);
  return empty ? uiUrl(m, 'skillIcon/empty') : null;
}

const PROF_KEY = {
  PIONEER: 'pioneer', WARRIOR: 'warrior', TANK: 'tank', SNIPER: 'sniper', CASTER: 'caster', MEDIC: 'medic',
  SUPPORT: 'support', SPECIAL: 'special',
};

/** Profession icon (small white glyph). */
export function profIconUrl(m, profession) {
  const k = PROF_KEY[String(profession || '').toUpperCase()];
  return k ? str(obj(obj(obj(m)?.prof)?.icon)?.[k]) : null;
}

/** Sub-profession icon from a chess record (`assets.subProfIcon` = 'sub_<id>_icon'). */
export function subProfIconUrl(m, chess) {
  const sub = obj(obj(obj(m)?.prof)?.sub);
  if (!sub) return null;
  const raw = str(chess?.assets?.subProfIcon);
  const id = raw ? raw.replace(/^sub_/, '').replace(/_icon$/, '') : str(chess?.subProfessionId);
  return id ? str(sub[id]) : null;
}

/** Bond glyph (white; tint in CSS). */
export function bondIconUrl(m, bondId) {
  return bondId ? str(obj(obj(m)?.bonds)?.[bondId]) : null;
}

/** Band (strategy) icon. */
export function bandIconUrl(m, bandId) {
  return bandId ? str(obj(obj(m)?.bands)?.[bandId]) : null;
}

/** Item icon for an items.json record (by trapId / iconId) or a raw trap id. */
export function itemIconUrl(m, item) {
  const items = obj(obj(m)?.items);
  if (!items) return null;
  if (typeof item === 'string') return str(items[item]);
  return str(items[item?.iconId]) || str(items[item?.trapId]);
}

/** Enemy icon (manifest keeps fallbacks resolved). */
export function enemyIconUrl(m, enemyKey) {
  const e = enemyKey ? obj(obj(obj(m)?.enemies)?.[enemyKey]) : null;
  if (e?.icon) return str(e.icon);
  // `_2` / `_3` variants fall back to their base enemy
  const base = typeof enemyKey === 'string' ? enemyKey.replace(/_\d+$/, '') : null;
  return base && base !== enemyKey ? str(obj(obj(obj(m)?.enemies)?.[base])?.icon) : null;
}

/** Token avatar, falling back to its owner operator's avatar. */
export function tokenAvatarUrl(m, tokenId) {
  const tokens = obj(obj(m)?.tokens);
  const t = tokenId ? obj(tokens?.[tokenId]) : null;
  if (t?.avatar) return str(t.avatar);
  if (t?.owner) return str(obj(obj(obj(m)?.chars)?.[t.owner])?.avatar);
  return null;
}

/** Faction (特训敌人 type) icon: `enemyTypeIcon/<icon>`. */
export function factionIconUrl(m, iconId) {
  return iconId ? uiUrl(m, `enemyTypeIcon/${iconId}`) : null;
}

/** Title (评语) icon: `titleIcon/<picId>`. */
export function titleIconUrl(m, picId) {
  return picId ? uiUrl(m, `titleIcon/${picId}`) : null;
}

/** Greek type letters of some modules (ISW-α, …) → the Latin letter of the client's icon file names (isw-a). */
const GREEK = { 'α': 'a', 'β': 'b', 'γ': 'g', 'δ': 'd', 'Δ': 'd' };
/** Lower-cased key → path index of a local `groups.module` object (built once per manifest object). */
const moduleIconIndex = new WeakMap();

/**
 * Official module (uniequip) TYPE icon from the local-client art (DESIGN §13 / §16): `data/local-assets.json`
 * `groups.module[<type>]`, matched case-insensitively against the module's typeName ('MAR-X' → key 'mar-x', 'PRI-X' →
 * key 'PRI-X' — the client's file names are mixed case). null when the manifest, the group or the entry is missing
 * (callers draw the lettered tile / type text instead).
 * @param {any} local the local-art manifest (`data.get('local')`) or null
 * @param {string} typeName e.g. 'MAR-X'
 */
export function moduleTypeIconUrl(local, typeName) {
  const g = obj(obj(obj(local)?.groups)?.module);
  const t = str(typeName)?.trim();
  if (!g || !t) return null;
  const exact = str(obj(g[t])?.path);
  if (exact) return exact;
  let idx = moduleIconIndex.get(g);
  if (!idx) {
    idx = new Map();
    for (const [k, v] of Object.entries(g)) {
      const p = str(obj(v)?.path);
      if (p && !idx.has(k.toLowerCase())) idx.set(k.toLowerCase(), p);
    }
    moduleIconIndex.set(g, idx);
  }
  const key = t.replace(/[αβγδΔ]/g, (c) => GREEK[c]).toLowerCase();
  return idx.get(key) || null;
}

/**
 * Icon for an m.private.effects entry: { iconKind: 'band'|'choice'|'team'|'item'|'garrison', iconId }.
 * @param {any} m
 * @param {{ iconKind?: string, iconId?: string }} eff
 */
export function effectIconUrl(m, eff) {
  const kind = eff?.iconKind;
  const id = str(eff?.iconId);
  if (kind === 'band') return bandIconUrl(m, id) || (id && id.startsWith('icon_') ? bandIconUrl(m, `band_${id.slice(5)}`) : null);
  if (kind === 'item') return itemIconUrl(m, id);
  if (kind === 'garrison') return uiUrl(m, `garrisonTypeIcon/${id || 's_icon_bond'}`) || uiUrl(m, 'garrisonTypeIcon/s_icon_bond');
  if (kind === 'team') return uiUrl(m, `buffIcon/${id && id.startsWith('icon_') ? id : 'icon_team_buff'}`);
  if (kind === 'choice') return uiUrl(m, `buffIcon/${id && id.startsWith('icon_') ? id : 'icon_player_buff'}`);
  return id ? uiUrl(m, `buffIcon/${id}`) : null;
}
