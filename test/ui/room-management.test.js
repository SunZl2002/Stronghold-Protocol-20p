import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Button } from '../../public/js/ui/components.js';
import { roomFacts, SeatCard, MatchmakingControl } from '../../public/js/screens/room.js';

function* walk(node) {
  if (Array.isArray(node)) { for (const child of node) yield* walk(child); return; }
  if (!node || typeof node !== 'object') return;
  yield node;
  yield* walk(node.props?.children);
}

const host = { seat: 0, playerId: 'host', name: 'Host', connected: true, ready: false, isBot: false };
const guest = { seat: 1, playerId: 'guest', name: 'Guest', connected: true, ready: true, isBot: false };
const bot = { seat: 2, playerId: 'bot', name: 'AI', connected: true, ready: true, isBot: true };
const room = (changes = {}) => ({ hostId: host.playerId, mode: 'coop', capacity: 4, inMatch: false, seats: [host, guest, bot, null], ...changes });

test('matchmaking defaults open in old frames and only a seated waiting co-op host can change it', () => {
  for (const capacity of [4, 8, 20]) {
    const source = room({ capacity });
    assert.equal(roomFacts(source, 'host').allowMatchmaking, true);
    assert.equal(roomFacts(source, 'host').canSetMatchmaking, true);
    assert.equal(roomFacts({ ...source, allowMatchmaking: false }, 'host').allowMatchmaking, false);
    for (const id of ['guest', 'bot', 'spectator', 'missing']) assert.equal(roomFacts(source, id).canSetMatchmaking, false);
  }
  for (const changes of [{ inMatch: true }, { mode: 'solo' }, { seats: [null, guest] }, { seats: [{ ...host, left: true }] }, { seats: [{ ...host, isBot: true }] }]) {
    assert.equal(roomFacts(room(changes), 'host').canSetMatchmaking, false);
  }
});

test('matchmaking switch follows server state, busy and connection state, and host-transfer permissions', () => {
  const changed = [];
  const facts = roomFacts(room(), 'host');
  const props = { facts, connected: true, busy: null, onChange: (allowed) => changed.push(allowed) };
  const control = MatchmakingControl(props);
  assert.equal(control.type, 'button');
  assert.equal(control.props.role, 'switch');
  assert.equal(control.props['aria-checked'], 'true');
  assert.equal(control.props['aria-label'], '允许匹配');
  assert.equal(control.props.disabled, false);
  assert.match(control.props.title, /邀请码仍可加入，观战不受影响/);
  control.props.onClick();
  const closed = MatchmakingControl({ ...props, facts: roomFacts(room({ allowMatchmaking: false }), 'host') });
  assert.equal(closed.props['aria-checked'], 'false');
  closed.props.onClick();
  assert.deepEqual(changed, [false, true]);
  assert.equal(MatchmakingControl({ ...props, busy: 'capacity' }).props.disabled, true);
  assert.equal(MatchmakingControl({ ...props, connected: false }).props.disabled, true);
  const transferred = room({ hostId: 'guest', allowMatchmaking: false, seats: [{ ...guest, seat: 0 }, { ...host, seat: 1 }, bot] });
  const oldHost = MatchmakingControl({ ...props, facts: roomFacts(transferred, 'host') });
  assert.equal(oldHost.type, 'span');
  assert.equal(oldHost.props.onClick, undefined);
  assert.equal(oldHost.props.role, 'status');
  const newHost = MatchmakingControl({ ...props, facts: roomFacts(transferred, 'guest') });
  assert.equal(newHost.type, 'button');
  assert.equal(newHost.props['aria-checked'], 'false');
});

