# 跟随原版更新：20 人版的长期同步手册

本文件回答一个问题：**原版更新后，怎么把它合进来，同时保证 20 人版的特性不被覆盖、也不被静默改坏。**

配套文件：
- [DECISIONS.md](DECISIONS.md) — 分支决定表（D001–D032）。**冲突的最终裁判。**
- [UPSTREAM.md](UPSTREAM.md) — 原作者维护者留下的同步流程与素材更新说明（仍然有效，请一并遵守）。
- [../PLAYER_CAPACITY.md](../PLAYER_CAPACITY.md) — 20 人玩法规则（人数、分组、卡池、联防、领袖）。
- [../OPERATIONS_20P.md](../OPERATIONS_20P.md) — 开服与运维。

---

## 1. 为什么"不会被覆盖"不能靠 git 自动保证

先把话说清楚：**git 不会替你保护分支特性。** 一个长期分支跟上游同步，永远存在两种风险：

| 风险 | 表现 | 靠什么防住 |
|---|---|---|
| **文本冲突** | 双方改同一片代码，git 报 conflict，需要人工裁决 | 决定表 + 逐条记录（§5） |
| **语义冲突**（更危险） | 双方改**不同**位置、git 自动合并成功，但合并结果自相矛盾 | **守卫检查 + 测试**（§4） |

第二次合并（0.2.5）里就真实出现过语义冲突：上游新增的代码引用了 `Match.itemPool`（全房唯一池），
而 20 人版已经把它换成**每个固定组一个池**（D029）。git 看到的是两处不相邻的改动，
**自动合并成功、没有任何冲突标记**，但结果是运行时空引用——2 人局每局多出 3–6 条引擎错误。
这类问题只能靠测试发现，`git status` 永远是干净的。

**所以本仓库的保护是三层：决定表（写清楚要什么）+ 守卫测试（钉住不许变）+ 金标准（证明 1–4 人没被改坏）。**

---

## 2. 一次性准备：两个远程

整合仓库里配了两个远程，含义不同，**不要混用**：

```bash
git remote -v
# origin    <你的 fork>                       ← 你推送的地方
# upstream  https://github.com/sganggs/Stronghold-Protocol.git   ← 原版作者
```

当前分支：`capacity-20p`（= 20 人版主线 + 已合并的原版更新）。历史上游 `master` 保持不动。

若 `upstream` 没配或要换地址：

```bash
git remote add upstream https://github.com/sganggs/Stronghold-Protocol.git
# 或先指向本地已 clone 的原版仓库（离线/网络受限时）
git remote set-url upstream /path/to/Stronghold-Protocol
```

同步用的隔离工作目录（可选，但推荐——避免在正在服务的目录里解冲突）：

```bash
git worktree add ../20p-merge capacity-20p
```

---

## 3. 每次原版发版的固定流程

### 步骤 1 · 抓取并确认基线

```bash
git fetch upstream --tags
git log --oneline -1 upstream/master         # 记下完整 SHA
git describe --tags upstream/master          # 期望形如 v0.2.6
```

把这四件事写进本次记录（`docs/development/records/`，模板见 [templates/record.md](templates/record.md)）：
目标版本、上游 SHA、当前分支 HEAD、工作区是否干净。

> 作者仓库在 `package.json` 里登记为 `sganggs/Stronghold-Protocol`；`origin` 是你自己的 fork。
> **不要用 fork 的 `origin/master` 当作"作者最新 master"的证据。**

### 步骤 2 · 先看碰撞面有多大（不写任何东西）

```bash
# 双方各自改了什么
git diff --name-only $(git merge-base HEAD upstream/master) HEAD              > /tmp/mine.txt
git diff --name-only $(git merge-base HEAD upstream/master) upstream/master   > /tmp/theirs.txt

# 交集 = 需要人工确认的文件
comm -12 <(sort /tmp/mine.txt) <(sort /tmp/theirs.txt)
```

再干跑一次合并，看真实冲突文件（**不落地**）：

```bash
git merge-tree --write-tree --name-only HEAD upstream/master
# 输出第一行是结果树，其后每行一个冲突文件；exit 1 表示有冲突
```

### 步骤 3 · 真合并

