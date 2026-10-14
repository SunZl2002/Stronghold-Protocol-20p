// 皮肤系统专项自动化测试 (docs/SKINS.md & SKINS-BUILTIN-PLAN.md)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isSkinId, isSkinSelection } from '../shared/protocol.js';
import { mergeSkins, sanitizeSkins, exportPayload, parseImport } from '../public/js/ui/loadoutModel.js';
import { avatarUrl, spineEntry, hasBackSpine } from '../public/js/assets.js';
import { defaultSkins } from '../public/js/ui/skins.js';
import { chessSkinPortraitUrl } from '../public/js/ui/assetUrls.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const skinsData = JSON.parse(readFileSync(join(ROOT, 'data/skins.json'), 'utf8'));
const assetsData = JSON.parse(readFileSync(join(ROOT, 'data/assets.json'), 'utf8'));
const chessData = JSON.parse(readFileSync(join(ROOT, 'data/chess.json'), 'utf8'));

test('全量 174 套皮肤内置元数据覆盖与映射正确', () => {
  const chars = skinsData.chars || {};
  const charKeys = Object.keys(chars);
  assert.equal(charKeys.length, 115, '拥有皮肤的干员数为 115 名');

  let totalSkins = 0;
  for (const [charId, list] of Object.entries(chars)) {
    assert.ok(Array.isArray(list) && list.length > 0, `${charId} 拥有皮肤列表`);
    for (const s of list) {
      totalSkins++;
      assert.ok(isSkinId(s.id), `皮肤 id ${s.id} 满足命名协议规范`);
      assert.ok(typeof s.name === 'string' && s.name.length > 0, `皮肤 ${s.id} 具有名称`);
    }
  }
  assert.equal(totalSkins, 174, '总皮肤数应精准为 174 款');

  // 验证普查出的 6 名无皮肤干员
  const noSkinChars = [
    'char_512_aprot', // 盟约·辅助干员
    'char_1037_sora2', // 雪猎
    'char_4139_cathy', // 凯瑟琳
    'char_1039_titi',  // 缇缇
    'char_1041_silar2', // 凛御银灰
    'char_1042_astgn2', // 溯光星源
  ];
  for (const id of noSkinChars) {
    assert.equal(chars[id], undefined, `未实装皮肤干员 ${id} 不应存在于 skins.json`);
  }
});

test('导入语义增量覆盖 (mergeSkins) 行为正确', () => {
  const current = {
    chess_silverash: 'skin_silverash_1',
    chess_thorns: 'skin_thorns_1',
    chess_eyja: 'skin_eyja_1',
  };

  // 导入仅包含棘刺新皮与塞雷娅皮肤，银灰未提及
  const imported = {
    chess_thorns: 'skin_thorns_summer',
    chess_saria: 'skin_saria_prison',
  };

  const result = mergeSkins(current, imported);

  // 1. 银灰未提及，保留原选择
  assert.equal(result.chess_silverash, 'skin_silverash_1');
  // 2. 棘刺已提及，增量打补丁
  assert.equal(result.chess_thorns, 'skin_thorns_summer');
  // 3. 塞雷娅新增
  assert.equal(result.chess_saria, 'skin_saria_prison');
  // 4. 艾雅法拉未提及，保留原选择
  assert.equal(result.chess_eyja, 'skin_eyja_1');
});

test('导出与导入链路支持 skins 字段且安全隔离', () => {
  const loadout = { chess_char_1_01_a: { skill: 1 } };
  const skins = { chess_char_1_01_a: 'char_002_amiye@epoque#4' };

  const payload = exportPayload(loadout, { skins });
  assert.ok(payload.skins);
  assert.equal(payload.skins.chess_char_1_01_a, 'char_002_amiye@epoque#4');

  const parsed = parseImport(JSON.stringify(payload));
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.entries, loadout);
  assert.deepEqual(parsed.skins, skins);
});

