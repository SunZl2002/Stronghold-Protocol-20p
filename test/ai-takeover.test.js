// test/ai-takeover.test.js — 观战者接管 AI（20p：默认开启、免投票、休整期直接接管）。
//
// The handover used to need a strict majority of the online, non-autoplay human teammates behind a 30-second request.
// It is direct now: the room option is on for a coop room (the host may switch it off in 同盟设置 before the start), a
// connected spectator takes an alive AI seat during PREP, and everything the seat owned moves with it — inventory, gold,
// board, results and the `aiTakeoverRound` flag that keeps that record out of the newcomer's personal statistics. The
// applicant's identity (reconnect token) moves onto the seat, and the connection's state-delta negotiation restarts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../server/index.js';
import { TestClient } from './helpers/wsClient.js';

async function fixture(t, testRoom = false) {
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, botRehearsal: 0 }), clients = [];
  t.after(async () => { for (const c of clients) await c.terminate().catch(() => {}); await srv.close(); });
  if (testRoom) { srv.lobby.testMode = 'local'; srv.lobby.setTestHost('127.0.0.1'); }
  const player = async (name, token) => {
    const c = await TestClient.connect(srv.url.replace('http', 'ws') + '/ws');
    clients.push(c);
    const w = await c.hello(name, token, { delta: 1 });
    c.id = w.playerId; c.token = w.token;
    return c;
  };
  const host = await player('Host');
  assert.equal((await host.request({ t: 'room.create', mode: 'coop', difficulty: 'NORMAL', ...(testRoom ? { test: true } : {}) })).t, 'ok');
  const room = [...srv.lobby.rooms.values()][0];
  // 20p: nothing to opt in — a coop room ships with the option on (asserted in the default test below)
  assert.equal(room.aiTakeoverEnabled, true);
  const mate = await player('Mate');
  await mate.request({ t: 'room.join', code: room.code, testAck: true });
  await mate.request({ t: 'room.ready', ready: true });
  for (let i = 0; i < 2; i++) await host.request({ t: 'room.addBot' });
  assert.equal((await host.request({ t: 'room.start' })).t, 'ok');
  const m = room.match;
  m.startRound(1); m.phase = 'PREP'; m.setDeadline(0);
  for (const p of m.order) p._botPrepToken = (p._botPrepToken || 0) + 1;
  const late = await player('Late');
  if (testRoom) assert.equal((await late.request({ t: 'room.spectate', code: room.code })).t, 'error', 'test-room admission requires acknowledgement');
  assert.equal((await late.request({ t: 'room.spectate', code: room.code, testAck: true })).t, 'ok');
  return { srv, room, m, host, mate, late, player };
}

test('a spectator takes an AI seat directly — no vote — keeping inventory, identity and reconnect token', async (t) => {
  const { srv, room, m, host, mate, late, player } = await fixture(t);
  const bot = m.order[2], id = bot.playerId, old = late.id, token = late.token;
  bot.funds = 71;
  const piece = bot.acquireChess('chess_char_1_01_a', { fromPool: false });
  // a seated player cannot replace another seat (only a spectator takes an AI)
  assert.equal((await host.request({ t: 'room.aiRequest', botId: id })).t, 'error', 'a player cannot take an AI seat');
  late.clearInbox();
  const result = await late.request({ t: 'room.aiRequest', botId: id });
  assert.equal(result.t, 'ok', JSON.stringify(result));
  // immediate: no request to approve
  assert.equal(room.aiTakeoverVotes.length, 0, 'no election is created');
  await late.waitFor('welcome', (w) => w.playerId === id);
  assert.equal(bot.isBot, false);
  assert.equal(bot.name, 'Late');
  assert.equal(bot.funds, 71, 'the AI gold stays with the seat');
  assert.ok(bot.hand.some((x) => x?.uid === piece.uid), 'the AI hand stays with the seat');
  assert.equal(room.spectatorOf(old), null, 'the spectator seat is gone');
  assert.equal(srv.registry.byId(old), null);
  assert.equal(srv.registry.byToken(token).playerId, id, 'the reconnect token follows the applicant');
  assert.equal((await late.request({ t: 'g.refresh' })).t, 'ok', 'the new seat plays');
  // and the token still resumes that seat after a disconnect
  await late.terminate();
  const resumed = await player('Late', token);
  assert.equal(resumed.id, id);
  assert.equal(mate.id, mate.id);
});

