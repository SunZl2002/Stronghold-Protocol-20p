# 2026-10-13 · 干员皮肤：把 fexli/ArknightsResource 的皮肤素材集成到 20 人版

## 目标与基线

| 项目 | 值 |
|---|---|
| 需求 | 把上游皮肤素材（`fexli/ArknightsResource`，`main`，`spine/` 根路径）集成到 20 人版 |
| 实现来源 | `Paper-Yuan/Stronghold-Protocol`（本地 `skin-zmd/Stronghold-Protocol`）的皮肤提交 `53d9e350`（实现）+ `0d155d8`（174 张头像） |
| 分支基线 | `capacity-20p` @ `e61a6398`（上游 v0.2.6 已合并、D036 已记录） |
| 共同祖先 | `bce18270` —— 皮肤分支与本分支的**分叉点在 1208 个提交之前**（皮肤基于 0.1.x，本分支已到 0.2.6） |
| 移植方式 | **按 `docs/SKINS.md` 的锚点逐个重放**；不 merge 那条 0.1.x 历史（会带入安卓客户端、Cloudflare Functions 等无关改动） |
| 交付提交 | `1d6e5456`（移植，33 文件 / +8820 −31）、`6c95470c`（记录）、`2c8cd379`（setup 集成） |

## 规模与三个来源提交

| 提交 | 内容 | 处置 |
|---|---|---|
| `53d9e350` | **实现主体**：174 款皮肤、头像、调配面板皮肤页、协议/服务端/渲染全链路 | 按锚点重放到 0.2.6 |
| `0d155d8` | 只加 174 张皮肤头像 PNG（10.3 MB） | 直接取文件 → `public/assets/char/skin_avatar/` |
| `4eda786` | 只改 Cloudflare `functions/assets/[[path]].js` | **与 20 人版无关，跳过** |

`docs/SKINS.md` 本身就是为「上游发版后重新应用」写的（原话：*the handful of edits to existing ones are listed
below line by line so they can be re-applied after merging an upstream release*）。我核对了它列的 **12 组锚点，
在 0.2.6 上全部还在** —— 但**只有 12 个文件级锚点，实际有 15 个既有文件需要改**：文档漏了
`public/js/ui/loadoutModel.js`（皮肤要参与调配的导出/导入），以及 20p 重构后 `renderInfo` 搬到了 `render/app/info.js`。

## 改动清单（最终 33 文件）

### 新增（11 个文件 + 174 张头像）

| 文件 | 作用 |
|---|---|
| `data/skins.json` | 客户端读的皮肤目录（`chars` → 115 干员 / 174 款，**不含 URL**） |
| `docs/research/08-skins.json` | 静态研究表（含 fexli / Kengxxiao / yuanyan3060 三个来源的 URL） |
| `public/js/ui/skins.js` | 皮肤状态 + `room.skins` 同步（对齐 `ui/loadoutSync.js`） |
| `public/js/ui/skinPicker.js` | 「干员调配」里的皮肤页（自包含） |
| `docs/SKINS.md` | 功能与移植文档 |
| `tools/fetch-skin-spines.mjs` | 从 jsDelivr 拉皮肤骨骼（1044 个文件；**已存在则跳过 ⇒ 可续传**） |
| `tools/fetch-skin-avatars.mjs` | 拉皮肤头像 |
| `tools/inject-skins-assets.mjs` | 把已落地的皮肤写入 `data/assets.json` |
| `tools/build-skins.mjs` | 研究表 → `data/skins.json` |
| `test/skins.test.js` | 皮肤查找 / 校验 / 导入导出 |
| `data/skins-installed.json` | 已装皮肤清单（当前 174 条 = 全量内置） |

跳过了皮肤仓库里与皮肤无关的附带文件（`android/**`、`release_notes_*`、`docs/LAUNCHER-COMPAT.md`、
`docs/START-MODES-PLAN.md`、`SKINS-BUILTIN-PLAN.md`、`tools/fetch-bilingual-voices.mjs`）。

### 既有文件（15 个）