test('Spine 与 Avatar 资源回退：皮肤缺损优雅 fallback 至原皮', () => {
  const manifest = {
    chars: {
      char_demo: {
        avatar: 'art/demo.png',
        spine: { front: { skel: '/art/demo.skel', atlas: '/art/demo.atlas', anims: {} } },
        skins: {
          skin_has_art: {
            avatar: 'art/skin_demo.png',
            spine: { front: { skel: '/art/skin.skel', atlas: '/art/skin.atlas', anims: {} } },
          },
          skin_no_spine: {
            avatar: 'art/skin_no_spine.png',
          },
          skin_broken_spine: {
            avatar: 'art/skin_broken.png',
            spine: { front: { skel: 'https://remote.url/broken.skel' } },
          },
        },
      },
    },
  };

  // 1. 有独立皮肤模型与头像
  assert.equal(avatarUrl(manifest, 'char_demo', { skin: 'skin_has_art' }), 'art/skin_demo.png');
  assert.equal(spineEntry(manifest, 'char_demo', { skin: 'skin_has_art' })?.skel, '/art/skin.skel');

  // 2. 皮肤无独立 spine，回退至原皮 spine
  assert.equal(avatarUrl(manifest, 'char_demo', { skin: 'skin_no_spine' }), 'art/skin_no_spine.png');
  assert.equal(spineEntry(manifest, 'char_demo', { skin: 'skin_no_spine' })?.skel, '/art/demo.skel');

  // 3. 皮肤 spine 格式非法或损坏，优雅 fallback 回退至原皮 spine
  assert.equal(avatarUrl(manifest, 'char_demo', { skin: 'skin_broken_spine' }), 'art/skin_broken.png');
  assert.equal(spineEntry(manifest, 'char_demo', { skin: 'skin_broken_spine' })?.skel, '/art/demo.skel');

  // 4. 皮肤 id 完全不存在，回退至原皮头像与 spine
  assert.equal(avatarUrl(manifest, 'char_demo', { skin: 'skin_not_exist' }), 'art/demo.png');
  assert.equal(spineEntry(manifest, 'char_demo', { skin: 'skin_not_exist' })?.skel, '/art/demo.skel');
});

test('协议层 isSkinId 与 isSkinSelection 防御校验', () => {
  assert.equal(isSkinId('char_002_amiye@epoque#4'), true);
  assert.equal(isSkinId('char_102_texas@summer#1'), true);
  assert.equal(isSkinId('invalid space id'), false);
  assert.equal(isSkinId(''), false);
  assert.equal(isSkinId(null), false);

  assert.equal(isSkinSelection({ chess_amiye: 'char_002_amiye@epoque#4' }), true);
  assert.equal(isSkinSelection({ 'invalid space chess': 'char_002_amiye@epoque#4' }), false);
  assert.equal(isSkinSelection({ chess_amiye: 'invalid space skin' }), false);
  assert.equal(isSkinSelection([]), false);
  assert.equal(isSkinSelection('not obj'), false);
});

/**
 * The 20-player broadcast contract for skins (docs/SKINS.md): the choice is PUBLIC, so it rides in
 * m.public.players[].skins — which means it must survive the compact v1 codec, and must cost a player who wears no
 * skin exactly nothing. Both are load-bearing at 20 seats / 8 Hz, so they are pinned here rather than left implicit.
 */
test('20 席 m.public 的皮肤载荷：紧凑编解码往返一致，且无皮肤玩家零成本', async () => {
  const { encodeWire, decodeWire } = await import('../shared/wireCodec.js');
  const skinOf = (i) => `char_${100 + i}_op@summer#${i % 9}`;
  const seat = (i, withSkin) => ({
    playerId: `p_${i}`, seat: i, name: `博士${i}`, isBot: false, connected: true, alive: true, lp: 30 - i,
    bandId: null, shopLevel: 3, boardCount: 6, ready: true, bonds: [], fieldId: i, status: null, autoplay: false,
    ...(withSkin ? { skins: { [`chess_char_1_0${(i % 9) + 1}_a`]: skinOf(i) } } : {}),
  });
  const frame = (withSkin) => ({ t: 'm.public', phase: 'PREP', round: 5, players: Array.from({ length: 20 }, (_, i) => seat(i, withSkin)) });
  const size = (o) => Buffer.byteLength(JSON.stringify(encodeWire(o, 's2c')));

  // the choice and its chess key survive the round trip for all 20 seats
  const back = decodeWire(encodeWire(frame(true), 's2c'), 's2c');
  assert.equal(back.players.length, 20);
  for (const [i, p] of back.players.entries()) {
    const keys = Object.keys(p.skins || {});
    assert.equal(keys.length, 1, `seat ${i} keeps exactly its own entry`);
    assert.match(keys[0], /^chess_char_/, 'the key stays a CHESS id (the catalogue is keyed by operator id)');
    assert.equal(p.skins[keys[0]], skinOf(i));
  }

  // a room where nobody wears a skin is byte-identical to one built without the field at all
  const plain = decodeWire(encodeWire(frame(false), 's2c'), 's2c');
  assert.ok(plain.players.every((p) => !Object.prototype.hasOwnProperty.call(p, 'skins')),
    'no seat carries an empty skins object');
  assert.equal(size(frame(false)), size({ t: 'm.public', phase: 'PREP', round: 5, players: frame(false).players.map(({ skins, ...rest }) => rest) }));

  // what 20 skinned seats cost on the wire (kept as a number so a regression that bloats the payload is visible)
  const extra = size(frame(true)) - size(frame(false));
  assert.ok(extra > 0 && extra < 3000, `20 seats add ${extra} B per broadcast (expected under 3 KB)`);
});