test('AI room limit counts only AI, supports zero and unrestricted old frames, and never expands capacity', () => {
  for (const capacity of [4, 8, 20]) {
    const source = room({ capacity });
    assert.equal(roomFacts(source, 'host').canAddBot, true);
    assert.equal(roomFacts({ ...source, maxAiPerRoom: null }, 'host').maxAiPerRoom, null);
    const atLimit = roomFacts({ ...source, maxAiPerRoom: 1 }, 'host');
    assert.equal(atLimit.botCount, 1);
    assert.equal(atLimit.aiLimitReached, true);
    assert.equal(atLimit.aiLimitExceeded, false);
    assert.equal(atLimit.canAddBot, false);
    assert.equal(atLimit.canStart, true);
    const overLimit = roomFacts({ ...source, maxAiPerRoom: 0 }, 'host');
    assert.equal(overLimit.aiLimitExceeded, true);
    assert.equal(overLimit.canStart, false);
  }
  assert.equal(roomFacts(room({ maxAiPerRoom: 19, seats: [host, guest, bot, { ...bot, seat: 3, playerId: 'bot2' }] }), 'host').canAddBot, false);
  assert.equal(roomFacts(room(), 'guest').canAddBot, false);
  assert.equal(roomFacts(room({ inMatch: true }), 'host').canAddBot, false);
  assert.equal(roomFacts(room({ mode: 'solo', capacity: 1, seats: [host] }), 'host').canAddBot, false);
});

test('room transfer eligibility contains only online other humans and never observers or playing matches', () => {
  const offline = { ...guest, seat: 3, playerId: 'offline', connected: false };
  const source = room({ seats: [host, guest, bot, offline], spectators: [{ playerId: 'spectator', connected: true }] });
  assert.deepEqual(roomFacts(source, 'host').transferableHumans.map((s) => s.playerId), ['guest']);
  for (const playerId of ['guest', 'bot', 'spectator', 'missing']) {
    assert.deepEqual(roomFacts(source, playerId).transferableHumans, []);
  }
  assert.deepEqual(roomFacts({ ...source, inMatch: true }, 'host').transferableHumans, []);
});

// The 0.3.3 seat card is a hook component (useState / useRise: the 转场 flash and the failed-picture list), so these
// two cases pin the behaviour where it lives now — roomFacts (the facts the card renders) and the card's source (the
// controls it offers) — instead of rendering it outside a hook context.
test('member controls render transfer beside kick, preserve confirmed identities, and disable while busy', () => {
  const src = readFileSync(new URL('../../public/js/screens/room.js', import.meta.url), 'utf8');
  // the host's controls on another doctor's card: 转让房主 (crown) beside 移出 (close), both gated by `busy`
  assert.match(src, /class="rseat__kick rseat__crown"[^>]*disabled=\$\{busy === `transfer\$\{index\}`\}/);
  assert.match(src, /onClick=\$\{\(\) => onTransferHost\(index, seat\.playerId\)\}/);
  assert.match(src, /onClick=\$\{\(\) => onKick\(index, seat\.name, seat\.playerId\)\}/);
  // the confirmed identity travels in props, never re-read from a stale seat object
  assert.match(src, /onKick\(index, seat\.name, seat\.playerId\)/);
  const source = room();
  // a connected guest is transferable; an offline one is not; the host never transfers to itself
  assert.deepEqual(roomFacts(source, 'host').transferableHumans.map((s) => s.playerId), ['guest']);
  assert.deepEqual(roomFacts(source, 'guest').transferableHumans, []);
  assert.deepEqual(roomFacts({ ...source, inMatch: true }, 'host').transferableHumans, []);
});

test('empty seats explain server AI limit and block repeated or conflicting additions', () => {
  const src = readFileSync(new URL('../../public/js/screens/room.js', import.meta.url), 'utf8');
  // the empty card offers 添加 AI 队友 only while the server allows another one, and says why when it does not
  assert.match(src, /const canAdd = coop && facts\.isHost && facts\.canAddBot !== false;/);
  assert.match(src, /title=\$\{facts\.aiLimitReached \? t\('已达到服务器允许的 AI 队友上限'\) : undefined\}/);
  assert.match(src, /disabled=\$\{!!busy\}/);
  const limited = room({ maxAiPerRoom: 1 });
  const facts = roomFacts(limited, 'host');
  assert.equal(facts.aiLimitReached, true);
  assert.equal(facts.canAddBot, false, 'the server limit blocks another AI seat');
  const open = roomFacts(room(), 'host');
  assert.equal(open.aiLimitReached, false);
  assert.equal(open.canAddBot, true);
});
