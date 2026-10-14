// 观战与联防的皮肤显示（用户 2026-10-14 报告，DEV-20261014-01 / I012）。
//
// 报告的现象：观战时看到的都是原皮；联防时又「都有皮肤」。设计上应该「看谁的就用谁的」——每一个单位用**它所属
// 玩家自己装备的**皮肤渲染。
//
// 这条测试走观战真正的链路，而不是某一环的单元测试：
//   MatchPlayer.skins → battleInput 写 u.skin → buildBattleSpec → （观战席）_spectatorSpec 只剥 funds
//   → b.start.spec 发给观战者 → 客户端 createBattleFromSpec → fieldMeta() → unitInfo → 渲染器 info.skin
// 这里钉住前半段（到 b.start 为止）；客户端 sim 的 unitInfo 与渲染器读取由 test/skins.test.js 的 makeBattle 用例
// 与 test/render 覆盖。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeMatch, give } from './harness.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const chessData = JSON.parse(readFileSync(join(ROOT, 'data/chess.json'), 'utf8'));
const skinsData = JSON.parse(readFileSync(join(ROOT, 'data/skins.json'), 'utf8'));

const S = 's_spec';

/** 一个能被 setSkins 接受、且 skins.json 里真的有皮肤的棋子（非精锐 / 非隐藏 / 非自选）。 */
function pickableChess() {
  for (const [id, rec] of Object.entries(chessData)) {
    if (!id.startsWith('chess_')) continue;
    if (rec.isGolden || rec.visible === false || rec.isHidden || rec.isDiy) continue;
    if (rec.baseId && rec.baseId !== id) continue;
    const skins = skinsData.chars?.[rec.charId];
    if (!Array.isArray(skins) || !skins.length) continue;
    return { chessId: id, charId: rec.charId, skinId: skins[0].id };
  }
  return null;
}

/** 这颗棋子在池子里、能站地面的棋子（部署要合法）。 */
function deployableChess(m) {
  const base = pickableChess();
  if (!base) return null;
  if (m.pool.has(base.chessId)) return base;
  for (const [id, rec] of Object.entries(chessData)) {
    if (!id.startsWith('chess_') || !m.pool.has(id)) continue;
    if (rec.isGolden || rec.visible === false || rec.isHidden || rec.isDiy) continue;
    const skins = skinsData.chars?.[rec.charId];
    if (!Array.isArray(skins) || !skins.length) continue;
    return { chessId: id, charId: rec.charId, skinId: skins[0].id };
  }
  return null;
}

/** Every `unitInfo`-shaped object in a spec's players (the units a battlefield draws). */
function specUnits(spec) {
  const out = [];
  for (const p of Array.isArray(spec?.players) ? spec.players : []) {
    for (const u of Array.isArray(p?.units) ? p.units : []) {
      if (u && typeof u === 'object') out.push({ ...u, playerId: p.playerId });
    }
  }
  return out;
}

test('观战：b.start 的 spec 带着每个玩家自己装备的皮肤（用户 2026-10-14 报告，I012）', () => {
  const h = makeMatch({ mode: 'coop', difficulty: 'FUNNY', humans: 3, seed: 9411, fake: true, clientCombat: true, spectators: [S] });
  h.start();
  const m = h.m;
  h.autoHumans();
  assert.ok(m.spectators.has(S), 'a spectator seat');

  const pick = deployableChess(m);
  assert.ok(pick, 'the pool has a chess with a skin');
  const { chessId, skinId } = pick;

  // 每个真人给自己那颗棋子装上同一款皮肤（显式设定，不依赖 D037 的默认取舍）
  const got = [];
  for (const pid of ['p_0', 'p_1', 'p_2']) {
    const ps = h.ps(pid);
    ps.setSkins({ [chessId]: skinId });
    if (ps.skins[chessId] === skinId) got.push(pid);
  }
  assert.ok(got.length > 0, `setSkins accepted for ${got.join(', ')}`);

  h.toPrep(1);
  // 把棋子摆上场（autoplay 只管选秀，不管布阵），这样战斗才有带皮肤的单位
  const deployed = [];
  for (const pid of got) {
    const ps = h.ps(pid);
    const piece = give(m, ps, chessId);
    const tiles = [[9, 4], [9, 5], [9, 3], [8, 4], [13, 4], [13, 5], [8, 5], [13, 3]];
    for (const [row, col] of tiles) {
      if (m.handle(pid, { t: 'g.move', uid: piece.uid, to: { area: 'board', row, col } }).ok) { deployed.push(pid); break; }
    }
  }
  assert.ok(deployed.length > 0, `a piece reached the board for ${deployed.join(', ')}`);

  h.drive(() => m.fields.length > 0, { ready: true, timeoutMs: 30000 });
  assert.ok(m.fields.length > 0, 'a field is up');

  const starts = h.allTo(S, 'b.start');
  assert.ok(starts.length > 0, 'the spectator was shown a field');
  const units = starts.flatMap((st) => specUnits(st.spec));
  const diag = starts.map((st) => `${st.fieldId}:${(st.spec.players || []).length}p/${specUnits(st.spec).length}u`);
  assert.ok(units.length > 0, `the spec carries units (${diag.join(' ')})`);

  // 1) 观战者拿到的 spec 里，凡是该棋子上场了，皮肤必须原样在（不是被剥成原皮）
  const mine = units.filter((u) => u.playerId !== S && (u.chessId === chessId || u.defId === chessId));
  const skinned = mine.filter((u) => u.skin);
  assert.ok(
    skinned.length > 0 || got.length === 0,
    `观战 spec 里的 ${chessId} 应带皮肤（${mine.length} 个该棋子单位，带皮肤 ${skinned.length} 个；setSkins 成功 ${got.length} 人）`,
  );
  for (const u of skinned) assert.equal(u.skin, skinId, `${u.playerId} 的 ${chessId} 用自己的皮肤`);

  // 2) 皮肤是「各人自己的」：带皮肤的单位都属于设过皮肤的玩家
  for (const u of skinned) assert.ok(got.includes(u.playerId), `${u.playerId} 是设过皮肤的玩家`);

  // 3) 发给观战席的 spec 与场上 spec 的单位/皮肤逐一相同（_spectatorSpec 只该剥 contentInfo.funds）
  for (const st of starts) {
    const f = m.fields.find((x) => x.fieldId === st.fieldId);
    if (!f || f.spec === st.spec) continue;
    const sig = (spec) => JSON.stringify(specUnits(spec).map((u) => [u.playerId, u.chessId ?? u.defId, u.skin ?? null]));
    assert.equal(sig(st.spec), sig(f.spec), `${st.fieldId}: 观战 spec 的单位与皮肤和场上 spec 一致`);
    // 而 funds 确实被剥掉了（证明这份 spec 真的走了 _spectatorSpec）
    const funds = (spec) => (spec.players || []).some((p) => p?.contentInfo && Object.hasOwn(p.contentInfo, 'funds'));
    if (funds(f.spec)) assert.ok(!funds(st.spec), `${st.fieldId}: funds stripped for the spectator`);
  }
});

