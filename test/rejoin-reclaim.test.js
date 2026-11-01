// test/rejoin-reclaim.test.js — 同一个人的“幽灵席位”不该变成两个人。
//
// A tab closed, a reload that lost the reconnect token, or a second window opens with a fresh identity: the old seat sits
// retained (connected=false) for `lobbyGraceMs` while the new session joins. Without a reclaim the room shows the same
// person twice (the retained seat plus a new one), and `activeHumans()` counts the ghost. The waiting room now hands the
// retained seat (or the retained spectator row) back to the same name; a running match keeps its seats for the record.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../server/index.js';
import { TestClient } from './helpers/wsClient.js';

async function fixture(t, grace = 60_000) {
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, botRehearsal: 0, lobbyGraceMs: grace });
  const clients = [];
  t.after(async () => { for (const c of clients) await c.terminate().catch(() => {}); await srv.close(); });
  const url = srv.url.replace('http', 'ws') + '/ws';
  const player = async (name, token = null) => {
    const c = await TestClient.connect(url);
    clients.push(c);
    const w = await c.hello(name, token);
    c.id = w.playerId;
    c.token = w.token;
    return c;
  };
  const host = await player('Host');
  assert.equal((await host.request({ t: 'room.create', mode: 'coop', difficulty: 'NORMAL' })).t, 'ok');
  const room = [...srv.lobby.rooms.values()][0];
  const humans = () => room.seats.filter((s) => s && !s.isBot && !s.left);
  return { srv, room, host, player, humans };
}

/** Start the room's match (host + two AI seats), ready for spectating. */
async function startMatch(host, room) {
  for (let i = 0; i < 2; i++) await host.request({ t: 'room.addBot' });
  assert.equal((await host.request({ t: 'room.start' })).t, 'ok');
  const m = room.match;
  m.startRound(1);
  m.phase = 'PREP';
  m.setDeadline(0);
  return m;
}

const settle = () => new Promise((r) => setTimeout(r, 120));

test('a player who comes back with a new session takes the retained seat back (no second seat, no ghost)', async (t) => {
  const { srv, room, host, player, humans } = await fixture(t);
  const me = await player('Me');
  assert.equal((await me.request({ t: 'room.join', code: room.code })).t, 'ok');
  const oldId = me.id;
  const seatIndex = room.seatOf(oldId).seat;
  await me.terminate();
  await settle();
  assert.equal(room.seatOf(oldId).connected, false, 'the seat is retained during the grace window');
  assert.equal(humans().length, 2, 'host + the retained seat');
  // the same person, new session (a reload that lost the token / a second window)
  const back = await player('Me');
  assert.equal((await back.request({ t: 'room.join', code: room.code })).t, 'ok');
  const mine = humans().filter((s) => s.name === 'Me');
  assert.equal(mine.length, 1, 'one person, one seat');
  assert.equal(mine[0].seat, seatIndex, 'the same seat index came back');
  assert.equal(mine[0].playerId, back.id);
  assert.equal(mine[0].connected, true);
  assert.equal(room.seatOf(oldId), null, 'the ghost seat id is gone');
  assert.equal(srv.registry.byId(oldId), null, 'the old session was retired');
  assert.equal(room.activeHumans().length, 2, 'the ghost no longer counts');
  // the old token belongs to a retired session: it does not resume into the seat
  const late = await player('Me', me.token);
  assert.notEqual(late.id, back.id);
  assert.equal(late.id, oldId, 'a fresh session for that token, not the claimed seat');
});

test('the same person as a spectator: the retained row is taken over, not duplicated', async (t) => {
  const { room, player } = await fixture(t);
  const me = await player('Me');
  assert.equal((await me.request({ t: 'room.spectate', code: room.code })).t, 'ok');
  const oldId = me.id;
  await me.terminate();
  await settle();
  assert.equal(room.spectators.length, 1);
  assert.equal(room.spectators[0].connected, false);
  const back = await player('Me');
  assert.equal((await back.request({ t: 'room.spectate', code: room.code })).t, 'ok');
  assert.equal(room.spectators.length, 1, 'still one spectator row');
  assert.equal(room.spectators[0].playerId, back.id);
  assert.equal(room.spectators[0].connected, true);
  assert.equal(room.spectatorOf(oldId), null);
});

test('a reclaimed seat keeps the room host (the ghost was the host)', async (t) => {
  const { srv, room, host, player } = await fixture(t);
  const oldHost = host.id;
  await host.terminate();
  await settle();
  assert.equal(room.seatOf(oldHost).connected, false);
  const again = await player('Host');
  assert.equal((await again.request({ t: 'room.join', code: room.code })).t, 'ok');
  assert.equal(room.hostId, again.id, 'host follows the person, not the session');
  assert.equal(room.seatOf(oldHost), null);
  assert.equal(room.seats.filter((s) => s && !s.isBot).length, 1, 'one host seat');
  assert.equal(srv.registry.byId(oldHost), null);
});