```bash
git switch capacity-20p
git merge --no-ff upstream/master -m "merge upstream vX.Y.Z into the 20-player capacity branch"
git diff --name-only --diff-filter=U        # 冲突文件清单
```

### 步骤 4 · 解冲突：**逐条对照决定表，禁止整文件 ours/theirs**

对每个冲突：

1. 看清**上游改了什么**（`git diff <base> upstream/master -- <file>`）；
2. 看清**我们要什么**（查 [DECISIONS.md](DECISIONS.md) 与 [UPSTREAM.md](UPSTREAM.md) 的能力核对表）；
3. 写出**结合体**，并在代码注释里留一句为什么；
4. 记进本次 record：「上游改了什么 / 我们需要什么 / 最终怎么结合 / 如何验证」。

**绝不允许** `git checkout --ours <file>` 或 `--theirs <file>` 一把梭——那正是"20 人特性被原版覆盖"
或"原版修复被丢掉"的唯一成因。历史上游文档明确禁止这种做法。

**能力核对表**（来自 [UPSTREAM.md](UPSTREAM.md)，按你要动的区域查）：

| 分支能力 | 优先核对的实现入口 | 保留的边界 |
|---|---|---|
| 房间与协议容量 | `server/lobby.js`、`shared/playerCapacity.js`、`shared/protocol.js`、房间 UI | 20 人座位、每组轮选请求及阶段标识、空位不计人数 |
| 卡池与信标 | `server/match/pool.js`、`player/basics.js`、`effectsMeta.js` | D010 固定分组、D028 数量基准；三人不缩减，五人 III 阶向下取整、其他向上 |
| 装备库存 | `Match.itemPoolFor`、`pool.js`、`player/acquire.js`、`match/spDraft.js`、`invariants.js` | D029 按固定组共享；**逐组守恒校验不能退回全局池** |
| 机变与真人优先 | `choices.js`、`match/phases.js`、`match/spDraft.js`、轮选 UI | D012 每组独立六张、组间并行；D004 组内真人优先 |
| 联防与投票 | `server/match/unite.js`、`match/unitePhase.js`、`ui/hud.js` | D013 轮数上限 = 组数、逐轮真人多数票、本轮打完再取消后续 |
| 领袖及两端战斗 | `gamedata.js`、`finalAssault.js`、`server/sim/`、`public/js/battle/runner.js` | 按人数共享血池、无人机 2% 机制、普通限伤保留 |
| 审计与界面 | `match/audit.js`、`tools/matchrun.mjs`、队伍栏与表情 UI | 扩容事件可回放审计 |
| 公告与紧急通知 | `server/index.js`、`http/routes.js`、`announcements.js`、`announcementNotices.js`、`public/js/main.js` | D014/D015 普通发布不打断对局、图片仅限公告目录 |
| 个人选择及战绩 | `match/intents.js`、`match/spDraft.js`、`ui/choiceOverlay.js`、`ui/stats.js` | 个人 `choiceId` 与公共 `draftId/groupId` 不串用 |
| 开局重刷 | `match/setupVote.js`、`match/platform.js`、`ui/setupReroll.js` | D018 全体真人一致同意；重建**全部**固定组 |
| 素材预缓存 | `assetCacheCatalog.js`、`http/assetCache.js`、`public/js/assetCache.js`、`asset-cache-sw.js` | D016/D023/D025/D031 按哈希补缺、单缓存 SW |
| 大厅目录及身份恢复 | `lobbyDiscovery.js`、`server/lobby.js`、`ui/lobbyDiscovery.js`、`public/js/net.js` | D017/D032 实际空席匹配、仅大厅订阅 |
| 紧凑编码与模块缓存 | `shared/wireCodec.js`、`public/js/runtime.js`、渲染加载器 | D021 v1 布局不重排，新字段放扩展位 |

> **已知的历史教训**：上游 v0.2.2 的「AI 队友最后选择」开关在本分支被固定为**开**（D004）。
> 合并时**不得**用该开关关掉既定优先规则。

### 步骤 5 · 专门检查"语义冲突"（本步最容易漏，务必做）

合并没有冲突标记 ≠ 合并正确。至少做这三项：

