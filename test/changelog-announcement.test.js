// test/changelog-announcement.test.js — 每次更新后自动公告本次更新内容 (the owner's request of 2026-10-15): a rebuilt
// container should show players what changed without anyone running a command.
//
// The rule that keeps it from becoming noise is that THE ID IS THE CONTENT: the same update text never publishes twice
// (so a mere restart re-announces nothing), and editing the section produces a new id — which is what makes the
// announcement system's own 「下次不再显示」 resurface it, deliberately.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { splitChangelog, playerFacing, changelogAnnouncement, publishChangelogAnnouncement } from '../server/changelogAnnouncement.js';
import { createAnnouncementStore } from '../server/announcements.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempStore = () => createAnnouncementStore({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'ann-test-')) });

const SAMPLE = [
  '## 未发布',
  '',
  '### 新功能',
  '- 干员皮肤可以按人挑了。',
  '',
  '### 工具与开发',
  '- `tools/setup.mjs` 加了 `--no-skins`，脚本自己不会下载素材。',
  '',
  '## 0.2.6 — 2026-10-13',
  '',
  '### 界面',
  '- 旧版本的一行。',
  '',
].join('\n');

test('I015 更新公告：取 CHANGELOG 的第一段，去掉工具与开发', () => {
  const sections = splitChangelog(SAMPLE);
  assert.equal(sections.length, 2, '按 ## 分段');
  assert.equal(sections[0].heading, '未发布');
  assert.equal(sections[1].heading, '0.2.6 — 2026-10-13');

  const body = playerFacing(sections[0].body);
  assert.match(body, /干员皮肤可以按人挑了/, '留玩家向的内容');
  assert.doesNotMatch(body, /tools\/setup\.mjs|no-skins/, '去掉「工具与开发」整段');
  assert.doesNotMatch(body, /旧版本的一行/, '只取第一段，不带上一个版本');

  const entry = changelogAnnouncement(SAMPLE);
  assert.ok(entry, '有内容就要能发');
  assert.equal(entry.title, '本次更新', '「未发布」不是版本号，标题不带它');
  assert.match(entry.id, /^changelog-[0-9a-f]{32}$/, 'id 是内容的哈希');
});

test('I015 更新公告：有版本号时标题带上它；没内容就不发', () => {
  const released = changelogAnnouncement('## 0.2.7 — 2026-10-20\n\n### 界面\n- 修好了。\n');
  assert.equal(released.title, '本次更新 · 0.2.7 — 2026-10-20', '切了版本就把版本写进标题');
  assert.equal(changelogAnnouncement(''), null, '空文件不发');
  assert.equal(changelogAnnouncement('## 未发布\n\n### 工具与开发\n- 只有开发内容。\n'), null,
    '整段都被过滤后没有可发的内容');
});

test('I015 更新公告：同一份内容只发一次 —— 重启（或重复调用）不会重发', () => {
  const store = tempStore();
  const first = publishChangelogAnnouncement({ store, root: ROOT, log: null, readFile: () => SAMPLE });
  assert.equal(first.state, 'published');
  assert.equal(store.list().items.length, 1);

  // the container-restart case: same CHANGELOG, a fresh boot
  const again = publishChangelogAnnouncement({ store, root: ROOT, log: null, readFile: () => SAMPLE });
  assert.equal(again.state, 'present', '已经发过就跳过');
  assert.equal(again.id, first.id, 'id 由内容决定，两边一致');
  assert.equal(store.list().items.length, 1, '没有多出一条');

  // and it is PINNED: a returning player sees the update note ahead of older notices
  assert.equal(store.list().pinnedId, first.id, '置顶到本次更新');
});

test('I015 更新公告：内容改了就是新的一条（这正是「免提示」重新出现的机制）', () => {
  const store = tempStore();
  const a = publishChangelogAnnouncement({ store, root: ROOT, log: null, readFile: () => SAMPLE });
  const edited = SAMPLE.replace('干员皮肤可以按人挑了。', '干员皮肤可以按人挑了，另外修了两个问题。');
  const b = publishChangelogAnnouncement({ store, root: ROOT, log: null, readFile: () => edited });
  assert.equal(b.state, 'published', '改过就发新的');
  assert.notEqual(b.id, a.id, '内容不同 → id 不同');
  assert.equal(store.list().items.length, 2);
});

test('I015 更新公告：任何失败都不能拦住服务器启动', () => {
  const store = tempStore();
  // no CHANGELOG in the image (a build that did not copy it): nothing to say, and not an error
  assert.deepEqual(publishChangelogAnnouncement({ store, root: path.join(ROOT, 'no-such-dir'), log: null }),
    { state: 'missing' });
  // a store that throws must be caught, not propagated into boot
  const broken = { list() { throw new Error('disk on fire'); }, publish() { throw new Error('nope'); } };
  const r = publishChangelogAnnouncement({ store: broken, root: ROOT, log: null, readFile: () => SAMPLE });
  assert.equal(r.state, 'failed');
  assert.match(r.error, /disk on fire/);
  // a caller with no store at all
  assert.equal(publishChangelogAnnouncement({ root: ROOT }).state, 'failed');
});

test('I015 更新公告：真的 CHANGELOG 能发出来，且不含开发脚本的噪音', () => {
  const entry = changelogAnnouncement(fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'));
  assert.ok(entry, '仓库里的 CHANGELOG 必须能解析出第一段');
  assert.ok(entry.markdown.length > 20, '正文非空');
  assert.match(entry.title, /^本次更新/, '标题');
  // 「工具与开发」 is a whole section in this file; its bullets must not reach players
  assert.doesNotMatch(entry.markdown, /^### 工具与开发/m, '不带上「工具与开发」这个标题');
});