/**
 * A board piece's skin has to survive the trip into the battle simulation, because that is the model the battlefield
 * draws. The chain is: MatchPlayer.battleInput sets `skin` on the plain input -> battle/players.js
 * _createAllyFromInput -> _makeAlly({ skin }) -> sim/units.js Unit({ skin }) -> snapshot.js unitInfo publishes it.
 *
 * This test exists because the port originally missed the two middle links: `skin` was set on the input object but
 * _makeAlly never forwarded it and Unit had no such field, so the field was silently dropped on every deployment
 * (the prep view still looked right, which is exactly what made it hard to notice).
 */
test('战场单位：干员的皮肤必须穿过模拟层到达 unitInfo（曾经在此静默丢失）', async () => {
  const { makeBattle, chessRec } = await import('../test/helpers/battleHarness.js');
  const { unitInfo } = await import('../server/sim/snapshot.js');
  const guard = (o = {}) => chessRec({ id: o.id, profession: 'WARRIOR', stats: { atk: 300, blockCnt: 2 }, ...o });
  const SKIN = 'char_199_yak@summer#1';

  const h = makeBattle({
    defs: { chess: { a: guard({ id: 'a' }), b: guard({ id: 'b' }) } },
    units: [{ chessId: 'a', row: 9, col: 5, skin: SKIN }, { chessId: 'b', row: 12, col: 7 }],
    content: 'none',
  });
  h.step();

  const a = h.battle.units.find((u) => u.defId === 'a');
  const b = h.battle.units.find((u) => u.defId === 'b');

  // the two links the port missed first time round
  assert.equal(a?.skin, SKIN, 'sim/units.js Unit keeps the skin');
  assert.equal(b?.skin, null, 'a unit without a skin holds null, not undefined');

  // what the renderer reads
  const va = unitInfo(a), vb = unitInfo(b);
  assert.equal(va.skin, SKIN, 'unitInfo publishes it');
  assert.equal(vb.skin, undefined, 'undefined (not null) so JSON.stringify drops it');
  assert.ok(JSON.stringify(va).includes(`"skin":"${SKIN}"`), 'it reaches the wire');
  assert.ok(!JSON.stringify(vb).includes('"skin"'), 'a skinless unit costs the broadcast nothing');
});

/**
 * D037 默认皮肤 (the owner's request of 2026-10-14): every operator whose skin has an installed model wears it, so a
 * fresh browser is dressed instead of plain. The rules that matter, all checkable against the committed data without a
 * browser:
 *
 *   * keyed by CHESS id (a choice is per chess; the catalogue is per operator) and never on a golden / hidden / 自选
 *     record — the same gate the loadout uses;
 *   * only a skin whose Spine model is actually in the manifest, so a dressed operator is never one that would fall
 *     back to its own model (the three source-missing skins);
 *   * an operator with no installed skin is absent, not mapped to nothing.
 */