test('a spectator who drops during a match leaves no row behind after the grace window', async (t) => {
  const { room, host, player } = await fixture(t, 150);
  const m = await startMatch(host, room);
  const me = await player('Me');
  assert.equal((await me.request({ t: 'room.spectate', code: room.code })).t, 'ok');
  assert.equal(room.spectators.length, 1);
  await me.terminate();
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(room.spectators.length, 0, 'the watcher row is freed like in a waiting room');
  assert.equal(m.spectators.size, 0, 'and the match forgot it');
});

test('a spectator back with a new session during a match takes the row over (one row, one match spectating id)', async (t) => {
  const { room, host, player } = await fixture(t);
  const m = await startMatch(host, room);
  const me = await player('Me');
  assert.equal((await me.request({ t: 'room.spectate', code: room.code })).t, 'ok');
  const oldId = me.id;
  assert.ok(m.spectators.has(oldId), 'the match knows the watcher');
  await me.terminate();
  await settle();
  assert.equal(room.spectators.length, 1);
  assert.equal(room.spectators[0].connected, false);
  const back = await player('Me');
  assert.equal((await back.request({ t: 'room.spectate', code: room.code })).t, 'ok');
  assert.equal(room.spectators.length, 1, 'still one row');
  assert.equal(room.spectators[0].playerId, back.id);
  assert.equal(m.spectators.has(oldId), false, 'the match forgot the ghost id');
  assert.ok(m.spectators.has(back.id), 'and registered the returning watcher');
});

test('a live occupant is never reclaimed: a different person with the same name waits for a seat', async (t) => {
  const { room, player } = await fixture(t);
  const first = await player('Twin');
  assert.equal((await first.request({ t: 'room.join', code: room.code })).t, 'ok');
  const second = await player('Twin');
  assert.equal((await second.request({ t: 'room.join', code: room.code })).t, 'ok', 'a free seat is available');
  const twins = room.seats.filter((s) => s && !s.isBot && s.name === 'Twin');
  assert.equal(twins.length, 2, 'two live sessions keep their two seats');
  assert.notEqual(twins[0].playerId, twins[1].playerId);
});

test('a spectator who took an AI seat and left can spectate and leave again: one row, and leave always works', async (t) => {
  const { srv, room, host, player } = await fixture(t);
  const m = await startMatch(host, room);
  const me = await player('www');
  assert.equal((await me.request({ t: 'room.spectate', code: room.code })).t, 'ok');
  const botId = m.order[1].playerId;
  assert.equal((await me.request({ t: 'room.aiRequest', botId })).t, 'ok');
  // the handover moved the session onto the AI seat's id, which is what the spectator row will carry
  const id = srv.registry.byToken(me.token).playerId;
  assert.equal((await me.request({ t: 'room.leave' })).t, 'ok', 'leaving the inherited seat works');
  // the match keeps that seat as left in its record; the same session now spectates again under its ai_* identity
  for (let i = 0; i < 3; i++) {
    assert.equal((await me.request({ t: 'room.spectate', code: room.code })).t, 'ok', `spectate ${i}`);
    assert.equal(room.spectators.filter((s) => s.playerId === id).length, 1, 'one row for the same playerId');
    assert.equal((await me.request({ t: 'room.leave' })).t, 'ok', `leave ${i}`);
    assert.equal(room.spectators.length, 0, 'the row is freed again');
  }
  assert.equal(room.seatOf(botId)?.left, true, 'the inherited seat stays in the record');
});

test('退出游戏 (g.leave) then re-entering to watch works: the departed player watches as a spectator', async (t) => {
  const { srv, room, host, player } = await fixture(t);
  const m = await startMatch(host, room);
  const me = await player('www');
  assert.equal((await me.request({ t: 'room.spectate', code: room.code })).t, 'ok');
  assert.equal((await me.request({ t: 'room.aiRequest', botId: m.order[1].playerId })).t, 'ok');
  await new Promise((r) => setTimeout(r, 50));
  assert.equal((await me.request({ t: 'g.leave' })).t, 'ok', 'quit the game');
  assert.equal(room.spectators.length, 0);
  // back into the room to watch: the row is new, and the id is still the departed seat's
  assert.equal((await me.request({ t: 'room.spectate', code: room.code })).t, 'ok');
  assert.equal(room.spectators.length, 1);
  me.clearInbox();
  const res = await me.request({ t: 'g.watch', fieldId: 'n:' + host.id });
  assert.equal(res.t, 'ok', JSON.stringify(res));
  const field = await me.waitFor('m.field', () => true, 3000).catch(() => null);
  assert.ok(field, 'the watcher receives the board it asked for');
  assert.equal(field.fieldId, 'n:' + host.id);
  assert.equal((await me.request({ t: 'g.refresh' })).code, 'SPECTATOR', 'a watcher cannot act as a player');
  assert.equal(srv.registry.byToken(me.token).playerId, room.spectators[0].playerId);
});