test('a takeover only works in PREP, on an alive AI seat, by a spectator, in an original-content coop match', async (t) => {
  const { room, m, host, mate, late } = await fixture(t);
  const bot = m.order[2];
  const seatOfHuman = m.order[1].playerId;
  assert.equal((await host.request({ t: 'room.aiRequest', botId: bot.playerId })).t, 'error', 'host is not a spectator');
  assert.equal((await late.request({ t: 'room.aiRequest', botId: seatOfHuman })).t, 'error', 'a human seat cannot be taken');
  m.phase = 'COMBAT';
  assert.equal((await late.request({ t: 'room.aiRequest', botId: bot.playerId })).t, 'error', 'PREP only');
  m.phase = 'PREP';
  bot.alive = false;
  assert.equal((await late.request({ t: 'room.aiRequest', botId: bot.playerId })).t, 'error', 'an eliminated AI is gone');
  bot.alive = true;
  assert.equal((await late.request({ t: 'room.aiRequest', botId: bot.playerId })).t, 'ok');
  // the seat is a human now: a second applicant cannot take it, and its session owns it
  assert.equal((await mate.request({ t: 'room.aiRequest', botId: bot.playerId })).t, 'error');
  assert.equal(room.aiTakeoverEnabled, true);
});

test('0.3.1 test-room acknowledgement and host-only controls survive the handover', async (t) => {
  const { room, m, host, late } = await fixture(t, true);
  const bot = m.order[2];
  assert.equal(room.test, true);
  assert.equal(m.test, true);
  late.clearInbox();
  assert.equal((await late.request({ t: 'room.aiRequest', botId: bot.playerId })).t, 'ok');
  await late.waitFor('welcome', (w) => w.playerId === bot.playerId);
  assert.equal(room.test, true);
  assert.equal(m.test, true);
  assert.equal(room.hostId, host.id, 'the host did not change');
  assert.equal((await late.request({ t: 'g.test', cmd: 'funds', args: { amount: 99 } })).t, 'error', 'a newcomer has no host powers');
  assert.equal((await late.request({ t: 'g.refresh' })).t, 'ok');
});

test('the seat keeps its record, but the inherited round never counts as personal statistics', async (t) => {
  const { srv, room, m, late, host, player } = await fixture(t);
  const bot = m.order[2], oldId = late.id, token = late.token;
  bot.stats.kills = 123; bot.stats.dmgDealt = 456;
  const stock = m.pool;
  late.clearInbox();
  assert.equal((await late.request({ t: 'room.aiRequest', botId: bot.playerId })).t, 'ok');
  await late.waitFor('welcome', (w) => w.playerId === bot.playerId);
  assert.equal(m.pool, stock);
  assert.equal(m.spectators.has(oldId), false);
  assert.equal(bot.aiTakeoverRound, 1);
  assert.equal(srv.network.conns.get(srv.registry.byToken(token).ws).session.playerId, bot.playerId);
  assert.equal(bot.privateView().aiTakeoverRound, 1);
  assert.equal(bot.stats.kills, 123, 'the seat keeps what the AI earned');
  const { buildResult } = await import('../server/match/results.js');
  const result = buildResult(m, { victory: true, hiddenReached: true, hiddenCleared: true, reason: 'hidden_cleared' });
  const row = result.players.find((p) => p.playerId === bot.playerId);
  assert.equal(row.name, 'Late');
  assert.equal(row.stats.kills, 123);
  assert.equal(row.aiTakeoverRound, 1);
  assert.equal(row.title, null);
  assert.equal(row.trophies, 0);
  assert.equal(row.reward, 0);
  const { buildRecord, buildQuitRecord, compactRecord, countsTowardStats, recordToResult, normalizeRecord } = await import('../public/js/ui/stats.js');
  const rec = normalizeRecord(buildRecord(result, { myId: bot.playerId, roomMode: 'coop', now: 1 }));
  assert.equal(countsTowardStats(rec), false);
  assert.equal(countsTowardStats(normalizeRecord(compactRecord(rec))), false);
  const quit = buildQuitRecord({ me: { playerId: bot.playerId }, room: { mode: 'coop' }, match: { public: m.publicView() } },
    { live: { active: true, startedAt: 0, sawStart: true, aliveRound: 1 }, now: 10 });
  assert.equal(quit.players[0].aiTakeoverRound, 1);
  assert.equal(countsTowardStats(quit), false);
  assert.equal(recordToResult(rec).players.find((p) => p.playerId === bot.playerId).aiTakeoverRound, 1);
  assert.equal(countsTowardStats(buildRecord(result, { myId: host.id, roomMode: 'coop', now: 1 })), true);
  await late.terminate();
  const resumed = await player('Late', token);
  assert.equal(resumed.id, bot.playerId);
});