| 文件 | 改什么 |
|---|---|
| `shared/protocol.js` | `SKIN_LIMITS` / `isSkinId` / `isSkinSelection`；C2S 加 `room.skins` |
| `server/net.js` | `Session.skins`；`HEAVY_TYPES` 加 `room.skins` |
| `server/lobby.js` | `freezeSkins()`；`room.skins` 分发与处理器；session → seat → `new Match()` 传参 |
| `server/match/PlayerState.js` | 构造器读 `seat.skins` |
| `server/match/player/basics.js` | `setSkins()`（与 `setLoadout` 同一道门） |
| `server/match/player/round.js` | `battleInput()` 给 `u.skin` |
| `server/match/player/views.js` | `pieceView()` 带 `skin` |
| `server/match/match/platform.js` | `Match.setSkins()`（**无阶段门**，`markPublic`） |
| `server/match/match/views.js` | `publicView().players[]` 带 `skins`（**空则不带**） |
| `server/sim/snapshot.js` | `unitInfo()` 加 `skin: u.skin ?? undefined` |
| `public/js/assets.js` | `spineEntry` / `avatarUrl` / `hasBackSpine` 支持 `opts.skin` |
| `public/js/render/units.js` | `_loadSpine` / `_loadPicture` / `_wantsBack` 传 `skin` |
| `public/js/render/app/info.js` | `renderInfo()` 加 `info.skin` |
| `public/js/render/app.js` | `pieceInfo()` 解析皮肤 + `sig` 含 `skin` |
| `public/js/screens/loadout.js` | import + `<${SkinSection} chess=${chess} />`（两行） |
| `public/js/data.js` / `ui/gameComponents.js` | `DATA_FILES` / `GAME_FILES` 登记 `skins` |
| `public/js/ui/loadoutModel.js` | `sanitizeSkins` / `mergeSkins`；`exportPayload` / `parseImport` 带 `skins` |
| `public/css/screens/loadout.css` | `.lo-skin*` 样式（99 行，只取皮肤块） |

## 关键判断与取舍

1. **只取皮肤相关的改动。** `53d9e350` 把皮肤与一批 0.1.x 的无关改动（安卓黑屏修复、触摸方向轮、
   攻击目标追踪 `lastTargetId` / `finishAttack`、初始部署不播特效、`Img` 的 `loading` 属性）混在同一提交里。
   我逐块甄别，**只重放皮肤部分**；上面那些一律不带。
2. **`unitInfo` 必须是 `undefined` 而不是 `null`。** `JSON.stringify` 会丢掉 `undefined`，
   所以没穿皮肤的单位**逐字节等于改动前**，DESIGN §8.2 的线格式契约与 v1 指纹都不受影响。
3. **`m.public.players[].skins` 空则不带**：20 人房 8 Hz 广播下，没皮肤的玩家不产生任何额外载荷。
4. **皮肤选择按 chess id 存，目录与清单按 operator id 存**（`docs/SKINS.md` 点名的静默失败点：
   混用会让选择器空白、`setSkins` 丢掉所有条目）。我因此把 `char_199_yak`（operator）与
   `chess_char_1_02_a`（chess）在验证里明确区分开。
5. **协议走 JSON 回退，不动 v1 位置表**（D021）：`test/wire-codec.test.js` 的 `V1_JSON_FALLBACK.c2s`
   加上 `room.skins`，指纹 `ea41ddd2…` 未变。
6. **注入脚本沿用干员原皮的动作数据**（`anims`/`animations`/`hits`/`bounds`），不走
   `tools/assets/spine.mjs` 的离线管线。这是它最可疑的假设，所以我**先离线验证再批量**（见下）。

## 验证结果

| 项目 | 结果 |
|---|---|
| 闸门 1 · 金标准（上游基准、**未 update**） | **9/9 通过** —— 皮肤没有动 1–4 人玩法 |
| 闸门 2 · 20 人容量与分组库存回归 | **294/294 通过** |
| 闸门 3 · 版本一致性 / 发布接线 | **6/6 通过** |
| `test/skins.test.js` | **6/6 通过**（含 20 席紧凑载荷契约） |
| 相关回归（lobby / wire-codec / loadout UI 等） | **107/107 通过** |
| `test/wire-codec.test.js` | 15/15，**v1 指纹未变** |
| `npx eslint`（全部改动文件） | **0 errors**（7 warnings，均为改动前既有风格项） |
| `node tools/check-imports.mjs` | 3 个既有 note，**0 新增违规** |
| `node tools/i18n.mjs check --strict` | **1379/1379（100%）**，0 missing / 0 errors |
| 全量 `node --test` | **9 项失败**，全部逐条归因（见下）：7 项为既有失败或本机素材不全，2 项是「素材只有一部分」触发的条件检查 |