test('D037 默认皮肤：每个有模型的干员都装上一款，且只装在能穿皮肤的棋子上', () => {
  // a store over the committed data, exercising the real shapes (chess / skins catalogue / manifest)
  const store = {
    get: (n) => (n === 'skins' ? skinsData : n === 'assets' ? assetsData : null),
    list: (n) => (n === 'chess' ? Object.values(chessData) : []),
  };
  const map = defaultSkins(store);
  const entries = Object.entries(map);
  assert.ok(entries.length > 0, 'the defaults are not empty against the committed data');

  // every chess in the map may wear a skin at all
  for (const [chessId, skinId] of entries) {
    const c = chessData[chessId];
    assert.ok(c, `${chessId} is a real chess`);
    assert.ok(!c.isGolden, `${chessId} is not the golden form`);
    assert.ok(!c.isHidden, `${chessId} is not hidden`);
    assert.ok(!c.isDiy, `${chessId} is not a 自选 slot`);
    // and the skin is one of that operator's, with SOME art installed (a model, or at least a portrait — see below)
    const picked = assetsData.chars[c.charId]?.skins?.[skinId];
    assert.ok(picked, `${skinId} is installed for ${c.charId}`);
    assert.ok(picked.spine || picked.portrait || picked.avatar, `${skinId} has art on this server`);
  }

  // every operator that HAS an installed skin is dressed (no gaps). "Installed" means any art at all, not only a Spine
  // model: 浊心斯卡蒂's two skins ship portraits but no model upstream, and skipping her left a visible operator on its
  // own art while the picker offered skins that would have shown.
  const dressedChars = new Set(entries.map(([chessId]) => chessData[chessId].charId));
  const hasArt = (rec) => Object.values(rec.skins || {}).some((s) => s.spine || s.portrait || s.avatar);
  const withInstalled = Object.entries(assetsData.chars).filter(([, rec]) => hasArt(rec)).map(([charId]) => charId);
  assert.ok(withInstalled.length >= 115, `the committed manifest covers ${withInstalled.length} operators`);
  for (const charId of withInstalled) {
    // an operator may have no eligible chess (all golden / hidden); only require it when one exists
    const eligible = Object.values(chessData).some((c) => c.charId === charId && !c.isGolden && !c.isHidden && !c.isDiy);
    if (eligible) assert.ok(dressedChars.has(charId), `${charId} is dressed`);
  }

  // an operator with no installed art is absent
  const none = Object.entries(assetsData.chars).find(([, rec]) => !hasArt(rec));
  if (none) {
    const [charId] = none;
    assert.ok(!dressedChars.has(charId), `${charId} has no installed skin and stays plain`);
  }

  // The default picks a model when one exists, and otherwise the best art there is — never a skin with no art at all,
  // because that would change nothing visible. Checked against whatever the committed manifest says rather than a
  // frozen list: the source gains files over time (char_4087_ines@boc#8 arrived after a later retry).
  for (const [chessId, skinId] of entries) {
    const charId = chessData[chessId].charId;
    const s = assetsData.chars[charId].skins[skinId];
    assert.ok(s && (s.spine || s.portrait || s.avatar), `${skinId} is a default only because it has some art`);
    if (!s.spine) assert.ok(s.portrait || s.avatar, `${skinId} has no model, so it must at least show art`);
  }
  // a skin with NO model may still be a default when it has a portrait or avatar (浊心斯卡蒂), but a skin with no art
  // at all must never be: choosing it would change nothing visible
  const noArt = [];
  for (const [charId, rec] of Object.entries(assetsData.chars)) {
    for (const [skinId, s] of Object.entries(rec.skins || {})) if (!s.spine && !s.portrait && !s.avatar) noArt.push(skinId);
  }
  for (const skinId of noArt) {
    assert.ok(!Object.values(map).includes(skinId), `${skinId} has no art at all and must not be a default`);
  }
});