```bash
# 5a. 上游新增代码有没有引用分支已删掉的旧 API？
#     典型：Match.itemPool（已拆成每组一个池）、Match.pool（同上）、humansFirst()（已删）
git grep -n "m\.itemPool\b\|this\.itemPool\b" -- server public
git grep -n "humansFirst" -- server public

# 5b. 上游新加的符号，分支里是否真的存在？
for s in <上游本次新增的导出函数名>; do git grep -l --fixed-strings "$s" -- server shared public; done

# 5c. 上游新增的协议消息类型，分支是否登记了？
git diff $(git merge-base HEAD@{1} HEAD) upstream/master -- shared/protocol.js
node --test test/wire-codec.test.js     # 未登记的 C2S/S2C 会在这里报错
```

**判据**：对上游本次新增/改名的每个公共 API，确认合并结果里**调用点与定义点一致**。
`Match.itemPool` 这类"兼容 getter 还在、所以不报错、但只指向第 1 组"的情况最隐蔽——
它不会崩，只会**悄悄算错**。

### 步骤 6 · 跑验证（§4）

### 步骤 7 · 提交并记录

```bash
git add -A && git commit          # 用步骤 3 的 merge 提交，或补一个"适配"提交
```

在 `docs/development/records/YYYY-MM-DD-NN-upstream-vX.Y.Z.md` 记录：
合并 SHA、冲突清单与解法、语义冲突、验证结果（贴测试汇总行）、golden 变化场景与原因、
素材状态（源码合并 ≠ 素材更新）、是否有未完成事项。

**功能提交、素材状态、部署状态分开写**；`未部署` 就写未部署，不要把本地提交当成已上线。

---

## 4. 验证：三道闸门

### 闸门 1 · 金标准（最重要，证明 1–4 人玩法没被改坏）

```bash
node --test test/golden.test.js              # 快速子集
GOLDEN_FULL=1 node --test test/golden.test.js # 全量语料，约 20 s
```

**为什么这是关键**：`test/golden/*.json` 是**上游的**基准文件，20 人版从未修改过它们
（逐字节等于上游 v0.2.4，合并后等于 v0.2.5）。语料覆盖单人、2/3/4 人合作、每个干员、
每个羁绊、每个战场、每场领袖战。

- **通过** = 20 人改动的生效阈值在 6 人以上，**1–4 人玩法与上游逐位一致**。
- **不通过** = 有改动泄漏到了小房间。先按 `test/golden/README.md` 判断：
  上游自己的数值改动会移动场景（本次 0.2.5 移动了 66/287 个），那属**预期**；
  但**只有你解冲突的那几个文件导致的移动才是问题**。
- **`npm run golden:update` 是最后手段，不是第一步。** 必须先能把每个移动的场景解释到具体行为，
  再决定是否更新；不能"为了变绿直接覆盖"。

### 闸门 2 · 20 人容量回归

```bash
node --test test/lobby-capacity.test.js test/match/player-capacity.test.js \
  test/match/draft-capacity.test.js test/match/unite-capacity.test.js \
  test/match/unite-vote.test.js test/match/group-drafts.test.js \
  test/match/group-draft-generation.test.js test/match/group-draft-audit.test.js \
  test/match/group-stock.test.js test/match/group-unite-rounds.test.js \
  test/match/group-unite-audit.test.js test/ui/group-drafts.test.js \
  test/ui/group-draft-views.test.js test/ui/poolGroups.test.js \
  test/ui/unite-vote.test.js test/room-management.test.js \
  test/server-settings.test.js test/lobby-access.test.js
```

这组测试钉住的正是决定表的内容：`MAX_SEATS=20`、默认 8 席、分组表、
每组独立六张、组内真人优先、联防轮数=组数、逐组库存守恒、AI 上限。

### 闸门 3 · 全量 + 一致性

```bash
npm run ci          # node --test + 冒烟 + lint + imports + typecheck（CI 同款，不需要素材）
node tools/doctor.mjs
```

浏览器套件默认关闭（需要 Chrome）：
`SP_E2E=1`（UI）、`SP_REAL_E2E=1`（真实对局，需素材）、`RENDER_E2E=1`、`SIM_E2E=1`。

### 建议：把它固化成一条命令