### 全量套件的 9 项失败逐条归因

皮肤移植后全量套件从 5 项变成 9 项，**每一项都查清了**，没有一项是移植缺陷：

| 失败 | 归因 |
|---|---|
| `consume-on-equip built-ins`、`real-time co-op over websockets`、`all/sample verification lets an unrelated real timer run`、`performance: heavy 2-player boss field < 0.5 ms/tick`、`84 compact sockets … 0.8 Mbps` | **既有**：v0.2.6 合并后就有（绝对毫秒阈值 + 并发挤压，单独跑通过） |
| `packaged copies of the shipped docs …` | **既有**：`test/package-player.test.js`，在 `e61a6398` 上同样失败 |
| `the committed data/assets.json lists every 自选 operator's …`、`generated manifest data/assets.json` | **本机素材只有一部分**：这两条属 `test/assets.test.js`，其磁盘检查**条件执行**。本机此前没有 `public/assets` ⇒ 一直 skip；皮肤模型落地后开始执行，而基础素材缺 10963/11140。**实验证明**：临时移开 `public/assets`，该文件回到 **45 pass / 9 skipped / 0 fail**，与移植前逐项相同 |

移植过程中**真正由我引入、并且已修**的失败共 4 项：`test/package.test.js`（3 处硬编码清单/计数，
打包守卫抓出来的）、`test/ui/standin-ui.test.js`（钉死了视图 `sig` 模板，而我把 `skin` 加进了它）、
`node tools/i18n.mjs check --strict`（皮肤选择器的 8 处中文没包 `t()`）。

### 一、离线验证「皮肤骨骼能与原皮共用动作数据」（批量前的关键闸门）

用 20 人版自己的骨骼解析器（`tools/assets/skel.mjs`，即客户端同款 `@pixi-spine/runtime-3.8`）+
`resolveRoles()` 对 **4 款皮肤 / 8 个模型**（原皮与皮肤各一）做对照：

| 干员 / 皮肤 | 原皮动画 | 皮肤动画 | 解析出的角色 | 缺失图集区域 |
|---|---|---|---|---|
| `char_199_yak` / `_summer_1` | Attack, Default, Die, Idle, Start | **完全相同** | **完全相同** | 无 |
| `char_102_texas` / `_winter_1` | Attack_End/Loop/Start, Default, Die, Idle, Skill, Start | **完全相同** | **完全相同** | 无 |
| `char_183_skgoat` / `_epoque_30` | Attack, Default, Die, Idle, **Skill_Begin/End/Loop**, Start | 多了一个 `Skill`（时长 0.2） | idle/deploy/attack/die **相同**；skill 循环名从 `Skill_Loop` 变 `Skill`，**但角色语义一致** | 无 |
| `char_306_leizi` / `_game_3` | Attack, Default, Die, Idle, Start | 相同（Idle 时长 2→3） | **完全相同** | 无 |

**结论**：注入脚本「沿用原皮 `anims`」的假设成立 —— `resolveRoles()` 每次都给出一致的角色解析，
`missingRegions` 全为空（图集与骨骼配对正确），**唯一的差异是 `bounds`**（皮肤美术更大），
而 `bounds` 本来就从原皮沿用、只影响占位框。`char_183_skgoat` 这一例还证明解析器能跨过命名差异。

### 二、真实 WebSocket 端到端（起真服务器）

| 断言 | 结果 |
|---|---|
| `room.skins` 在**等候房**被接受（返回 `ok`） | 通过 |
| 非法 skinId 被协议层拒绝（`BAD_MSG` / `bad field skins`） | 通过 |
| `m.public.players[].skins` 带上皮肤（**公开：队友可见**） | 通过 |
| 没皮肤的玩家**完全不带** `skins` 字段 | 通过 |
| **对局进行中**改皮肤同样生效（无阶段门） | 通过 |
| 清空后 `m.public` 里该字段消失 | 通过 |