test('D038 商店立绘：选中皮肤时取皮肤立绘，未选中或缺立绘时回退原皮', () => {
  // The manifest groups skins per operator, the choice is per chess — the resolver takes the record and the skin id
  // (see assetUrls.chessSkinPortraitUrl). Everything here is a pure function over the committed data.
  const withChar = (patch = {}) => ({ chessId: 'chess_x', charId: 'char_498_inside', assets: { portrait: 'char_498_inside_1' }, ...patch });

  // no choice, or an unknown skin, or a record with no operator: no skin-URL at all (the caller falls back)
  assert.equal(chessSkinPortraitUrl(assetsData, withChar(), null), null, 'no choice');
  assert.equal(chessSkinPortraitUrl(assetsData, withChar(), ''), null, 'empty id');
  assert.equal(chessSkinPortraitUrl(assetsData, withChar(), 'char_498_inside@nope#99'), null, 'unknown skin');
  assert.equal(chessSkinPortraitUrl(assetsData, { chessId: 'c', assets: {} }, 'char_498_inside@kitchen#2'), null, 'no operator');
  assert.equal(chessSkinPortraitUrl(null, withChar(), 'char_498_inside@kitchen#2'), null, 'no manifest');

  // with a real choice: the URL comes from the manifest's skin entry, and only ever from there
  const skinId = 'char_498_inside@kitchen#2';
  assert.ok(assetsData.chars.char_498_inside.skins[skinId], 'the fixture skin is installed');
  const m = { chars: {
    char_498_inside: {
      portrait: '/assets/char/portrait/char_498_inside.png',
      skins: { [skinId]: { name: '甜品大奖', portrait: '/assets/char/skin_portrait/char_498_inside@kitchen#2.png' } },
    },
  } };
  assert.equal(chessSkinPortraitUrl(m, withChar(), skinId), '/assets/char/skin_portrait/char_498_inside@kitchen#2.png');

  // a skin with no portrait entry of its own (upstream ships 131 of 174) falls back to the operator's own portrait,
  // so a card never goes blank; and with no operator art either it yields null rather than a URL the server lacks
  const mNoPortrait = { chars: {
    char_498_inside: {
      portrait: '/assets/char/portrait/char_498_inside.png',
      skins: { [skinId]: { name: '甜品大奖' } },
    },
  } };
  assert.equal(chessSkinPortraitUrl(mNoPortrait, withChar(), skinId), '/assets/char/portrait/char_498_inside.png', 'skin without a portrait falls back');
  const mBare = { chars: { char_498_inside: { skins: { [skinId]: { name: '甜品大奖' } } } } };
  assert.equal(chessSkinPortraitUrl(mBare, withChar(), skinId), null, 'no operator art either: null, not a missing URL');

  // the fallback for the operator's own art tries the record's portrait id first (`…_1`) and then the charId, the
  // same two keys chessAvatarUrl uses
  const mSelf = { chars: {
    char_498_inside: { portrait: '/assets/char/portrait/char_498_inside.png' },
    char_498_inside_1: { portrait: '/assets/char/portrait/char_498_inside_1.png' },
  } };
  assert.equal(chessSkinPortraitUrl(mSelf, withChar(), skinId), '/assets/char/portrait/char_498_inside_1.png', 'portrait id wins');
  assert.equal(chessSkinPortraitUrl(mSelf, withChar({ assets: {} }), skinId), '/assets/char/portrait/char_498_inside.png', 'charId fallback');

  // The committed manifest is the real shape, and it now carries portraits for the skins whose art was fetched (I006
  // step ①: `tools/fetch-skin-portraits.mjs` + the injector). The rule, checked against whatever is committed rather
  // than a frozen count: a skin with its own portrait resolves to it; a skin without one falls back to the operator's
  // own art (so a card never goes blank), which is null only when the manifest lacks that art too.
  let checked = 0;
  let withPortrait = 0;
  let viaOperator = 0;
  for (const [charId, rec] of Object.entries(assetsData.chars)) {
    for (const [id, entry] of Object.entries(rec.skins || {})) {
      const chess = Object.values(chessData).find((c) => c.charId === charId);
      if (!chess) continue;
      checked++;
      const url = chessSkinPortraitUrl(assetsData, chess, id);
      if (entry.portrait) {
        withPortrait++;
        assert.equal(url, entry.portrait, `${id} resolves to its own portrait`);
      } else if (url) {
        viaOperator++;
        assert.ok(url.includes('/char/portrait/'), `${id} falls back to operator art, got ${url}`);
      }
    }
  }
  assert.ok(checked > 100, `checked ${checked} installed skins against the committed manifest`);
  assert.ok(withPortrait > 0, `the manifest carries portraits (${withPortrait}) — fetch-skin-portraits + inject ran`);
  assert.ok(viaOperator > 0, `and ${viaOperator} skins fall back to their operator's art`);
});

