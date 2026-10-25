import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOM_CAPACITIES } from '../../shared/constants.js';
import { emptyLobbyDiscovery } from '../../public/js/lobbyDiscovery.js';
import { Button } from '../../public/js/ui/components.js';
import { LobbyOnlinePill, LobbyDiscoveryPanel, LobbyRoomRow, LobbyRoomList } from '../../public/js/ui/lobbyDiscovery.js';

function* walk(node) {
  if (Array.isArray(node)) { for (const child of node) yield* walk(child); return; }
  if (!node || typeof node !== 'object') return;
  yield node;
  yield* walk(node.props?.children);
}
const text = (node) => {
  if (Array.isArray(node)) return node.map(text).join('');
  if (node == null || typeof node === 'boolean') return '';
  return typeof node === 'object' ? text(node.props?.children) : String(node);
};

test('the panel offers exactly two controls: the room directory and 最快匹配 (no capacity preference any more)', () => {
  const opened = [];
  const matched = [];
  const panel = LobbyDiscoveryPanel({ state: emptyLobbyDiscovery(), connected: true,
    onOpen: () => opened.push(true), onQuickMatch: () => matched.push(true), busy: null });
  const nodes = [...walk(panel)];
  assert.equal(nodes.some((n) => n.type === 'select'), false, 'no capacity select');
  const buttons = nodes.filter((n) => n.type === Button);
  assert.equal(buttons.length, 2, '房间列表 + 最快匹配');
  assert.deepEqual(buttons.map((n) => text(n)), ['房间列表', '最快匹配']);
  assert.equal(buttons[1].props.disabled, false);
  buttons[0].props.onClick();
  buttons[1].props.onClick();
  assert.deepEqual([opened.length, matched.length], [1, 1]);
});

const room = { roomId: 'public-room-id', code: 'ABCD', mode: 'coop', difficulty: 'FUNNY', capacity: 20,
  playerCount: 10, humanCount: 2, botCount: 8, inMatch: false, joinable: true, hostOnline: false,
  allowMatchmaking: true, spectatorCount: 0, spectatorCapacity: 4, spectatable: true };
const action = (row, name) => [...walk(row)].find((node) => node.type === Button && node.props.class === `lobby-directory__${name}`);

test('directory exposes room code, capacity, AI occupancy and host-disconnected admission without replacing AI', () => {
  const joined = [];
  const row = LobbyRoomRow({ room, connected: true, busy: false, onJoin: (roomId) => joined.push(roomId) });
  const join = action(row, 'join');
  assert.equal(row.props['data-room-id'], room.roomId);
  assert.equal(row.props['data-room-code'], 'ABCD');
  assert.match(text(row), /ABCD/);
  assert.match(text(row), /10 \/ 20 席/);
  assert.match(text(row), /2 个真人 · 8 个 AI/);
  assert.match(text(row), /房主离线/);
  assert.equal(join.props.disabled, false);
  join.props.onClick();
  assert.deepEqual(joined, [room.roomId]);
});

test('running co-op rooms offer observation only; solo has no entry and full waiting rooms cannot be joined', () => {
  const watched = [];
  const progress = LobbyRoomRow({ room: { ...room, inMatch: true, joinable: false }, connected: true, onSpectate: (id) => watched.push(id) });
  assert.equal(action(progress, 'join'), undefined);
  assert.equal(action(progress, 'spectate').props.disabled, false);
  action(progress, 'spectate').props.onClick();
  assert.deepEqual(watched, [room.roomId]);
  assert.match(text(progress), /进行中/);
  const solo = LobbyRoomRow({ room: { ...room, mode: 'solo', capacity: 1, playerCount: 1, joinable: false }, connected: true });
  assert.equal([...walk(solo)].some((node) => node.type === Button), false);
  const full = LobbyRoomRow({ room: { ...room, playerCount: 20, joinable: false }, connected: true });
  assert.equal(action(full, 'join').props.disabled, true);
  assert.equal(action(full, 'spectate').props.disabled, false);
});

test('closed matchmaking hides invite codes even in malformed summaries and preserves observation', () => {
  const watched = [];
  // D034: the room's own cap drives the "used / cap" text; the fixture carries 4 from the default room above.
  const privateRoom = { ...room, code: 'SECRET', allowMatchmaking: false, joinable: false, spectatorCount: 1 };
  const row = LobbyRoomRow({ room: privateRoom, connected: true, onSpectate: (id) => watched.push(id) });
  assert.equal(Object.hasOwn(row.props, 'data-room-code'), false);
  assert.equal(row.props['data-room-id'], room.roomId);
  assert.doesNotMatch(text(row), /SECRET|房间已满/);
  assert.match(text(row), /邀请码已隐藏/);
  assert.match(text(row), /禁止匹配/);
  assert.match(text(row), /等候中/);
  assert.ok([...walk(row)].every((node) => !Object.values(node.props || {}).includes('SECRET')));
  assert.equal(action(row, 'join').props.disabled, true);
  assert.match(action(row, 'join').props.title, /邀请码/);
  const spectate = action(row, 'spectate');
  assert.equal(spectate.props.disabled, false);
  assert.equal(spectate.props.title, `观战席 1 / ${room.spectatorCapacity}`);
  spectate.props.onClick();
  assert.deepEqual(watched, [room.roomId]);
  const rooms = [{ ...privateRoom, code: null }, { ...privateRoom, code: null, roomId: 'another-id' }];
  const list = LobbyRoomList({ state: { ...emptyLobbyDiscovery(), open: true, rooms }, connected: true });
  assert.deepEqual([...walk(list)].filter((node) => node.type === LobbyRoomRow).map((node) => node.key), [room.roomId, 'another-id']);
});

