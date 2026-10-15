// test/ui/danmaku.test.js — 聊天弹幕 (I014): a chat message crosses the match screen once, carrying the speaker's
// 策略 icon, name and text. The switch is OPT-IN and OFF IS THE OLD BEHAVIOUR, so most of what is worth pinning here is
// what must NOT happen: nothing flies while the switch is off, nothing flies for a replayed message, and nothing
// survives the cap. The rest asks the layer to render, through the same minimal DOM the other UI tests use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
globalThis.fetch = async (url) => {
  const name = String(url).split('/').pop();
  try {
    const body = readFileSync(path.join(ROOT, 'data', name), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => ({}) };
  }
};

import { installMiniDom, mountVNode } from '../helpers/dom.js';
installMiniDom();
const preact = await import('../../public/vendor/preact.module.js');
await import('../../public/vendor/hooks.module.js');

const D = await import('../../public/js/ui/danmaku.js');
const { DEFAULT_SETTINGS, sanitizeSettings } = await import('../../public/js/ui/gameLogic/settings.js');

/** Reset the module's RAM between cases, and say what the switch should report. */
function arm(enabled) {
  D.resetDanmaku();
  D.setDanmakuEnabledPolicy(() => enabled);
  D.setDanmakuParticipants(() => null);
}

test('I014 聊天弹幕：默认关闭，且关闭时就是现在的行为（一条都不飘）', () => {
  assert.equal(DEFAULT_SETTINGS.chatDanmaku, false, '默认必须是关闭');
  // a profile saved BEFORE this key existed carries nothing: it must land on the default, not on true
  assert.equal(sanitizeSettings({ bgm: 0.5 }).chatDanmaku, false, '老存档保持原行为');
  assert.equal(sanitizeSettings({ chatDanmaku: true }).chatDanmaku, true, '开启能存住');
  assert.equal(sanitizeSettings({ chatDanmaku: 'yes' }).chatDanmaku, false, '非布尔一律回默认');

  arm(false);
  const id = D.pushDanmaku({ seq: 1, playerId: 'p_a', name: '甲', text: '喂' }, { matchId: 'm1' });
  assert.equal(id, 0, '关闭时拒绝');
  assert.equal(D.danmakuStore.get().items.length, 0, '关闭时列表为空');
});

test('I014 聊天弹幕：开启后飘一次；同一局里重复的 seq 是重放，不再飘', () => {
  arm(true);
  const id = D.pushDanmaku({ seq: 7, playerId: 'p_a', name: '甲', text: '你好' }, { matchId: 'm1' });
  assert.ok(id > 0, '开启时接受');
  assert.equal(D.danmakuStore.get().items.length, 1);
  assert.equal(D.danmakuStore.get().items[0].text, '你好');

  // `seq` is monotonic WITHIN a match, so the same seq again is the reconnect snapshot (m.chatState) replaying the
  // retained history — flying it again would curtain the board after every reconnect.
  const again = D.pushDanmaku({ seq: 7, playerId: 'p_a', name: '甲', text: '你好' }, { matchId: 'm1' });
  assert.equal(again, 0, '同一局重复 seq 拒绝');
  assert.equal(D.danmakuStore.get().items.length, 1, '没有多出一条');
});

test('I014 聊天弹幕：seq 按对局区分 —— 换一局后 seq 从 1 重来，不能被上一局挡住', () => {
  arm(true);
  D.pushDanmaku({ seq: 1, playerId: 'p_a', name: '甲', text: '第一局' }, { matchId: 'm1' });
  const next = D.pushDanmaku({ seq: 1, playerId: 'p_a', name: '甲', text: '第二局' }, { matchId: 'm2' });
  assert.ok(next > 0, 'seq 每局重置，第二局的开头必须能飘（扁平集合会在这里哑掉）');
});

test('I014 聊天弹幕：超过上限就丢弃，但聊天框里的消息不受影响', () => {
  arm(true);
  for (let i = 1; i <= D.DANMAKU_MAX; i++) {
    assert.ok(D.pushDanmaku({ seq: i, playerId: 'p_a', name: '甲', text: `第${i}` }, { matchId: 'm1' }) > 0);
  }
  assert.equal(D.danmakuStore.get().items.length, D.DANMAKU_MAX);
  const over = D.pushDanmaku({ seq: D.DANMAKU_MAX + 1, playerId: 'p_a', name: '甲', text: '挤不下' }, { matchId: 'm1' });
  assert.equal(over, 0, '超出上限拒绝');
  assert.equal(D.danmakuStore.get().items.length, D.DANMAKU_MAX, '不超上限');
  // and it is NOT remembered as flown: were it dropped silently into the seen-set, re-sending it later would be lost
  D.dropDanmaku(D.danmakuStore.get().items[0].id);
  assert.ok(D.pushDanmaku({ seq: D.DANMAKU_MAX + 1, playerId: 'p_a', name: '甲', text: '挤不下' }, { matchId: 'm1' }) > 0,
    '让出位置后，同一条还能飘（被丢弃不等于已飘过）');
});

