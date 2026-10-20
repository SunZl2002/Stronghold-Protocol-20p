# v0.31-20p — 上游 v0.3.1 合并进 20 人分支

基线：上游 `sganggs/Stronghold-Protocol` **v0.3.1**（`d905c146`）合并进本分支 `capacity-20p`。
本仓库：`SunZl2002/Stronghold-Protocol-20p`。

---

## 一、合并结果

| 项 | 说明 |
|---|---|
| 上游版本 | v0.3.1（`d905c146`）|
| 冲突规模 | 42 个文件 / 91 个 hunk，逐个手工解 |
| 保留的本分支能力 | 20 人容量、公告弹窗、运行时缓存（D022）、`net.js` 传输层、200 ms 公共节流、秘术师能量与作战统计 |
| 皮肤模型 | 采用上游的 **charId 键 + 174 套外观 / 115 名干员**，叠回本分支的两个开关（`显示皮肤` / `一键装备皮肤`）|
| 语音 | 只随包中文 + 日文 |
| `data/assets.json` | 保留本分支的（含全部外观与 spine）|

> D036 仍然有效：本分支的 `WS_COMPRESSION` 不被上游的 `WS_DEFLATE` 覆盖。

---

## 二、合并过程中修掉的缺陷（9 类）

1. **`server/lobby.js` 重复广播**：`broadcastState` 同时保留了 `prepareMessage`/`sendPrepared` 与 `encode`/`sendRaw` 两条发送路径，每个 `room.state` 发两遍 —— 最后两个 match 失败即由此而来。
2. **`server/net.js` 必须保持本分支的**：上游没有 `prepareMessage` / `sendPrepared` / `wireVersionOf` / `compactWire` / 紧急 socket 集合。
3. **`get pool()` 丢失**：`server/match/player/basics.js` 少了它，匹配在 `_rollChessSlot` 抛错、永远离不开 `ROUND_START`。
4. **调度器包装缺转发**：`server/match/freezeScheduler.js` 补上 `runUntil` / `runNext` / `advance` 转发，否则测试脚手架无法步进。
5. **比赛时钟**：新增 `Match.gameNow()`（`sched.gameNow?.() ?? s.now()`），比赛侧所有游戏时钟读取统一走它。
6. **`CHESS_SECTIONS` 是位置契约**：`test/helpers/dom.js` 的 `mountVNodes` 按位置命名区块，必须严格等于上游的 9 个名字；皮肤选择器作为额外节点挂在 `skill` 之后。
7. **`SkinSection` 参数**：改成 `charId=${c.charId}`（上游按干员键）；`useSkin(chessId)` 负责棋子里 → 干员的桥接。
8. **JSDoc 未闭合**：`server/match/match/platform.js` 一处 `/**` 未闭合，导致 `onDisconnect` / `onReconnect` / `onLeave` / `_quit` / `dispose` 全被注释掉。
9. **CSP 内联脚本哈希**：`siteCsp` 必须对**实际服务的** index.html 取哈希（运行时缓存会改写 importmap），而不是磁盘上的文件。

---

## 三、合并后按你的实测反馈修的问题

### 1. 每局结算要等很久 —— 已修

根因：`Lobby.welcomeInfo()` **缺 `return info;`**（合并时丢的）。于是每个 `welcome` 都是空的：

```
welcome 无 content → 客户端拿不到内容哈希 → vanillaCs() = null
→ csAccepted() = false → e.client authoritative = false
→ 战斗结束不上报 b.result → 服务端等「战场时长 + 15 秒」→ 接管重算 → 慢
```

修复后：`real.e2e` 单人局 **1 pass / 0 fail**（此前必超时），真实对局日志不再出现 `server takeover … (timeout)`。

### 2. 皮肤相关（按报告逐条修）

| 问题 | 修复 |
|---|---|
| 局内改皮肤无效，控制台 `[skins] room.skins refused BAD_MSG` | 存储里旧的 **chessId 键**会让整张表被服务端拒绝；`parseStoredSkins` 丢弃 `chess_` 前缀的旧键 |
| 关「显示皮肤」后卡片仍显示皮肤 | `useSkin` 之前只订阅「选择变化」，补上 `useSkinsPolicy()` 订阅开关变化 |
| 「一键装备皮肤」没反应 | 它原本要求「显示其他玩家的皮肤」也开着；两者解耦 |
| 战场单位不受开关控制 | 战场走 `shownSkin → skinOf(...)`，只认「其他玩家皮肤」；改为全局开关优先 |
| 部署区棋盘不受控制 | `setPrep` 直接取 `piece.skin`，绕过开关；补判断 |
| **开关拨了场上不重画** | `view.setSettings()` 只处理了 `otherSkins`，`skinsOn` 被丢弃；补分支并调用 `refreshSkins()` |
| 关掉后卡片仍提供皮肤选项 | 干员卡片的皮肤区块按同一规则隐藏 |

### 3. 其它

- 浏览器启动级缺陷三处（`loadSkinData` 未定义、`isPersonalCosmetic` 未导入、重复 `installSkinsSync`）
- `m.public` 统一到 200 ms 最小间隔（客户端契约）
- `text-scale`、`settings-entry`、`protocol-boot` 等 e2e 适配本分支的公告弹窗
- `test/skins.test.js` 的文件遍历改为跨平台（此前在 Windows 上因反斜杠恒失败）

---

## 四、验证状态

| 组 | 结果 |
|---|---|
| `test/match` | **1177 / 0** |
| `test/ui` | **1206 / 0** |
| `test/content` | **2355 / 0** |
| `test/render` | **999 / 0** |
| `test/sim` | **928 / 0** |
| `test/skins` | **24 / 0** |
| `test/ui/skin-picker` | **14 / 0** |
| e2e（真实浏览器） | `real.e2e` 单人局通过；`protocol-boot` / `settings-entry` / `text-scale` 通过 |
| 三道闸门 | 全部通过 |

已知的**非本次引入**问题：`test/plugins` 与 `test/studio` 各有若干失败，均与 Windows 环境有关（符号链接权限、工作线程），合并前的工作树表现相同；`test/plugins/csp` 已用合并前工作树对照确认。

---

## 五、怎么跑

```bash
npm install
npm start                       # http://localhost:3000
# 开发时建议关掉运行时缓存的版本校验，改完刷新即可：
SP_HTTP_RUNTIME_CACHE=0 node server/index.js
```

测试：

```bash
node --test "test/match/**/*.test.js"
node --test "test/ui/**/*.test.js"
SP_REAL_E2E=1 SP_REAL_ROUNDS=1 node --test --test-name-pattern=solo test/ui/real.e2e.test.js
```