test('the handover restarts the delta baseline and cancels only the inherited seat rehearsal', async (t) => {
  const { srv, room, m, late } = await fixture(t);
  const bot = m.order[2], other = m.order[3];
  const { stateDeltaVersion } = await import('../server/stateTransport.js');
  const ws = srv.registry.byToken(late.token).ws;
  assert.equal(stateDeltaVersion(ws), 1);
  let cancelled = 0, otherCancelled = 0;
  m._rehearsalTasks.set('owned', { id: 'owned', playerId: bot.playerId, kind: 'pool', job: {}, cancel: () => cancelled++ });
  m._rehearsalTasks.set('other', { id: 'other', playerId: other.playerId, kind: 'pool', job: {}, cancel: () => otherCancelled++ });
  late.clearInbox();
  const previousSeq = Math.max(0, ...late.log.filter((f) => f.t === 'm.state').map((f) => f.seq));
  assert.equal((await late.request({ t: 'room.aiRequest', botId: bot.playerId })).t, 'ok');
  await late.waitFor('welcome', (w) => w.playerId === bot.playerId);
  const full = await late.waitFor('m.state', (f) => f.full?.players?.some((p) => p.playerId === bot.playerId && !p.isBot));
  assert.ok(full.seq > previousSeq);
  assert.equal(stateDeltaVersion(ws), 1);
  assert.equal(cancelled, 1);
  assert.equal(otherCancelled, 0);
  assert.equal(m._rehearsalTasks.has('owned'), false);
  assert.equal(m._rehearsalTasks.has('other'), true);
  assert.equal(room.aiTakeoverVotes.length, 0);
});

test('the option is ON for a coop room, the host may switch it off before the start, and only the host may change it', async (t) => {
  const { room, m, host, mate, late } = await fixture(t);
  const bot = m.order[2];
  assert.equal(room.aiTakeoverEnabled, true);
  assert.equal(room.toState().aiTakeoverEnabled, true);
  assert.deepEqual(room.toState().aiTakeoverVotes, []);
  // a running match locks the option (the host decides before the start, not during the game)
  assert.equal((await host.request({ t: 'room.setAiTakeover', on: false })).code, 'ROOM_STARTED');
  // the host closes it: the spectator cannot take a seat any more, and the state stops publishing the option
  m.finish({ victory: false, reason: 'test' });
  assert.equal((await host.request({ t: 'room.setAiTakeover', on: false })).t, 'ok');
  assert.equal(Object.hasOwn(room.toState(), 'aiTakeoverEnabled'), false);
  assert.equal((await late.request({ t: 'room.aiRequest', botId: bot.playerId })).t, 'error', 'closed by the host');
  // reopening clears the others' ready, and a non-host cannot touch it
  await mate.request({ t: 'room.ready', ready: true });
  assert.equal((await host.request({ t: 'room.setAiTakeover', on: true })).t, 'ok');
  assert.equal(room.toState().aiTakeoverEnabled, true);
  assert.equal(room.seatOf(mate.id).ready, false);
  assert.equal((await mate.request({ t: 'room.setAiTakeover', on: false })).code, 'NOT_HOST');
  assert.equal((await host.request({ t: 'room.setAiTakeover', on: 'true' })).code, 'BAD_MSG');
});

test('a solo room has no takeover option (nothing to inherit)', async (t) => {
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, botRehearsal: 0 });
  t.after(() => srv.close());
  const c = await TestClient.connect(srv.url.replace('http', 'ws') + '/ws');
  t.after(() => c.terminate().catch(() => {}));
  await c.hello('Solo');
  assert.equal((await c.request({ t: 'room.create', mode: 'solo', difficulty: 'NORMAL' })).t, 'ok');
  const room = [...srv.lobby.rooms.values()][0];
  assert.equal(room.aiTakeoverEnabled, false);
  assert.equal(Object.hasOwn(room.toState(), 'aiTakeoverEnabled'), false);
});

for (const kind of ['plugin', 'hosted', 'historical']) {
  test(`takeover refuses ${kind} matches even with the room option on`, async (t) => {
    const { room, m, late } = await fixture(t);
    const oldContent = room.content, oldVersion = room.version;
    if (kind === 'plugin') room.content = { ...room.content, vanilla: false };
    if (kind === 'hosted') m.hosted = true;
    if (kind === 'historical') room.version = 'act1autochess';
    try {
      assert.equal((await late.request({ t: 'room.aiRequest', botId: m.order[2].playerId })).t, 'error');
    } finally { room.content = oldContent; room.version = oldVersion; m.hosted = false; }
  });
}