test('I014 聊天弹幕：没有对局界面时不飘（大厅不该出现弹幕）', () => {
  arm(true);
  assert.equal(D.pushDanmaku({ seq: 1, playerId: 'p_a', name: '甲', text: '喂' }, { visible: false, matchId: 'm1' }), 0);
  assert.equal(D.danmakuStore.get().items.length, 0);
  // and a malformed entry never reaches the layer
  assert.equal(D.pushDanmaku({ seq: 1, text: '' }, { matchId: 'm1' }), 0, '空文本拒绝');
  assert.equal(D.pushDanmaku({ seq: 'x', text: '喂' }, { matchId: 'm1' }), 0, '非整数 seq 拒绝');
});

test('I014 聊天弹幕：渲染出的每一行带头像槽、名称与内容', () => {
  arm(true);
  D.setDanmakuParticipants(() => new Map([['p_a', { name: '甲', seat: 0, bandId: 'yanShip' }]]));
  const id = D.pushDanmaku({ seq: 3, playerId: 'p_a', name: '甲', text: '看这条' }, { matchId: 'm1' });
  assert.ok(id > 0);

  const node = mountVNode(preact, D.DanmakuLayer);
  assert.ok(node, '有内容时必须渲染出层，而不是 null');
  const json = JSON.stringify(node);
  assert.match(json, /danmaku__avatar/, '带头像槽（策略图标由 PlayerAvatar 解析，和聊天行同源）');
  assert.match(json, /danmaku__name/, '带名称');
  assert.match(json, /看这条/, '带消息内容');

  // the animation ends -> the row goes away by itself (no poll, no timer)
  const items = D.danmakuStore.get().items.length;
  D.dropDanmaku(id);
  assert.equal(D.danmakuStore.get().items.length, items - 1);
  assert.equal(mountVNode(preact, D.DanmakuLayer), null, '空了之后整层不渲染');
});

test('I014 聊天弹幕：观战者飘出来是「名称首字 + 名称 · 观战 + 内容」，没有策略图标', () => {
  arm(true);
  // A spectator is NOT a match participant: room.spectators carries { playerId, name, connected } and the match's
  // public players[] does not list them at all, so there is no bandId to resolve. That is the 「没选干员就只显示名称
  // 和内容」 path, reached for a different reason — pinned here so a later change cannot quietly start showing another
  // player's strategy icon next to a spectator's words.
  D.setDanmakuParticipants(() => new Map([['p_player', { name: '玩家', seat: 0, bandId: 'yanShip' }]]));
  const id = D.pushDanmaku(
    { seq: 1, playerId: 'p_spec', name: '观众', text: '打得不错', seat: null, spectator: true },
    { matchId: 'm1' },
  );
  assert.ok(id > 0, '观战者的消息照样飘');

  const node = mountVNode(preact, D.DanmakuLayer);
  const json = JSON.stringify(node);
  assert.match(json, /观众/, '有名称');
  assert.match(json, /打得不错/, '有内容');
  assert.match(json, /观战/, '带观战标记（与聊天行同一个 msgid）');
  assert.match(json, /danmaku__avatar/, '头像槽仍在（退化成名称首字）');

  const item = D.danmakuStore.get().items[0];
  assert.equal(item.spectator, true, '观战标记被保留');
  assert.equal(item.seat, null, '观战者没有席位');
});

test('I014 聊天弹幕：CSS 的时长与 JS 的常量一致（不一致会截断或留下停住的一行）', () => {
  const css = readFileSync(path.join(ROOT, 'public/css/match-chat.css'), 'utf8');
  const m = css.match(/--danmaku-dur:\s*(\d+)ms/);
  assert.ok(m, 'CSS 里必须定义 --danmaku-dur');
  assert.equal(Number(m[1]), D.DANMAKU_MS,
    'DANMAKU_MS 与 --danmaku-dur 必须相同：行是靠 animationend 自删的');
  assert.match(css, /\.danmaku\s*\{[^}]*pointer-events:\s*none/, '弹幕层不能吃掉棋盘的点击');
});