test('spectator capacity and server admission are authoritative; busy, offline and missing-id actions are disabled', () => {
  // D034: the room's own spectatorCapacity is the authority, not a global constant.
  const full = LobbyRoomRow({ room: { ...room, spectatorCount: room.spectatorCapacity, spectatable: false }, connected: true });
  assert.equal(action(full, 'spectate').props.disabled, true);
  assert.match(text(action(full, 'spectate')), /观战席已满/);
  assert.equal(action(full, 'join').props.disabled, false);
  const refused = LobbyRoomRow({ room: { ...room, spectatable: false }, connected: true });
  assert.equal(action(refused, 'spectate').props.disabled, true);
  // a room that offers no spectator seats (0) shows no watch control at all
  const off = LobbyRoomRow({ room: { ...room, spectatorCapacity: 0, spectatable: false }, connected: true });
  assert.equal(action(off, 'spectate'), undefined);
  for (const patch of [{ busy: true }, { connected: false }, { room: { ...room, roomId: undefined } }]) {
    const row = LobbyRoomRow({ room, connected: true, ...patch });
    assert.equal(action(row, 'join').props.disabled, true);
    assert.equal(action(row, 'spectate').props.disabled, true);
  }
});

test('playing humans share the existing four-stat row, distinguish zero from unknown, and explain their scope', () => {
  for (const [count, expected] of [[null, '—'], [0, '0'], [87, '87']]) {
    const panel = LobbyDiscoveryPanel({ state: { ...emptyLobbyDiscovery(), playingCount: count }, connected: true });
    const stats = [...walk(panel)].filter((node) => node.type === 'b' && node.props['data-testid']);
    assert.deepEqual(stats.map((node) => node.props['data-testid']), ['lobby-room-count', 'lobby-match-count', 'lobby-playing-count', 'lobby-joinable-count']);
    assert.equal(text(stats[2]), expected);
    assert.match([...walk(panel)].find((node) => node.props.title?.includes('游玩人数仅统计')).props.title, /淘汰和托管/);
  }
});

test('all-human-disconnected rooms show reconnect retention separately from ordinary offline hosts', () => {
  const retained = LobbyRoomRow({ room: { ...room, inMatch: true, disconnectedRetained: true, joinable: false }, connected: true });
  assert.match(text(retained), /断线保留/);
  assert.match(text(retained), /进行中/);
  assert.doesNotMatch(text(retained), /房主离线/);
  const status = [...walk(retained)].find((n) => n.props?.class === 'lobby-directory__offline');
  assert.match(status.props.title, /原玩家重连/);
  const waiting = LobbyRoomRow({ room: { ...room, disconnectedRetained: true }, connected: true });
  assert.match(text(waiting), /等候加入/);
  assert.match(text(waiting), /断线保留/);
  assert.equal([...walk(waiting)].find((n) => n.type === Button).props.disabled, false);
  const list = LobbyRoomList({ state: { ...emptyLobbyDiscovery(), open: true, rooms: [{ ...room, disconnectedRetained: true }] }, connected: true });
  assert.match(text(list), /断线保留房间等待原玩家重连/);
});

test('offline lobby keeps explanatory count placeholder and disables matching and listing', () => {
  const pill = LobbyOnlinePill({ count: 100, connected: false });
  assert.equal(pill.props['aria-label'], '服务器在线人数');
  assert.match(text(pill), /在线 —/);
  assert.doesNotMatch(text(pill), /100/);
  const panel = LobbyDiscoveryPanel({ state: emptyLobbyDiscovery(), connected: false });
  const buttons = [...walk(panel)].filter((node) => node.type === Button);
  assert.equal(buttons.length, 2);
  assert.ok(buttons.every((node) => node.props.disabled));
});

test('room browser distinguishes loading, empty, disconnected and error states and bounds pagination', () => {
  const state = { ...emptyLobbyDiscovery(), open: true };
  assert.match(text(LobbyRoomList({ state, connected: true })), /当前没有房间/);
  assert.match(text(LobbyRoomList({ state: { ...state, error: true }, connected: true })), /无法获取房间列表/);
  assert.match(text(LobbyRoomList({ state, connected: false })), /尚未连接到服务器/);
  const calls = [];
  const last = LobbyRoomList({ state: { ...state, page: 1, totalPages: 2 }, connected: true, onPage: (p) => calls.push(p) });
  const footerButtons = [...walk(last.props.actions)].filter((n) => n.type === Button);
  assert.equal(footerButtons[0].props.disabled, false);
  assert.equal(footerButtons[1].props.disabled, true);
  footerButtons[0].props.onClick();
  assert.deepEqual(calls, [0]);
});