把闸门 1+2+3 写进一个脚本（例如 `tools/verify-20p.sh`），每次同步只跑这一条。
**不要依赖"我记得要跑哪些测试"**——漏跑闸门 1 正是语义冲突流到线上的方式。

---

## 5. 冲突出现时怎么裁决

按这个顺序找答案，**不要凭感觉**：

1. **决定表** [DECISIONS.md](DECISIONS.md)：D001–D032 覆盖了容量、分组、卡池、装备库存、
   轮选、联防、领袖、公告、素材缓存、大厅、协议、AI 上限、聊天、匹配开关等全部已确认取舍。
   新决定追加编号，旧决定标「被替代」并保留理由，**不要改旧决定的正文**。
2. **能力核对表** [UPSTREAM.md](UPSTREAM.md) §2。
3. **设计文档** [../PLAYER_CAPACITY.md](../PLAYER_CAPACITY.md)（人数规则表、卡池数量表、联防轮数表）。
4. 以上都没有 → 这是**新取舍**，属于玩家/服主决定：**先问，不要替用户决定**，
   定下来后新增一条决定（D0NN）再实现。

**必须保留的分支边界（绝不可让给上游）**

- `MAX_SEATS = 20` / `DEFAULT_SEATS = 8` / `ROOM_CAPACITIES = [4,8,10,16,20]` / `BASE_SEATS = 4`。
- 卡池按**开局占用座位**固定分组、**永不重新分组**（D010）。
- 所有玩家事务走**自己组的池**：`Match.poolFor(ps)` / `Match.itemPoolFor(ps)`（D028/D029）。
- `invariants.js` 的**逐组**守恒校验（全局合计会掩盖跨组返还 bug）。
- 组内手动真人优先、`aiPicksLast` 固定为开（D004）。
- 每机变各组独立六张、组间并行、卡池索引组内 0–5（D012）。
- 联防轮数上限 = 开局固定组数（D013）。
- 领袖血池 = `bloodPoint × 开战时存活人数`（上限 20），中途退出按百分比缩池（D009）。
- 紧凑协议 v1 **已发布的 ID/字段/枚举不重排**，新东西追加到扩展位（D021）。

**可以放心让给上游的**

- `server/sim/**` 的战斗/数值/干员实现（20 人版只碰过 3 处：`spec.js` 的结果帧与血池同步、
  `bosses.js` 的无人机标记、`content/garrisons/meta.js` 的一处旗标）。
- 所有敌人属性、波次组成、刷怪公式。**20 人版不按人数放大怪物数量**——
  一段战斗场的敌人数量只由回合决定，与实际人数无关（只有领袖血池随人数放大）。
- 界面文案、i18n、素材清单、CI、Dockerfile。

---

## 6. 素材同步（与源码分开做）

源码合并完成 **≠** 素材更新完成，两者要分开记录。

```bash
npm run setup                                   # 补齐清单要求的资源
node tools/setup.mjs --asset-source=mirror       # 直连不畅时
node tools/fetch-assets.mjs --add-only           # 已有素材较完整时优先（不会删条目）
```

- 上游有新增 **3D 战场场景** 时：完整整合包已含；源码方式见 [../OPERATIONS_20P.md](../OPERATIONS_20P.md) §4。
- `public/assets` 不进 Git，已有下载文件**不会**因同步被清空。
- **不要用 `--allow-shrink`** 去"修"旧索引或下载失败——那会删条目。
- 预缓存 ZIP 需要在源码目录用 `npm run assets:pack` 重新生成，并确认内容版本与服务器一致。

---

## 7. 历史合并的实测记录：作为下次的模板

### 7.1 第二次同步（0.2.6）——最近一次，优先参考

**基线**：分支 `6ec27f39`，分叉点 `cf7a9400` = 上游 `v0.2.5`；上游目标 `488db49f` = `v0.2.6`
（58 提交 / 93 文件，**没有新增协议消息类型**，**没有删除任何文件**）。

**规模**：上游改 93 文件，分支改 320 文件，**双方都改 29 个**；**13 个文件真冲突**。

**结果**：合并提交 `9937445e` + 适配提交 `7e01f2d8` / `317585e2` / `a656f28d`。

**本次真正的教训（比 0.2.5 那次更值得记住）**

