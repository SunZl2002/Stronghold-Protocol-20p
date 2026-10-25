
## 7. v0.3.3 同步进度（2026-10-25T08:58）

分支 `v0.3.3-sync`（worktree `sp-v033`），已完成并 `git add` 的文件：

- server：net.js(5) · http/{routes,static,websocket}(3) · index.js(7) · lobby.js(14) · match/bot.js(1) ·
  match/match/{phases,platform,spDraft}(4)
- css：components · screens/{briefing,draft,loadout,lobby,room}（union；同选择器时 ours 在后，布局以本分支为准）
- client js：net.js · main.js · battle/runner.js · screens/{bandDraft,briefing,ownership} · ui/{fallbackField,
  gameComponents,hud,shopBar,detailPanel,loadoutModel} · ui/gameLogic/{draft,settings}

**剩余 4 个文件、26 块**：screens/game.js(3) · screens/loadout.js(3) · screens/lobby.js(8) · screens/room.js(12)。

校验状态：`server/net.js`、lobby.js、index.js、http/*、match/* 全部 `node --check` 通过；
`test/net-online-cap` + `test/net-heartbeat-chunked` 15/15 通过（说明整条服务端启动链已可用）。

已确立的解法（下一轮照此继续）：

1. **不可能两侧都留**的块（同一函数/规则被两侧改写）：按“本分支的 UI/服务端确实使用哪一侧”选，而不是按新旧。
   - spDraft.js 机变回合：保留本分支的分组回合（g.token / g.timer / syncDraftDeadline），
     bot 选牌用 `botPickCard` 兜底 + 上游 `this.bot.decide?.()` 钩子（import 里补回 `botPickCard`）。
   - phases.js 的 `humansFirst` 上游新增**不要引入**：本分支的 `makeDraftGroups` + `prioritizeDraftOrder`
     已经实现“手动玩家优先”，只把 `this._rerollStartAt.clear()` 留下。
   - bandDraft / detailPanel / ownership / shopBar / fallbackField / gameComponents：一律保留本分支的皮肤与分页界面。
2. **各留一半**的块：本分支的一侧在块内被截断（缺收尾 `}`），共享尾部只够闭合一侧 →
   在替换文本里给本分支补齐收尾，再放上游内容，让共享尾部闭合上游那一侧（loadoutModel.js 的 b1/b2 就是这样解的）。
3. **两端都完整**的块：直接 union（CSS、index.js 的 options/return、hud 的 props 等）。
4. 本分支必须保留的语义：`ps.pool`（按池组）而不是 `m.pool`（组 0 兼容）；`runtimeCache`（D022）；
   20 人 capacity/spectatorCapacity；`welcomeInfo()` 的 return；单次 `broadcastState`；皮肤双开关；
   `state.resync`/`room.card`/`room.rerollSetup`/`room.proposeVersion` 等 0.3.3 新意图要并进 HEAVY_TYPES；
   `send()` 走 `prepareStateFrame` 且 `commit()` 只在真正入队后调用。

注意：本机是 Windows PowerShell 5.1，`Set-Content`/`Get-Content` 会把 UTF-8 中文写成乱码 + BOM。
所有文本改动用 `.mjs` 脚本（`readFileSync/writeFileSync`）或 edit 工具；已确认 server/http/{routes,static,websocket}.js
一次性被写坏过一次，用 `git checkout --merge --` 复原后重做。

## 8. 冲突清零（v0.3.3 合并完成）

`git diff --name-only --diff-filter=U` = **0**。全部 53 个冲突文件已解并 `git add`（924 个文件在索引里，未提交）。

### 最后 4 个文件的解法

| 文件 | 块 | 解法 |
|---|---|---|
| `screens/game.js` | 3 | 并集：上游 `hudIn` 过渡态 + `AiTakeoverPanel`，本分支 `clockPub` 与聊天按钮 |
| `screens/loadout.js` | 3 | 导入并集；卡片/立绘保留本分支的皮肤头像 |
| `screens/lobby.js` | 8 | **整体保留本分支界面**，仅导入表取并集 |
| `screens/room.js` | 12 | **整体保留本分支界面**（`git checkout HEAD --`） |

大厅与房间是上游整体重写的界面（hub / 同盟·协议对话框 / rseat 立绘座位卡 / 名片干员选择器）。逐块拼接会留下两套
互不兼容的骨架（实测：拼完 eslint 报 `roomMode`/`me`/`ModeCard`/`fresh`/`botPrefix` 等十多个 no-undef），
所以这两屏**整体用本分支**，本分支的 20 人席位、观战席位、AI 上限、D039 在线名单、发现面板、S.W.E.E.P. 都在。
上游新版大厅/房间的**外观**这次没有并入 —— 需要时再单独做一轮“界面替换”，与本合并解耦。

### 合并顺手修掉的缺陷（eslint 19 error → 0）

1. `WS_DEFLATE` 被上游的 13 bit 覆盖，违反 D036 → 恢复 `serverMaxWindowBits: 11` + `serverNoContextTakeover: true`。
   `test/ws-compression` 4/4 通过（这是唯一一个由合并引入的测试回归）。
2. `server/lobby.js`：重复 `case 'room.skins'`；两份 `skins()` 方法（删旧的，留会 `broadcastState` 的新版）；
   `seats[].skins` 在 seatState 与 humanSeat 各重复一次。
3. `shared/constants.js`：`ROOM_FULL/ROOM_STARTED/NOT_HOST/NOT_READY` 各出现两次（第二次和 `SERVER_FULL` 同行）。
4. `server/http/routes.js`：`publicResponses` 从来没声明过，带宽应急调 `abortPublicRequests()` 会抛 ReferenceError
   → 补 `const publicResponses = new Set()` 并在 listener 里 `add` + `res.once('close', delete)`。
5. `server/match/player/acquire.js`：`slotOf` 声明在 0.3.1 那次合并里丢了 → 恢复 equipped 位置记忆。
6. `render/app/info.js` 重复 `skin` 键（保留带 `skinsVisible()` 的那个）；`bandDraft.js` 补 `MicroLabel/LpTower/MatchEnemies`；
   `ownership.js` 补 `OperatorImage`。

### 预先存在的失败（主分支同样失败，非合并引入）

- `test/lobby.test.js`：`ETag / Last-Modified revalidation`（`/js/app.js?v=123` 期望 no-cache，实际 immutable）、
  `healthz counts rooms and sockets`（测试里 `VERSIONS` 未定义）。
- `test/skins.test.js`：两条**文本钉**（`pieceInfo` / `render/app.js`）匹配的是更旧的源码写法。

### 运行验证

`PORT=3001 node server/index.js`（worktree）→ `/healthz` 返回 `ok=true, app=0.3.3`，首页 200。
3000 端口仍是 v0.3.1 发布版，可用于对照。

### 下一步

1. 等完整 `node tools/test-run.mjs` 跑完，与主分支基线逐项对比（match 1177 / ui 1206 / content 2355 / render 999 / sim 928）。
2. 提交 `v0.3.3-sync`（merge commit），之后把 `capacity-20p` 快进/合并到该分支并推送。
3. 发布前再决定：要不要把上游新版大厅/房间界面单独接回来。

## 9. 测试基线复核（v0.3.3 合并后）

对比主分支（0.3.1）与干净上游（`gh/master` worktree）跑出来的结果：

| 套件 | 本分支（合并后） | 说明 |
|---|---|---|
| test/match | 1463 / 1465 | 2 个失败均为**子进程/Worker 环境相关**：`external-transports` 单跑 16/16 通过（并行负载下 200 ms 超时抖动）；`sim-host` 的 permission-child 用例在**干净上游树里同样失败（10 个里 6 个失败）** |
| test/ui | 1334 / 1378，0 fail | 10 个上游新版大厅/房间界面的测试改为 `.pending`（见下） |
| test/lobby + net + ws-compression + skins | 除 2 条**预先存在**的失败外全绿 | ETag/`?v=` 与 healthz 的 `VERSIONS` 未定义在主分支同样失败 |
| eslint（public/js + server + shared） | 0 error / 93 warning | warning 全是未使用变量 |

### 合并过程中修掉的真实缺陷（不是测试问题）

1. `Match` 的 `pool` 现在是访问器（`get/set`）：赋值 `m.pool = new SharedPool(...)` 会同步替换 pool group 0 的池并重建
   `playerPools`，同时 `poolFor()` 在**只有一个池组**时直接返回 `this.pool`。上游的 ioleta/外部 AI 测试都靠替换
   `m.pool` 造场景，而本分支的 `ps.pool` 走池组——两边在此之前是撕裂的。
2. `phases.js` 的 `band` bot 决策 `valid()` 用的是上游的 `this._turnToken`，本分支的分组草稿从不递增它，导致
   **外部 AI 的 band 任务全部被判为失效、回复被丢弃**（36 个 match 测试失败的根因）。改用分组 token
   （`this.draft === d && token === g.token`）。
3. `spDraft.js` 的 bot 兜底原本直接调 `botPickCard`，绕过了所选策略的 `pickCard`——自定义策略/外部 AI 再也看不到选牌。
   改为 `this.bot.pickCard(...)`（`legacy` 解析到的就是它）。

### 明确未采纳的上游界面（`.pending`）

上游 0.3.3 重写了大厅与等待室（hub、选择模拟协议/选择同盟方式、rseat 立绘座位卡、版本切换与投票、「不限时」、成就卡、
大厅背景音乐，以及只针对它自己那套 CSS 的 `--sp-ui` 守卫）。本分支保留自己的大厅/房间界面（20 人席位、观战席、
D039 在线名单、S.W.E.E.P.、皮肤），因此这些测试被改名为 `test/ui/*.test.js.pending`（内容原样保留，随时可恢复）：

band-draft-badges · lobby-hub · match-topbar · picture-skins · seat-art · solo-unlimited · ui-leftovers-3533 ·
ui-size · version-icon-lookups · version-vote

**已知缺口（需要后续单独做的一轮）**：版本切换/投票、`soloUnlimited`、成就卡、大厅媒体这些**服务端已经支持**的能力，
当前客户端界面里没有入口；0.3.3 新增的美术（新干员 `char_109_fmout`、策略徽章等）也不在本分支的 `data/assets.json`
（那是用本分支自己的美术包生成的，缺少上游新增的 13 247 个键）——换美术包后用 `tools/build-data.mjs` 重新生成即可。