> 过程中被自己的测试误导了三次，记录下来免得下次再踩：① `ok { rid }` **只在请求带 `rid` 时才回**，
> 「没有响应」其实是成功；② 对局广播是**紧凑数组帧**，必须先过 `decodeWire(raw,'s2c')` 才能看 `m.public`；
> ③ **值没变则不广播**（我只把同一个皮肤重发一次，服务器正确地什么都没发）。
> 另外第一次把 `char_199_yak`（operator id）当 chess id 用，被 `freezeSkins` 正确丢弃 —— 正是文档警告的那个坑。

### 三、真实注入脚本

手工从 jsdelivr 落地 1 款皮肤的 Front 骨骼（skel 78718 B + atlas 8528 B；png 那次 `ECONNRESET`），
然后跑真正的 `tools/inject-skins-assets.mjs`：

```
✔ 成功向 data/assets.json 注入 115 名干员的共 174 套皮肤资产条目。
```

- `chars['char_199_yak'].skins['char_199_yak@summer#1']` **含 `spine`**（只有它的模型在磁盘上），
  且 `anims` 正确继承原皮。
- 174 条**全部**带 `avatar`。
- `stats.skins = 174`、`stats.charsWithSkins = 115`。
- 注入后金标准仍 **9/9**。

后续 `tools/fetch-skin-spines.mjs` 已在后台启动拉取全部 1044 个骨骼文件（脚本对已存在文件跳过 ⇒ 可续传），
完成后需**重跑一次注入**，把其余 173 款的 `spine` 字段写入。

### 四、全量素材下载与最终注入（已完成）

`tools/fetch-skin-spines.mjs` 跑了两遍（第二遍补上第一遍失败的文件；脚本对已存在文件跳过 ⇒ 可续传）：

```
第一遍: 新下载 988, 已存在 2, 失败 54
第二遍: 新下载  32, 已存在 990, 失败 22
```

| 指标 | 结果 |
|---|---|
| 磁盘上的骨骼 / 图集 / 贴图 | 340 / 341 / 341 个文件，**164.2 MB** |
| **Front 三件齐全的皮肤** | **171 / 174** |
| Back 需要且齐全 | 169 / 174 |
| 注入后带 `spine` 的条目 | **171**（其中含 Back 的 168 条） |
| 带 `avatar` 的条目 | **174 / 174** |

**剩下 3 款在源头就缺文件**：`char_4087_ines@boc#8`、`char_1012_skadi2@boc#4`、
`char_1012_skadi2@iteration#2` —— 两遍下载、1044 个文件槽位之后仍然拿不到它们的 Front。
它们走**文档写明的优雅回退**：头像与选择器入口正常，单位用干员自己的模型。
这是数据源的限制，不是本分支的缺陷。

### 五、对着**真实注入后的清单**做最终端到端（最强的一次验证）

前一次端到端用的是临时写进清单的合成皮肤；这一次清单由注入器从**真实 fexli 模型**生成，
清单里没有手写内容：

| 断言 | 结果 |
|---|---|
| `spineEntry(charId, {skin})` 解析出**真实皮肤模型路径** | 通过 |
| 皮肤模型路径与原皮**不同** | 通过 |
| 皮肤条目**保留原皮模型作为 fallback**（模型缺文件时优雅降级） | 通过 |
| `avatarUrl` 解析出真实皮肤头像 | 通过 |
| 没穿皮肤的干员仍解析到自己的模型 | 通过 |
| 起真服务器 + 真清单，`room.skins` 在对局中生效 | 通过 |
| `m.public.players[].skins` 带上真实皮肤 | 通过 |

（顺带又踩了一次文档点名的坑：清单与解析器都按 **operator id** 索引，不是 chess id —— 我第一次传了
chess id，四条断言全红。这正好印证了「混用是静默失败点」这条警告。）


## 素材状态

**源码合并完成 ≠ 素材更新完成。**

### 皮肤素材已经接进 setup（提交 `2c8cd379`）

皮肤模型（~190 MB）**不属于**基础素材下载，所以一台「基础素材已完整」的机器可能一个皮肤都没有，
而且没有任何提示。因此把它做成了正式的 setup 步骤：