1. **上游的新测试会钉住上游自己的常量**，而不是协议。0.2.6 的 `test/ws-compression.test.js`
   断言 `server_no_context_takeover`、`server_max_window_bits=WS_DEFLATE.…`、`threshold===1024`。
   本分支保留自己的 `WS_COMPRESSION` 时它必失败——**先量再改**，不要因为「测试红了」就换实现：
   实测 24 条 20 席 `m.public`（1.10 MB JSON）分支配置 76 KB（−93.1 %）、上游配置 242 KB（−78.1 %），
   而 `test/wire-pressure.test.js`（84 连接 / 0.8 Mbps）用分支配置通过、用上游配置失败。
   结论：**保留分支配置，适配测试**，并在测试与实现注释里写清依据。
2. **上游新代码可能假设调用方给全了参数**。0.2.6 的流量计数器写成 `if (health.traffic)`，
   没给 `health` 做可选链；本分支的 `test/runtime-http.test.js` 只装配静态服务，
   于是**每个请求都抛 TypeError**。这类缺陷 git 不会报冲突，只有跑到那个调用方才暴露。
3. **同名能力的「语义冲突」可能藏在解析细节里**。上游的 `q` 正则对 `q=bad` / `q=2` / `q=-1`
   **匹配失败**，于是权重保持默认 1——把「无效」读成了「最优先」。合并时统一成一个函数，
   但必须明确保留哪一套读法，并把它钉进测试表。
4. **新 fixture 会漏掉分支新增的文件**。上游的 `test/update-package.test.js` fake checkout 里
   没有分支的 `assets:pack` / `tools/asset-cache-pack.mjs`，`stageProblems` 直接报两条 PROBLEM。
   与上次修 `test/package.test.js` 同一取向：**把分支的 `PLAYER_TOOLS` 补进 fixture**，
   而不是放宽工具的校验。
5. **不要让 PowerShell 写这些文档**。用 `Set-Content` / `WriteAllLines` 往返 `docs/DESIGN.md`
   会把 `§` 变成 `鎼?`（GBK），**索引表 24 行全部失效**且 git diff 看起来「只是改了几行」。
   要改这类文档用 `edit` 工具或 Node 的 `fs.writeFileSync(f, s, 'utf8')`。
   本次的修复办法：拿上游干净文本重建被搞坏的表头/索引区，保留分支自己的段落。
