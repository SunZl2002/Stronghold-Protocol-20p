# v0.3.3 同步（上游 `gh/master` = f07b8965）— 进度与计划

> 状态：**进行中**。合并在隔离工作树 `../sp-v033`（分支 `v0.3.3-sync`）里未完成，主工作树 `capacity-20p` 不受影响。
> 恢复方式：`cd ../sp-v033`，`git status` 会列出未合并文件，继续解即可。

## 一、上游变化

| 项 | 值 |
|---|---|
| 上游最新 | `f07b8965` = **v0.3.3**（GitHub `sganggs/Stronghold-Protocol`）|
| 新 tag | v0.3.2（`5def2977`）、v0.3.3（`f07b8965`）|
| 我们的基线 | `d905c146`（v0.3.1 之后的文档提交）|
| 新增提交 | **496** |
| 冲突文件 | **53**（试算与实际合并一致）|

远程：仓库里新增了 `gh` → `https://github.com/sganggs/Stronghold-Protocol.git`。
旧的 `upstream` 远程指向本地镜像 `zmd/Stronghold-Protocol`（其 `origin/master` 还停在 d905c146，`master` 分支更旧）。

## 二、已解决（8 个文件）

| 文件 | 处理 |
|---|---|
| `CHANGELOG.md` | 取上游 |
| `docs/ARCHITECTURE.md` | 取上游 |
| `docs/design/network.md` | 取上游 |
| `data/assets.json` | **取我方**（174 套外观数据，业主决定）|
| `package.json` | 版本 0.3.3（上游）+ **两边的 scripts 并集**（保 `verify:20p`）|
| `tools/botbench.mjs` | 取上游（局部变量重命名）|
| `shared/constants.js` | **并集**：保我方 `MAX_SPECTATORS=8 / DEFAULT=4 / [0,2,4,6,8]`，加上游 `SETUP_REROLL_COOLDOWN_MS`；错误码与文案两边都留（含上游 `SERVER_FULL`、`ROOM_CODE_TAKEN`）|
| `test/ws-compression.test.js` | **取我方**（D036：`WS_COMPRESSION` 不被上游 `WS_DEFLATE` 覆盖）|

## 三、剩余 45 个（按优先级）

### A. 契约层（先解，决定后面所有代码）
- `shared/protocol.js` — 我方 D039 在线名册 + 上游新 schema（`lobby.watch`、重刷投票等）

### B. 服务端核心（必须保住本分支能力）
- `server/net.js` — **D036 传输层**（`prepareMessage` / `sendPrepared` / `compactWire` / 紧急 socket）
- `server/http/{static,routes,websocket}.js`、`server/index.js` — **D022 运行时缓存**（`?rv=` 版本目录）
- `server/lobby.js`（14 处，最多）— 公告、`welcomeInfo` 的 `return info`、`broadcastState` 单次发送
- `server/match/{bot.js}`、`server/match/match/{phases,platform,spDraft}.js` — 20 人容量与分波联防

### C. 客户端
- `public/js/{main,net}.js`、`public/js/battle/runner.js`
- `public/js/screens/{game,lobby,room,loadout,briefing,bandDraft,ownership}.js`
- `public/js/ui/{detailPanel,hud,shopBar,loadoutModel,fallbackField,gameComponents,gameLogic/*}.js`

### D. 样式与测试
- `public/css/{components.css,screens/*.css}`（5）
- `test/{client-static,lobby,package,skins}.test.js`、`test/render/recovery.browser.test.js`、`test/ui/{community-controls.e2e,gameLogic,match-info,standin-ui}.test.js`、`test/update-package.test.js`

## 四、解决原则（沿用 v0.3.1 的经验）

1. **本分支独有能力一律保留**：D036 压缩、D022 运行时缓存、20 人容量、公告、皮肤双开关、作战统计入口、`get pool()`、单次 `broadcastState`、`welcomeInfo` 的 return
2. **上游的新功能按上游实现收下**：v0.3.2/0.3.3 的新特性（重刷投票、房间密钥、服务器在线上限等）成套引入，不做裁剪
3. **数据与文档**：`data/assets.json` 用我方；`CHANGELOG`/`docs` 用上游；`package.json` 版本取上游、scripts 并集
4. **每个文件解完立刻 `node --check`**，语义型冲突（同名函数两条实现）要逐行比对再合
5. 全部解完后跑：`test/match`、`test/ui`、`test/skins`、`test/ws-compression`、三道闸门

## 五、已知的坑（v0.3.1 时踩过）

- 「同一件事两条路径」是这类合并最高频的缺陷（重复声明、重复发送、重复实现）—— 解完每个文件先搜一遍同名标识符
- 上游 `MAX_SPECTATORS` 从 8 改成 2，**不能**让上游那行覆盖我方 8
- 上游把 `unite`/`phases` 的流程改写过，`_startRoundAfterOffers` 与 `beforePrepOffers` 的调用关系要重新核对
- `test/ws-compression.test.js` 是 D036 的守卫，**绝不能取上游**