- `tools/setup.mjs`：新增 `checkSkins()` 与皮肤下载阶段（排在基础素材之后），以及 `--no-skins`；
  `--check` 只报告模型/头像数量、**不下载**。
- `package.json`：`npm run assets:skins`（头像 + 模型 + 注入）与 `assets:skins:inject`。
- **因为 setup 会启动这些工具，它们必须随发布包发出**：`PLAYER_TOOLS` 加入三个皮肤工具、
  `RUNTIME_RESEARCH` 加入 `docs/research/08-skins.json`（`fetch-skin-avatars.mjs` 要读它）、
  `PLAYER_NPM_SCRIPTS` 加入两条脚本。**这是打包守卫抓出来的**（它断言 setup 启动的每个工具都必须 ship），
  不是我事后补的。
- 相应更新了两个打包 fixture 与期望（保留文件数 37 → **41**）。
- 玩家侧现在只要 `npm run setup`（或 `npm run assets:skins`）就能补齐皮肤素材。

- `public/assets/**` **不进 Git**（`.gitignore:10` 的 `public/assets/` 规则），所以：
  - **174 款皮肤的骨骼模型**（约 190 MB）只在本地安装目录，**新克隆必须自己跑 `tools/fetch-skin-spines.mjs`**；
  - **174 张皮肤头像**（10.3 MB）**同样没有进本仓库的 Git**（我确认过：`git ls-files public/assets/char/skin_avatar`
    为 0；皮肤仓库是把它们提交进 Git 的，但本仓库的 `.gitignore` 把整个 `public/assets/` 排除了，
    所以那套做法在这里不生效）。它们现在**只存在于本机工作区，且不会被提交**。
- **`data/assets.json` 进了 Git**：174 条皮肤条目 / 115 个干员的**元数据**（名称、系列、头像路径，
  以及唯一的 1 条带 `spine` 的试点条目）已随本次提交落地，`stats.skins = 174`。
  也就是说：**目录与选择器在任何克隆上都能工作，但美术文件需要各自补齐**。
- `data/assets.json` 是 `tools/fetch-assets.mjs` 的**生成物**，注入会写 `chars[].skins`。
  **以后重跑素材更新可能覆盖掉 `skins` 字段** —— 更新素材后要重跑 `tools/inject-skins-assets.mjs`。
- 皮肤模型来源：`fexli/ArknightsResource@main`，经 `cdn.jsdelivr.net/gh/...`（原版 `raw.githubusercontent.com`
  在大陆直连常失败；皮肤仓库自带 jsdelivr 回退，我沿用）。

## 部署状态

**未部署。** 仅在本地整合仓库完成移植、素材落地与验证；未构建镜像、未重启任何服务器。

**已推送到远程**：`origin/capacity-20p` = `beff5b37`…`0e4433e0`（共 12 个提交，
相对 `e61a6398` 为 **45 文件 / +9260 −55**）。`v0.2.6-20p` 标签**故意未移动**，仍指向 `9d6d5c46`。
`APP_VERSION` 仍是 `0.2.6` —— 是否切 0.2.7 由你定。

## 收尾判定（2026-10-13）

目标的三个部分**都已完成**：

1. **集成**：`shared/protocol.js` → `server/net.js` → `server/lobby.js` → `server/match/*` →
   `server/sim/snapshot.js` → 客户端渲染三件套 → 调配面板皮肤页，全链路打通；
   协议走 JSON 回退，不动 v1 位置表与指纹（D021）。
2. **验证**：三闸门（金标准 9/9 上游基准、容量 294/294、版本 6/6）、皮肤 6/6、
   真实 WebSocket 端到端（含**真实注入清单**）、离线骨骼角色解析（4 款皮肤 / 8 个模型）、
   打包 13/13、i18n 1379/1379、eslint 0 errors；全量套件的 9 项失败已逐条归因，**没有一项是移植缺陷**。
3. **记录**：本文件 + `docs/SKINS.md` + `CHANGELOG.md` 的「未发布」段。

**素材状态**：174 条皮肤条目、**171 条带真实模型**（164.2 MB 已落地）、174 张头像；
剩余 3 款在源头 fexli 仓库就缺文件。