6. **留意仓库外的因素：README 被加密**。本分支的 `README.md` 在某次提交里被本机加密软件
   就地加密（40959 字节二进制、文件头 `%TSD-Header-###%`），git 视为 binary 无法合并。
   恢复办法见 [本次记录](records/2026-10-13-01-upstream-v0.2.6-20p.md#readme-加密事件的恢复)：
   从**加密前的最后一个明文提交**（`cbe4c940`）取出分支自己的明文，再与 base / 上游做文本三方合并。
   同时建议把项目目录排除出该加密策略，否则每次提交都会重现。
7. **先确认依赖装好了**。这个克隆此前没有 `node_modules`，5 个容量回归文件直接
   `ERR_MODULE_NOT_FOUND: Cannot find package 'ws'`——那不是合并失败，是环境没装。先 `npm ci`。

**验证**：`node tools/verify-20p.mjs` 三道闸门**全部通过**；全量 golden 语料 9/9 且**未 update**
（`git diff upstream/master HEAD -- test/golden/` 为空）；容量回归 294/294；版本一致性 6/6。

### 7.2 第一次同步（0.2.5）

**基线**：20 人版 = `v0.2.4-20p.5fix`（`6a2b72bb`），分叉点 `bc50cac0` = 上游 `v0.2.4`；
上游目标 `cf7a9400` = `v0.2.5`（77 提交、221 文件）。

**规模**：上游改 221 文件，分支改 310 文件，**双方都改 54 个**。

**结果**：**8 个文件真冲突**，其余 46 个自动合并。

| # | 冲突文件 | 上游改了什么 | 我们改了什么 | 最终解法 |
|---|---|---|---|---|
| 1 | `shared/protocol.js` | 追加 `m.layer` | 追加 `m.emergency`/`m.chat`/`m.chatState` | 两边都留（追加型，无语义） |
| 2 | `server/match/gamedata.js` | 新增 `isUnlimitedGiftItem`（#488 固定赠品免库存） | 新增 `isTraitFixedItem`（同一集合） | **判定为同一条规则**，只留 `isUnlimitedGiftItem`，`isTraitFixedItem` 降为它的别名（保住 `noPool` 调用点） |
| 3 | `server/match/invariants.js` | 全局池 + `isUnlimitedGiftItem` | 逐组循环 + `isTraitFixedItem` | **保留逐组循环**（D029），谓词统一 |
| 4 | `server/match/player/acquire.js` | `requirePool` 参数、`m.itemPool` | `noPool` 标记（贯穿升级/合并）、`itemPoolFor` | 两个参数名都收，**统一走一个身份判定**；库存访问保留 `itemPoolFor`；`pushRewardOffer` 恢复上游的 `diyStockEntries`（0.2.5 #515 的本意） |
| 5 | `server/sim/content/garrisons/meta.js` | `requirePool:false` | `noPool` | 采用上游写法（同一规则的新名字） |
| 6 | `tools/package.mjs` | 新增 `PLAYER_MARKDOWN`/`GITHUB_REPO` | 玩家脚本加 `assets:pack` | 两边都留 |
| 7 | `docs/DESIGN.md` | 改写版本行（含 0.2.5） | 新增容量前言段 | 两边都留 |
| 8 | `public/i18n/ko.json` | +4 键、重译 49 个值 | +198 键 | 键取并集（1402 键，两边都不缺）；两边都改的 5 个键**采用上游译文** |

**修掉的语义冲突（git 没有报冲突）**

| 位置 | 现象 | 修法 |
|---|---|---|
| `server/match/player/acquire.js`、`server/match/match/views.js` | 上游新增代码引用已被拆掉的全局 `Match.itemPool`；`views.js` 的 flat `sp` 回退没有 `playerIds`，直接抛 `Cannot read properties of undefined`（2 人局每局 3–6 条引擎错误） | 改走 `itemPoolFor(...)`，flat 情形解析到第 1 组（等价于上游的全局池） |
| `server/match/player/acquire.js` `pushRewardOffer` | 合并取了分支的 `diyRollEntries`（受调度中心等级限制），与上游 0.2.5 #515 的意图相反 | 恢复 `diyStockEntries`；分支 `diy.js` 的注释本来就写明晋升奖励**不**用等级门 |

**验证结果**

- `test/golden.test.js`：**9/9 全通过**，使用**上游 0.2.5 自己的基准文件、未做任何 update**。
  → 1–4 人（单人、2/3/4 人合作）玩法与上游逐位一致。
- 容量与库存回归：**166/166 通过**。
- 版本一致性：`test/version.test.js` 6/6 通过（`APP_VERSION` 随上游升到 `0.2.5`；
  README 首行恢复为上游要求的 H1，20 人总结改到其下方并加了来源说明）。

**给下次的两条经验**（0.2.5 那次）

1. **先跑 `git merge-tree` 估规模**，再决定是一次合完还是分批；本次只有 8 个冲突，
   一次合完是对的。0.2.6 那次 13 个冲突，一次合完同样是对的。
2. **"没冲突"不等于"没问题"**：本次真正会造成线上错误的两处，git 一处都没报。
   **步骤 5（语义冲突检查）和闸门 1（golden）不能省。**

> 0.2.6 那次把第 2 条进一步坐实了：真正的缺陷（`health.traffic` 崩溃、`q` 解析分歧）
> 同样一个冲突标记都没有。**判据永远是「合并后是否出现在合并前没有的失败项」**——
> 完整套件的绝对失败数会骗人（本机合并前 123、合并后 28，两者都不是「干净」）。

---

## 8. 出问题时怎么回退

```bash
git switch capacity-20p
git log --oneline -5                 # 找到合并前的 HEAD
git reset --hard <合并前的 SHA>       # 本地回退（未推送时）
git revert -m 1 <merge提交>          # 已推送、想保留历史时
```

线上：重新构建并切回上一个可用镜像/版本；**`runtime/` 目录不要删**（公告与服主配置在里面）。
多人服务器正在使用时，先记录当前部署版本、时间、是否重启、已有房间如何处理，再动手。