/**
 * 报告里的第二条：「联防时又都有皮肤了」，而设计上应当是**各人自己的**那一款。两个玩家穿不同的皮肤，同一场战斗的
 * spec 里两边的单位必须各带各的 —— 不能都变成同一个，也不能都掉成原皮。
 */
test('观战/联防：两个玩家穿不同皮肤时，spec 里各是各的（用户 2026-10-14 报告，I012）', () => {
  const h = makeMatch({ mode: 'coop', difficulty: 'FUNNY', humans: 2, seed: 7717, fake: true, clientCombat: true, spectators: [S] });
  h.start();
  const m = h.m;
  h.autoHumans();

  // 两颗都有皮肤的棋子，各人一款（不同款式，才能看出「是不是同一套」）
  const picks = [];
  for (const [id, rec] of Object.entries(chessData)) {
    if (!id.startsWith('chess_') || !m.pool.has(id)) continue;
    if (rec.isGolden || rec.visible === false || rec.isHidden || rec.isDiy) continue;
    const skins = skinsData.chars?.[rec.charId];
    if (!Array.isArray(skins) || !skins.length) continue;
    picks.push({ chessId: id, skinId: skins[0].id });
    if (picks.length === 2) break;
  }
  assert.equal(picks.length, 2, 'two pool chess with skins');

  h.toPrep(1);
  const set = [];
  for (const [i, pid] of ['p_0', 'p_1'].entries()) {
    const ps = h.ps(pid);
    ps.setSkins({ [picks[i].chessId]: picks[i].skinId });
    const piece = give(m, ps, picks[i].chessId);
    for (const [row, col] of [[9, 4], [9, 5], [9, 3], [8, 4], [13, 4], [13, 5], [8, 5], [13, 3]]) {
      if (m.handle(pid, { t: 'g.move', uid: piece.uid, to: { area: 'board', row, col } }).ok) { set.push({ pid, ...picks[i] }); break; }
    }
  }
  assert.equal(set.length, 2, 'both players put their skinned piece on the board');

  h.drive(() => m.fields.length > 0, { ready: true, timeoutMs: 30000 });
  const units = h.allTo(S, 'b.start').flatMap((st) => specUnits(st.spec));

  // 每个玩家自己的棋子在 spec 里就是自己的皮肤
  for (const w of set) {
    const mine = units.filter((u) => u.playerId === w.pid && (u.chessId === w.chessId || u.defId === w.chessId));
    for (const u of mine) assert.equal(u.skin, w.skinId, `${w.pid} 的 ${w.chessId} 是本人的皮肤 ${w.skinId}`);
  }
  // 两款皮肤不同，且都真的出现在观战 spec 里 —— 不是都掉成原皮，也不是被统一成一套
  if (units.length >= 2) {
    const skinsSeen = new Set(units.map((u) => u.skin).filter(Boolean));
    assert.ok(skinsSeen.size >= 1, `观战 spec 里至少出现一款皮肤（${[...skinsSeen].join(',')}）`);
    assert.notEqual(set[0].skinId, set[1].skinId, 'the two choices differ, so a shared skin would be visible');
  }
});