**保留的已知限制**（都不阻塞目标，且都已写明复现/补齐方式）：
本机未做浏览器渲染验证（无 Chrome、基础素材缺 10963/11140）；`docs/SKINS.md` 描述的按需安装队列
在任何分支上都不存在（需你决定补实现还是改文档）；三款源缺皮肤走优雅回退。

## 未完成事项

1. **皮肤模型已全量落地并注入**（171/174 带 `spine`，见上）。剩下 3 款在**源头**缺文件，
   重跑下载也拿不到；它们会回退到干员原皮外观，选择器里仍有条目与头像。
   **若将来 fexli 仓库补上这三款**，重跑 `node tools/fetch-skin-spines.mjs` 再
   `npm run assets:skins:inject` 即可纳入。
2. **美术文件都不进 Git**（头像与模型都在 `public/assets/` 下并被忽略）。新机器部署后：
   皮肤目录可用、选择器可点，但**头像会回退到原皮、单位仍是原皮外观**，直到跑过
   `npm run assets:skins`（现在这条已接入 setup）。是否要改素材目录布局让头像进 Git，
   属于取舍，需要用户决定，我不擅自改。
3. **渲染未在真实浏览器里验证**：本机没有 Chrome、也没有基础素材（`public/assets` 为空），
   所以「皮肤模型在画面上正确显示」只做到了离线骨骼/角色解析与 `spineEntry` 的单元级验证，
   未做 `RENDER_E2E=1`。**上线前应在有素材的机器上跑一次**。
4. `docs/SKINS.md` 描述的 `tools/install-skins.mjs` 与 `server/skinInstall.js`（按需安装队列）
   **在皮肤仓库的三个分支上都不存在** —— 实际是「全量内置」。文档已随文件带来，但这两处描述与代码不符，
   我**没有**照文档去实现未存在的东西；后续要么补实现、要么把文档改成与代码一致（待定）。
5. 皮肤对 `m.public` 的载荷增量未测（20 人房 8 Hz）。空皮肤不带字段 ⇒ 无皮肤玩家零成本；
   但**全员带皮肤**时的增量应补一次测量，确认不破坏 `test/wire-pressure.test.js`（84 连接 / 0.8 Mbps）。
   → **已补测并钉进测试**（`test/skins.test.js` 的「20 席 m.public 的皮肤载荷」一例，提交 `eab2dd5c`）：
   - 20 席全部带皮肤，皮肤 id 与 **chess 键**都经紧凑 v1 编解码往返一致；
   - 无皮肤的房间**逐字节等于**没有该字段时的帧（真实断言，不是目测）；
   - 实测增量：**+1120 B / 次广播**（1581 → 2701 B）≈ 每连接 **+72 kbit/s**，
     28 条连接（20 真人 + 8 观战）@8 Hz ≈ **+0.25 Mbit/s** —— 在 `test/wire-pressure.test.js`
     已经覆盖的 0.8 Mbps 预算之内（该测试的单连接基线约 27 kbps，加了皮肤仍有余量）。
   - 测试断言增量 **< 3 KB**，将来若有人把载荷写肥会立刻可见。
6. `test/package-player.test.js` 有 **1 个既有失败**（`docs/ANNOUNCEMENTS.md` 的
   `assets/banner.png` 源链接检查）。已用 worktree 证明它**在皮肤移植之前（`e61a6398`）就以同样方式失败**，
   与本次工作无关，未修。
7. **`test/assets.test.js` 的 2 条失败是本机「素材只有一部分」造成的，不是移植缺陷。**
   该文件的磁盘检查是**条件执行**的（`public/assets` 存在才跑）；本机此前**根本没有**该目录，
   所以它们一直是 skip。皮肤模型落地后它们开始执行，而本机**缺基础素材**
   （`setup --check` 报 `美术/音频 缺 10963/11140`），于是报缺头像/立绘/技能图标/BGM。
   已用实验证明：把 `public/assets` 临时移开，`assets.test.js` 回到 **45 pass / 9 skipped / 0 fail**
   —— 与皮肤移植之前**逐项相同**。**装齐素材的机器上这些检查应当通过。**

## 后续补充

（按日期追加后续证据或链接。）
