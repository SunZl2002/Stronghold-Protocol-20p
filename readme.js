/**
 *	加密环境下 使用 本文件向外界传达本次修改内容 和todo
 *
 *	为什么有这个文件：本机的加密环境会改写 .md / .txt 一类文本文件，所以 docs/ 下的文档
 *	（DECISIONS.md、development/README.md 等）不能在这台机器上安全编辑。这个 .js 文件不受影响，
 *	因此充当「变更通报 + 待办清单」的出口。文档一旦能在无加密的机器上编辑，请把下面的内容
 *	搬运回 docs/development/DECISIONS.md（D038 / D039）与 docs/development/README.md 的待办表。
 *
 *	最后更新：2026-10-14（晚）  ·  分支 capacity-20p  ·  HEAD 2696d9f2
 *	本次新增：D040（皮肤全局开关）、D041（游戏内皮肤选择器）；I006 / I009 / I010 标为完成，
 *	I011 / I012 更新了实测数据与复现测试，原 I012（D039 名单状态）顺延为 I013，
 *	新增 I014（聊天弹幕，待实现）。
 */

// ============================================================================================
// 一、最新一次改动：D039 在线玩家名单
// ============================================================================================
//
// 需求（用户 2026-10-14）：大厅左上角的「在线 N」可以点开，查看当前有哪些玩家在线，显示
// **玩家名称**和**状态**；状态用「在线 / 在房间 / 观战中 / 游戏中」；能显示对局回合数就一起显示。
// 明确不做邀请功能（用户已否决）。
//
// ---- 实现：一个按需请求的接口，不推送名单 ----
//
// 大厅状态（lobby.state）本来就只广播一个**计数**（server/lobbyDiscovery.js 的 projection：
// `for (session of registry.all()) if (session.connected) online++`），从不发身份。名单做成
// **点开才请求一次**，因为 lobby.state 是增量广播：把名单塞进去会让每次有人上下线都重发一遍。
//
//   C2S  lobby.online   {}                              点开时请求
//   S2C  lobby.online   { players: [{ playerId, name, status, round? }] }
//
// ---- 四个状态：由服务端判定，不用客户端猜 ----
//
// 新增 shared/protocol.js 的 `LOBBY_STATUS = ['lobby','waiting','spectating','playing']`，
// 状态由 server/lobbyDiscovery.js 的 `statusOf(room, playerId)` 一处决定：
//
//   lobby       不在任何房间                              → 显示「在线」
//   waiting     在房间、未开局                            → 显示「在房间」
//   spectating  占着该房的观战席（room.spectatorOf）      → 显示「观战中」
//   playing     所在房间有进行中的对局（room.match）       → 显示「游戏中」
//
// **回合数**：`match.round`（公开字段，views.js 已随 m.public 广播）。`游戏中`和`观战中`都带
// `round`，且只在是正整数时才写进这一行（0 或非整数直接省略字段，不送假值）。
//
// ---- 隐私边界（刻意为之，测试里钉住了） ----
//
// · **只列已连接的人类会话**。AI 没有会话，天然不会出现；断线的人（10 分钟重连窗口内）保留席位
//   但**不在名单里**——所以标题是「在线玩家」而不是「玩家」，语义是一致的。
// · **不发房间邀请码**。房间码是私密房唯一的入场凭证（roomSummary 里就只在 allowMatchmaking
//   为真时才给 code）；名单只回 playerId / name / status / round 四个字段，测试断言名单里
//   不出现房间码、不出现 token。
// · **round 只带数字**，不泄露房间里还有谁、房间怎么配置的。
//
// ---- 协议与限流 ----
//
// · `lobby.online` 是 **post-v1 消息**，走 compact wire 的**可读 JSON 回退**，与 room.chat /
//   room.setMatchmaking / room.setSpectatorCapacity 同类。**没有新增 v1 编号，v1 指纹不变**
//   （test/wire-codec.test.js 仍钉着 ea41ddd2…）。
// · 加进 server/net.js 的 `HEAVY_TYPES`：它的回复最多 200 行（ROSTER_MAX），和 lobby.watch
//   打开列表同一量级，因此共用 heavy 桶（默认 2 次/秒、突发 6），防止刷新刷爆。
// · 上限与排序：ROSTER_MAX = 200 行封顶；排序按 STATUS_RANK（在线 → 在房间 → 观战中 → 游戏中）
//   **让空闲、可加入的人排在前面**，同状态按名称、再按 playerId，保证同样的在线人群序列化一致。
// · 紧急保护（bandwidthEmergency）生效时与其他大厅查询一样返回 SERVER_EMERGENCY。
//
// ---- 界面 ----
//
// · `LobbyOnlinePill`：**不传 onOpen 时仍然是原来那个只读的 `<span>`**（老调用方与老测试不受
//   影响）；传了就渲染成 `<button class="lobby-online--btn">`，带 aria-haspopup="dialog" /
//   aria-expanded，断线时 disabled。
// · `LobbyOnlineRoster`：复用现有 `Modal` 组件；一行一个玩家（名称靠左，状态与回合靠右），
//   底部一个「刷新」；三种非正常态各有文案（读取中 / 当前没有其他玩家在线 / 无法获取在线名单）。
// · `LobbyStatusLabel` 负责四个状态的中文文案；弹窗渲染在 screens/lobby.js 顶层，与房间列表同级。
// · CSS 加在 public/css/screens/lobby.css：`.lobby-online--btn` 与 `.lobby-roster*`。
//   **只用了 theme.css 里已定义的变量**（--mint-400/500/600、--mint-glow、--line-2、
//   --text-md/dim、--t）——初稿我误用了不存在的 --mint-300 和 --text，已改掉。
// · i18n：12 个新键写进 4 个语言包（en 1428 / ja·ko·zh-TW 1427 条），
//   `node tools/i18n.mjs check --all --strict` 显示 1390/1390 100%、0 missing、0 errors。
//   注意：`tools/i18n.mjs seed` 在本次环境里没生效（报 0 added），这四个包是我按各自格式直接写入的。
//
// ---- 验证 ----
//
//   test/lobby-discovery.test.js（新增 2 例）      22/22 通过
//     覆盖：四种状态各自正确、round 只在对局中且为正整数时出现、断线者不在名单、
//           AI 不在名单、名单里没有房间码/token、排序按 STATUS_RANK 稳定、
//           紧急保护时被拒、空名单仍正常应答。
//   test/wire-codec.test.js                        15/15 通过
//   相关套件（discovery / 大厅 UI / codec / 静态 / i18n / docs / lobby）  514/514 通过
//   eslint（改动文件）                              0 error
//   tools/check-imports.mjs                         通过（仅 3 条既有 note）
//
// 另外用真实组件做了一次 vnode 渲染自检（脚本已删除，不在仓库里）：断言按钮标签、onClick 是否
// 真的接到 openOnline、断线 disabled、四个状态文案、弹窗行数与「第 N 回合」、三种非正常态文案。
//
// ---- 一个排查记录：为什么点了没反应 ----
//
// 用户反馈「点击在线没有唤起弹框」。查证结论：**代码接线是对的**（渲染自检证明点击会调用
// openOnline），原因是**服务器进程没有重启**。server/http/buildTag.js 的注释写明：
//   `buildTag()` caches this fingerprint for the process lifetime: files changing on disk do
//   not advertise a new build before restart.
// 构建标记（BUILD_INPUTS 含 public/js）按进程缓存，磁盘改了但进程没重启 → 对外报的还是旧标记
// → 页面上的 buildGuard（每 60 秒比对 /healthz.build）不会触发自动刷新，而页面已经把旧模块
// 装进 module map 了，光刷新也不够，得让服务端先读到新文件。
// **所以：源码运行要重启进程；Docker 要 git pull + docker build + 重建容器。**
// 验证办法：重启后看 /healthz 的 build 是否变化；界面上「在线 N」是按钮（有手型、有按下态）
// 而不是纯文字，就说明在跑新代码。
//
// ---- 本次刻意没做 ----
//
// · **邀请功能**：用户明确否决。技术上可行（复用 session.notice 的定向推送 + 新增 2 个消息 +
//   频率限制/过期/去重等护栏），但它只对私密房有真实价值（公开房本来就能直接加入），且引入
//   「社交骚扰」这个新面。要做的话应单独记一条决策。
// · 预览用的静态 HTML 与截图（临时目录 / .analysis）：**没有进仓库，已删除**。

// ============================================================================================
// 二、上一次改动：商店卡片按皮肤显示立绘（I006 第②步）
// ============================================================================================
//
// 提交 54c796db — feat(shop): the operator card draws its skin's portrait when one is chosen
//               （对应 TODO 表里的 I006 第②步）
//
// 之前商店里的干员卡片永远画「干员自己的立绘」。现在先取「所选皮肤的立绘」，取不到就原样回退到
// 干员自己的立绘。因此：没有选过皮肤的浏览器、以及当前这份还没注入立绘的清单，渲染结果与改动前
// 逐字节相同——这不是推测，测试里钉住了。
//
// 改动三个文件：
//
//   public/js/ui/assetUrls.js  新增纯函数 chessSkinPortraitUrl(m, chess, skinId)
//   public/js/ui/shopBar.js    ChessCard 的立绘取值改为「皮肤立绘 || 原皮立绘」
//   test/skins.test.js         追加 D038 用例（+62 行）
//
// 三个关键设计点（都是 docs/SKINS.md 点名的静默失败点）：
//
//   1. manifest 按「干员」分组，选择按「棋子」。
//      清单是 chars[charId].skins[skinId]，而玩家选择是 { [chessId]: skinId }。
//      所以干员从 chess 记录里取 charId，皮肤 id 由 skinFor(chessId) 传进来。两边不能混用。
//
//   2. 缺立绘必须返回 null，绝不能自己拼一个 URL。
//      tools/inject-skins-assets.mjs 只在「文件真的在磁盘上」时才写 portrait 字段；上游 174 款皮肤
//      里只有 131 款有立绘。返回 null 才能让调用方干净地回退原皮；拼 URL 会去请求一个从未生成的
//      文件，变成控制台 404 噪音（assetUrls.js 的头注释明确禁止这件事）。
//
//   3. 原皮回退沿用既有两条键：assets.portrait（形如 char_498_inside_1）→ charId，
//      与 chessAvatarUrl 的既有回退链一致，不引入第三套规则。
//
// 测试覆盖（test/skins.test.js 末条用例）：
//   · 无选择 / 未知皮肤 id / 记录缺 charId / manifest 为空 → 全部 null
//   · 有真实皮肤 → 解析到它自己的立绘 URL
//   · 皮肤条目存在但没有 portrait 字段 → null（回退）
//   · 原皮回退按 assets.portrait → charId 两条键依次生效
//   · 遍历已提交 manifest 里全部 174 款已装皮肤，逐一断言「要么解析到自己的立绘，要么是 null」
//   · 显式钉住当前事实：注入的立绘数量为 0（即 I006 第①步尚未执行），所以商店现在仍画原皮
//
// 验证结果：
//   test/skins.test.js                                        9/9 通过
//   assetUrls / 商店 / 静态 / 金标准 相关套件                   402/402 通过
//   完整套件 node --test（7114 用例）                          7040 通过
//   eslint / tools/check-imports.mjs                          0 error
//
// 完整套件里那 11 项失败与本次改动无关，是既有环境基线，逐项归因：
//   · 性能阈值类（0.5 ms/tick 基准、84 连接 @0.8 Mbps 压测等）——绝对阈值，机器慢就超
//   · 需要素材类（官方场景包、打包/更新包用例）——本机 public/assets 不存在
//   · test/assets-env-proxy.test.js 两例——需要 Node ≥22.21 才让 fetch() 走 HTTP(S)_PROXY，本机 22.19
//   · twenty real WebSocket players / wire-pressure——并发跑时撞 maxConnectionsPerAddr: 64，单独跑通过
// 上线前请在空闲机器上单独重跑上面几类，不要在并发全量套件里看结果。

// ============================================================================================
// 三、决策记录（待搬运到 docs/development/DECISIONS.md）
// ============================================================================================
//
// ## D039
//
// **生效：大厅的「在线 N」可以点开，按需查看在线玩家名单（名称 + 状态 + 对局回合）；不做邀请。**
//
// - 数据面：新增 `lobby.online`（C2S 请求 / S2C 应答），**点开才请求一次**，不随大厅状态推送。
//   理由：`lobby.state` 是增量广播，把名单塞进去会让每次上下线都重发；而名单只有被打开时才有人看。
// - 状态由服务端判定，新增 `LOBBY_STATUS = ['lobby','waiting','spectating','playing']`，在
//   `server/lobbyDiscovery.js` 的 `statusOf()` 一处决定，显示为「在线 / 在房间 / 观战中 / 游戏中」。
//   客户端不自己从房间形状推断状态（避免两套规则各自演化）。
// - 回合数取 `match.round`，`游戏中`与`观战中`都带，且只在为正整数时出现。
// - **只列已连接的人类会话**：AI 无会话天然不在名单；断线重连窗口内的人保留席位但不在名单，
//   因此标题是「在线玩家」。
// - **隐私边界**：不回房间邀请码（私密房的入场凭证）、不回 token、不回 loadout/地址；round 只带
//   数字。名单字段就 `playerId / name / status / round?` 四个，有测试钉住。
// - 协议：post-v1 消息，走 compact wire 的可读 JSON 回退，**不新增 v1 编号、v1 指纹不变**。
// - 上限与限流：名单 200 行封顶；排序按状态档（在线 → 在房间 → 观战中 → 游戏中）让可加入者靠前，
//   同档按名称再按 playerId，保证同一在线人群序列化一致；该消息计入 `HEAVY_TYPES` 桶。
// - 拒绝：邀请功能（用户否决；只对私密房有真实价值，且引入社交骚扰面，要做应单独记一条决策）。
// - 依据：用户 2026-10-14 的要求；实现 `shared/protocol.js`、`server/lobbyDiscovery.js`、
//   `server/lobby.js`、`server/net.js`、`public/js/lobbyDiscovery.js`、`public/js/screens/lobby.js`、
//   `public/js/ui/lobbyDiscovery.js`、`public/css/screens/lobby.css`、4 个语言包；
//   守卫 `test/lobby-discovery.test.js` 的两条 D039 用例与 `test/wire-codec.test.js` 的 v1 指纹。
//
// ## D038
//
// **生效：商店的干员卡片按玩家所选皮肤显示立绘；只在商店生效，其他界面仍画原皮。**
//
// - 取值规则：卡片立绘 = 所选皮肤的 `portrait` ∥ 干员自己的立绘。皮肤立绘缺失时回退，
//   不是画空白、也不是画破损图。实现 `public/js/ui/assetUrls.js` 的 `chessSkinPortraitUrl`，
//   调用点 `public/js/ui/shopBar.js` 的 `ChessCard`。
// - **只有「已安装且真有立绘文件」的皮肤才会改变显示**：`tools/inject-skins-assets.mjs` 只在
//   `public/assets/char/skin_portrait/<stem>.png` 确实存在时才写 `portrait` 字段。上游 174 款里
//   131 款有立绘，其余 43 款自动回退原皮立绘——这正是 `inject-skins-assets` 采用「文件在才写」的
//   原因，本决策依赖这条约定，不要改成「清单里一律写 URL」。
// - **干员键与棋子键不混用**：清单是 `chars[charId].skins[skinId]`（按干员），玩家选择是
//   `{ [chessId]: skinId }`（按棋子，见 D037）。函数从 chess 记录取 `charId`，皮肤 id 由
//   `skinFor(chessId)` 传入。
// - **不需要改协议**：商店完全在客户端，选择已经通过 `room.skins` 同步（形状与 `room.loadout`
//   一致，且是公开的，队友能看到）。本次没有新增或修改任何协议消息、字段或线格式。
// - **范围：只做商店卡片**（用户要求）。详情卡、手牌、临时整备区、准备区共 5 处 `assetUrls.js`
//   调用方**未改动**，是否铺开见待办 I009。这样选的理由：商店是重复曝光最多、最需要「一眼看出
//   穿了哪套」的位置；其余位置面积小、铺开后渲染与带宽成本都要重新评估。
// - **代价**：无可测量的代价。未选皮肤、或选了但没有立绘文件时，渲染与请求与改动前完全一致；
//   选择了有立绘的皮肤时，多一次图片请求（180×360，与干员原皮立绘同尺寸，因此**不需要改 CSS**）。
// - 依据：用户 2026-10-14 的要求；实现 `public/js/ui/assetUrls.js`、`public/js/ui/shopBar.js`；
//   守卫 `test/skins.test.js` 的「D038 商店立绘」一例；素材来源 `fexli/ArknightsResource` 的
//   `charpor/<stem>.png`（`tools/fetch-skin-portraits.mjs`）。

// ============================================================================================
// 三·五、后续改动：皮肤全局开关 + 游戏内选择器（待搬运为 D040 / D041 与 README 待办表更新）
// ============================================================================================
//
// 用户 2026-10-14 晚提出的两件事，一次做完；**没有改协议**（`room.skins` 早已存在且公开）。
//
// ## D040  皮肤的两个全局开关（设置 → 干员皮肤）
//
// **生效：`显示皮肤`（skinsOn，默认开）是总开关；`一键装备皮肤`（skinsAutoEquip，默认开）只管「自动装的
// 那些」。两者互不删除对方的数据。**
//
// · **`显示皮肤` 关闭 = 全场显示原皮，包括别人装备的皮肤**。它是显示设置，不是个人偏好，所以连队友的
//   皮肤一起隐藏。**存储的选择一条不删**，重新打开原样恢复。
// · **`一键装备皮肤` 关闭 = 只隐藏「自动装配」的那些**；玩家自己手选的皮肤照常显示。这条是用户明确
//   要求的「关闭后仍能看到其他玩家装备的皮肤」的本地对应物。
// · **实现要点（踩过坑，别改回去）**：
//   1. 开关的唯一读取点是 `public/js/ui/skins.js` 的 `skinFor`，所有调用方自动受控；组件另需**订阅**才
//      会重画 —— 这就是 `useSkin` / `useSkinsVisible` 存在的原因，它们返回 `{ …, version }`，**version
//      必须参与渲染**，否则订阅值不变、监听器触发也没人重画（修过一次的 bug）。
//   2. `一键装备` 的「哪些是自动装的」记在 `sp.pref.skinsAutoSeeded`（干员 id 集合）。**它不是开关**，
//      关掉开关时**不许清空它** —— 清了就没人知道该隐藏谁，开关看起来就是坏的（修过一次的 bug）。
//   3. 缺少该标记的浏览器（上一个版本播种过的）会在加载时**从已存选择重建**；播种本身也改成**只增不减
//      的补充**，所以后来的版本覆盖到的新干员能补上，而已有选择绝不被覆盖。
//   4. **战场是独立的一条路**：`render/app/app.js` 用 `skinFor`（受控），但每个战斗单位带的是服务器发布的
//      `UnitInfo.skin`，客户端 `skinFor` 看不到它。开关必须同时加在 `render/app/info.js` 的 `renderInfo`
//      入口上，否则**卡片全变原皮、战场还在穿皮肤**（修过一次的 bug）。
// · 代价：选择仍然随 `m.public` 广播（D037 测得全员 +1120 B / 次）；开关本身零协议开销。
//
// ## D041  皮肤选择器进入游戏内的干员卡片
//
// **生效：对局中点开自己的干员卡片（商店卡右键 / 场上单位），头像下方就有皮肤列表，可直接改自己的皮肤。**
//
// · 复用 `public/js/ui/skinPicker.js` 的 `SkinSection`，**原样照搬**（用户要求「直接照搬复制过去就行」）。
//   它只读写本地 store（`setSkin` / `clearSkin`），**不涉及协议**，所以对局中提供是安全的。
// · **位置**：`detailPanel.js` 的 `CHESS_SECTIONS` 顺序为 `head, garrison, trait, stats, skill, skin,
//   module, equip, talents, actions`。面板是纵向 flex，所以 `skin` 紧跟在「技能」之后。用户先要求「摆在
//   头像下面」，看图后更正为 **特性/特质 优先比 皮肤高** —— 干员自身描述先说完，再放皮肤。
// · **不继承 `editable`**：那个标志问的是「棋盘能不能改」，玩家一点「准备就绪」就变 false，与浏览器画什么
//   无关。准备后再换皮肤照样保存并同步，下一轮生效。
// · **队友的卡片上不显示**：`foreignSkin` 带的是**别人**的皮肤，本地 store 管不着，所以隐藏选择器而不是
//   提供「改别人干员」的假控件。
// · **`显示皮肤` 关闭时只留标题、不显示选项**（用户要求：关闭了皮肤显示 不应该展示），标题右侧显示
//   「已关闭」。**说明性提示行被用户否掉**（「这个不要了」——他把它误读成了游戏里的技能提示），
//   对应的 msgid 已从 4 个语言包删除。
//
// ## 素材与立绘的两处现实约束（不是 bug，别当 bug 修）
//
// · **41 款皮肤上游只有方形头像、没有 180×360 立绘**（模型 172 有、立绘 133 有）。卡片是 0.5:1 而头像是
//   1:1，**任何裁切都会毁构图**：实测并排对比后，`cover` 只剩一条额发和一只眼。所以这些卡片用
//   `.scard__art--square`：**方形原尺寸、居中、不放大**（比立绘小，但不糊）。`chessSkinPortraitUrl` 在
//   「该皮肤有模型但无立绘」时才回退到头像，按 `spine` 做守卫，所以空清单的行为与以前完全一致。
// · **8 名干员有皮肤但所有棋子都是隐藏/精锐/自选**（红豆、地灵、崖心、协律、见行者、巫恋、蜜蜡、瑰盐），
//   商店里选不到他们，因此**保持原皮是正确的**；另有 5 名（雪猎、凯瑟琳、缇缇、凛御银灰、溯光星源）
//   皮肤目录里根本没有他们的皮肤。
//
// ## 已实测确认、不要重复怀疑的两件事
//
// · **改完皮肤实时生效**：页面内逐帧测得**第 1 帧、10 ms** 更新，不用刷新、不用重开卡片。曾误判为「滞后」，
//   真实原因是探针在点击被处理前就去读了。
// · **`显示皮肤` 关闭后**：`skinFor` 全为 null、107 条全部停止生效、画面上**没有一个 `<img>` 还指着皮肤图**，
//   而存储里的 107 条一条不少。
//
// 依据：用户 2026-10-14 的逐条要求与更正；实现 `public/js/ui/skins.js`、`public/js/ui/settings.js`、
// `public/js/ui/skinPicker.js`、`public/js/ui/detailPanel.js`、`public/js/ui/assetUrls.js`、
// `public/js/ui/shopBar.js`、`public/js/ui/gameLogic/settings.js`、`public/js/render/app/info.js`、
// `public/css/screens/game-shop.css`、4 个语言包。

// ============================================================================================
// 三·六、UI 测试的真挂载（D042：皮肤那批引入的回归，及其修法）
// ============================================================================================
//
// ## 问题
// 皮肤那批（`7569f582~21..7569f582`）给 `shopBar.js` / `ownership.js` / `detailPanel.js` /
// `gameComponents.js` / `screens/loadout.js` 的共享组件加了**组件顶层**的 `useSkin(...)`。而 `test/ui/` 下 16 个
// 测试文件用的是「**直接调用组件函数 + 遍历返回的 vnode 断言 props**」（`ChessCard({...}).props.class`）。preact 的
// hook 派发器需要一个只有真渲染才装上的「当前组件」，所以第一个无条件的 `useSkin` 就让这些测试全部变成
// `TypeError: Cannot read properties of undefined (reading '__H')` —— 共 43 条失败。那批同时只改了 4 个测试文件
// （assets / spectator-skin / runtime-http / skins），`test/ui/` 一个没动。
//
// ## 结论：改成真挂载，且用真 DOM（不是手写桩）
// 新增 `test/helpers/dom.js`（约 340 行，被 16 个文件复用）：
//   · `installMiniDom()` —— 装 DOM 全局量，**必须在 import 任何 app 模块之前**调用；
//   · `mountVNode(preact, Type, props, overrides)` —— 同步挂载，返回**与旧的 vnode 同形**的对象，
//     所以 `props.class` / `hasClass` / `textOf` / `srcsOf` 这些老断言基本不用改；`props.onClick()` 真的派发；
//   · `mountVNodes(..., keys, overridesAt)` —— 给返回**多根**的组件（`ChessDetail` 每个 section 一个 vnode）；
//   · `toVNode` / `vnodeOf` / `pendingHandles`。
//
// **为什么不用手写 DOM 桩**：先按原计划写了一个约 460 行的最小桩，实测能跑（preact + hooks 只需
// createElement / createElementNS / createTextNode / setAttribute / insertBefore），但随后**每修一个测试就冒出
// 一类缺失的标准行为**：`<script>` 的 text 语义、`disabled` 布尔属性、`documentElement.dataset`、
// `<select>.value`、`style` 的字符串/对象两态、事件表键名……换成 `happy-dom`（**devDependency**，生产代码零改动）
// 后代码更短、行为更真，整类问题一次消失。**生产代码一行未改**。
//
// ## 几个必须知道的坑（都实测过，不是推测）
// 1. **preact 的事件表**存在元素上（发布构建里属性名是压过的 `l`，源码里叫 `__l`），键名是
//    `<事件名><capture>` 且**大小写随 DOM 实现而变**（手写桩下是 `Clickfalse`，happy-dom 下是 `clickfalse`）。
//    适配器按前缀不区分大小写匹配后重建 `onClick`。
// 2. **vnode 的 `key` / `props` 不在 DOM 上**：`el.__k` 在 happy-dom 下**不存在**，`options.__r` 对每个 vnode 都触发
//    （含内部 Fragment），包装根组件的 `type` 也拦不到（返回数组的组件，其 children 是在组件**内部**才创建的）。
//    所以需要区块身份时**只能由调用方声明**。
// 3. **`ChessDetail` 的区块会错位**：它是 `CHESS_SECTIONS.map(k => blocks[k]).filter(Boolean)`，
//    返回 null 的区块被丢掉 → 之后**所有位置前移一位**。按位置命名就会出现「找 `skill` 拿到 skin 区块」这类
//    静默错误（本项目实际踩到过，并因此改错过两处期望值）。现在用
//    `{ list: CHESS_SECTIONS, absent: ['garrison', 'actions'] }` **显式声明**哪些区块不渲染；
//    插入型区块（merge hint 在 index 1）用 `{ at: 1, key: 'merge', list }`。
// 4. **DOM 回读的还原规则**（`toVNode` 里）：`data-*` 数值能往返就转回数字（`"007"` 保持字符串）；HTML
//    **布尔属性**白名单里的 `""`/`"true"` → `true`、缺失 → 无；`style` 同时给字符串（`props.style`，老断言用）和
//    活对象（`props.styleObject`）；表单元素补 `props.value`。**`aria-*` 是字符串属性，不参与还原。**
// 5. 事件处理器收到的对象**只补缺、不覆盖**：老测试会传 `{ currentTarget: { value } }` 来驱动 `onChange`。
//
// ## 顺带修掉的真回归（非本批引入，但同批暴露）
// · `sanitizeSettings` 的断言没跟上新增的 `skinsOn` / `skinsAutoEquip` 两个设置（`test/ui/gameLogic.test.js`）；
// · `fallbackField.js` 被 `1055a235` 重构（提取 `si` / `diy` 局部量）后，`test/ui/standin-ui.test.js` 里的两条
//   源码正则失效；**行为未变**，已按新写法重写；
// · `test/docs-consistency.test.js` 的 `CHESS_SECTIONS` 守卫没跟上 `'skin'` 的插入（已修，见下）；
// · `test/ui/playtest3.test.js` 里两处写死的区块顺序列表（同上，缺 `'skin'`）。
//
// ## 完成标准里那条「套件挂起」
// 挂载会跑真实 effect，测试跑完进程仍不退出（看起来卡在几个百分点）。`after` 钩子实测**没有残留定时器句柄**，
// 疑为未决 Promise。当前所有验证都用 `--test-force-exit` 规避（它只在测试结束后强制退出，不影响结果）。
// **待办：查清这个未决 Promise 的出处**，理想情况下不必给 `npm test` 加这个参数。

// ============================================================================================
// 四、Todo（待搬运到 docs/development/README.md 的「待办与未确定事项」表）
// ============================================================================================
//
// I006  ✅ **已完成**（2026-10-14 晚）。三步都做完，数字留档：
//       ① `node tools/inject-skins-assets.mjs` 已在有素材的机器上跑过 —— `data/assets.json` 现在有
//          **174 条皮肤：172 有模型、133 有立绘、174 有头像**。`test/skins.test.js` 里原先钉死的
//          `withPortrait === 0` 已改为按「有任何素材」判定，并且同时断言「有模型但无立绘时必须至少有立绘或头像」。
//       ② `test/assets.test.js` 曾因皮肤模型入场而连带暴露两个真 bug，都已修：
//          · 皮肤 atlas **缺顶层 `size:` 行**（上游不给），341 个全部补上，且**在下载环节补**（`tools/assets/
//            skin-atlas.mjs`，复用仓库自己的 `normalizeAtlas`，位置插错会被解析器当成贴图文件名）。
//          · 注入器把原皮 `anims` 整份抄给皮肤，而**皮肤骨骼并不都有那些动画**，客户端会抛
//            `Animation not found`。现在按皮肤骨骼（`tools/assets/skel.mjs`）取交集，174 款里 **98 款被过滤**。
//          这两个之前看不见，是因为「每个 Spine 模型都能加载」那条测试**只遍历 spine、不遍历 skins** —— 现已补上覆盖。
//       ③ `fetch-skin-portraits.mjs` 已并入 `npm run assets:skins`（= avatars → spines → portraits → inject）。
//
// I007  ✅ **已由本文件第三节完成草稿（D038），并在三·五节补齐 D040 / D041**。能在无加密机器上编辑 .md 时，
//       把这两节搬进 `docs/development/DECISIONS.md` 并按惯例补索引链接。
//
// I008  待决定：`docs/SKINS.md` 描述的 `tools/install-skins.mjs` 与 `server/skinInstall.js`
//       （按需安装队列）在皮肤来源仓库的任何分支上都不存在，实际实现是全量内置。
//       二选一：补实现，或把文档改成与代码一致。**建议改文档**——全量内置是已经跑通并验证过的
//       路径，补一个不存在的队列只会增加风险面。
//
// I009  ✅ **已铺开**（2026-10-14 晚）。原来只有商店卡片，现在这些位置全部按所选皮肤显示：
//       干员调配名单卡片与详情头部、干员持有列表、`UnitThumb`、详情面板、战场 DOM 降级层、战场模型。
//       解析统一走 `skinFor`（受 D040 的开关控制），替补干员与自选棋子**刻意不穿皮肤**（皮肤属于干员本人，
//       替补是另一个人；自选槽本来就没有皮肤，服务端 `setSkins` 也过滤 `isDiy`）。
//
// I010  ✅ **已验证**（2026-10-14 晚，在有完整素材的机器上）。浏览器实测确认：商店/名单卡片显示皮肤立绘、
//       干员调配详情头部显示皮肤立绘、战场单位穿皮肤模型、107 个可穿皮肤的棋子**全部解析到皮肤图**（0 个回退原皮）。
//       另有一条**已知且被用户接受**的边界：**战斗中**关掉「显示皮肤」，已经在场的单位会立刻变回原皮，
//       但重新打开时要**下一轮**才穿上（战斗模型在开打时构造，无法中途换）。
//
// I011  待决定：版本与发布。`APP_VERSION` 仍是 `0.2.6`（未动），皮肤写在 CHANGELOG 的「未发布」段。
//       是否切 `0.2.7`、是否打标签，以及皮肤素材是否改走 `packs/` 或预缓存分发。
//       **实测体积**：`public/assets` 合计 **745.5 MB**，其中皮肤三项 = 模型（`spine/op` 内含）+
//       立绘 16.1 MB + 头像 10.3 MB。这个体量要不要改分发方式是本条的重点。
//
// I012  待复现：**观战看到的还是原皮；联防时又都有皮肤**（用户 2026-10-14 报告，应「看谁的就用谁的」）。
//       已补一条**端到端复现测试** `test/match/spectator-skin.test.js`（真人 + 观战席 + 客户端战斗，
//       断言观战者收到的 `b.start.spec` 里各玩家单位带**自己**的皮肤，且与场上 spec 逐单位一致、
//       同时 `contentInfo.funds` 确实被剥掉），**当前构建下通过**。
//       仍在等用户在一次真实的两浏览器观战里确认；若仍能看到原皮，下一步是现场抓 `b.start` → 客户端
//       `createBattleFromSpec` → `UnitView` 这条链，不要再靠读代码推断。
//       ⚠️ 排查时**先确认现象发生在哪个构建上** —— `1ff7ae8e` 之前模拟层是丢皮肤的，而用户报告时的
//       服务器是 19:45 启动的旧版本。
//
// I013  待决定：D039 名单是否再加状态标记。用户 2026-10-14 问过「还有什么状态」，当时只做了四个
//       基础状态（在线/在房间/观战中/游戏中）。候选与取舍：
//         · **已准备**（在房间且 seat.ready）——最有价值：房主能一眼看出「还差谁没准备」，
//           现在必须进房间才看得到。数据已有（room.seats[].ready），成本小。**推荐加**。
//         · **房主**（room.hostId）——想调难度/容量时知道找谁。数据已有，成本小。**推荐加**。
//         · **重连中**（session.disconnectedAt + reconnectWindowMs，10 分钟）——D017 的重连窗口内
//           玩家占着席位但不可见，别人会以为「人满了却开不了局」。**但它与「在线名单」语义冲突**
//           （那些人当前并未连接），要做就得把标题从「在线玩家」改成「玩家」，并显示剩余重连时间。
//           **推荐单独立项**，不要混进这次的状态枚举。
//         · **不建议**：显示在哪个房间/房号（会暴露 allowMatchmaking:false 的私密房——这正是
//           D039 刻意避开的）、在线时长、ping、独立模拟/同盟标记（对参战人数无意义）。
//       建议做法：把「已准备」「房主」做成状态的**附加标记**（如「在房间 · 已准备 · 房主」），
//       不新增 LOBBY_STATUS 取值，以免破坏现有的排序档与协议语义。
//       （原编号 I012 被「观战皮肤」占用，见上一条；本条顺延为 I013，搬运时注意别撞号。）
//
// I014  待实现：**聊天弹幕**（用户 2026-10-14 晚提出）。规则与范围已定，实现时按下面走：
//
//       ⚠️ **2026-10-15 二次核实（动手前查的，改了初稿两处结论 —— 先读这段再动手）**：
//         ① **聊天里现在已经有「头像」了，但它不是干员头像。** `public/js/ui/matchChat.js:127` 每行都用
//            `PlayerAvatar`，而那个组件（`ui/gameComponents.js:265`）画的是 **`bandIconUrl(player.bandId)`
//            盟约图标**，没有盟约时退化成**名称首字**（`glyph`）。所以「聊天没有头像」这句不准确 ——
//            准确说法是「**没有干员头像**」。设计前先决定：弹幕要不要和聊天行**用同一个** `PlayerAvatar`
//            （一致、零成本、但**不是**用户说的那个干员头像），还是**另做**一个干员头像的版本。
//         ② **服务端 `ChatSender` 类型里没有 `charId`**（`server/matchChat.js` 的
//            `@typedef {{ playerId, name, seat, spectator }}`），所以方案 (A) 就是**给这个 typedef 加字段**，
//            并且要让 `lobby.js:1199` 的调用方**真的取到值**（发言者的对局状态里确实有 `charId` ——
//            `PlayerState` 的 `seat.ops` 就是 `{ [charId]: … }`，但**从 playerId 走到 charId 这一步要现写**）。
//            然后三处校验必须同步加：服务端 `append` 的入参校验、客户端 `matchChat.js` 的 `copyEntry`、
//            以及 `shared/matchChat.js` 里若有形状常量。**漏掉任何一处，字段会被静默丢掉**（`copyEntry`
//            逐字段白名单，不认识的字段直接不复制 —— 这正是最容易踩的坑）。
//         ③ 因此**本项不是「加个开关画个动画」那么小**：协议字段 + 三处校验 + 服务端取值 + 客户端组件 +
//            CSS + i18n + 测试。**建议单独排一次实现**，不要顺手做。
//
//       · **需求**：有人发聊天消息时，消息以**弹幕**形式从屏幕**横向飘过一次**，带上**头像 + 名称 + 消息**。
//         「只飘一次」是用户明确要求的（不循环、不堆叠重播）。**默认关闭**（关闭时就是现在的样子 ——
//         消息只出现在聊天框里，行为完全不变）。设置里加一个 `聊天弹幕` 开关（`settings.js` 的
//         `Toggle` 区块，与「显示皮肤」等同一组；键名建议 `chatDanmaku`，默认 `false`，照
//         `gameLogic/settings.js` 的 `DEFAULT_SETTINGS` + `sanitizeSettings` 成对加，**新增设置必须
//         同时改这两处**，否则存了也不生效）。
//
//       · **现有链路（已核实，别重新找）**：消息由 `server/lobby.js:1199` 的 `ctx.chat.append({...})`
//         产出，字段是 **`playerId / name / seat / spectator / text`**，经 `broadcastRoom` 广播；
//         客户端入口 `public/js/matchChat.js` 与 `public/js/ui/matchChat.js`（聊天框渲染）。
//         **没有新增协议消息的需要** —— 弹幕是同一个 `room.chat` 消息的另一种呈现。
//
//       · ⛔ **头像来源：更正 —— 原写的方案 (a) 不可行，实现前必须先补数据。**
//         我在初稿里写「从房间席位解析 `room.seats[].charId`」，**那个字段不存在**。逐处核实结果：
//           — `room.seats[]`（server/lobby.js:275 投影）= `{ seat, playerId, name, isBot, ready, connected }`
//             —— **没有 `charId`**；
//           — `room.loadout.entries`（shared/protocol.js:81）= `{ [baseChessId]: { skill, module } }`
//             —— **键是棋子、值是技能/模组，同样没有 `charId`**；
//           — 对局公开玩家列表（StubMatch.js:221 的投影，真实 Match 同形）= `playerId / seat / name / isBot /
//             connected / alive / lp / bandId / shopLevel / boardCount / ready / bonds / fieldId / status`
//             —— **也没有 `charId`**。
//           皮肤本身是**另一条路**送到的（`fieldMeta()` → `unitInfo.skin`，即「场上的单位」），所以
//           「聊天的人是谁」在客户端**目前根本没有对应关系**可用。
//         ✅ **仍然有效的决定（用户 2026-10-14 晚拍板）**：**倾向不动协议**；**没选干员时弹幕只显示
//            「玩家名称 + 消息内容」，不放头像**（原话：「没选干员时 就玩家名称 和消息内容就行」）。
//           两种形态都要做，且**解析不到头像绝不能让弹幕不飘**（降级成「不带图照飘」）。
//         ⚠️ **因此实现前的第一步是二选一补上数据来源**（这是本项唯一的前置阻塞）：
//           (A) **给 `room.chat` 消息加一个 `charId` 字段**（服务端 `append` 时从该玩家的对局状态取）。
//               最直接、最准，且**只在聊天这一条路上加字段**；`room.chat` 是 post-v1 消息，按 D021 的约定
//               **不新增 v1 编号**，但要**先跑 `test/wire-codec.test.js` 确认 v1 指纹断言没被影响**。
//           (B) **不动协议，先只做「名称 + 消息」那种形态**（即永远走无头像分支）。零风险、最快，
//               但「带头像」这个需求等于没做。
//           建议 (A)：需求的全部价值就在于「一眼看出是谁在说」，而 (B) 拿不到这个价值。
//
//       · **飘过范围**：只在**对局界面**飘（`screens/game.js` 的 overlay 层），不要在大厅飘 ——
//         大厅有自己的聊天框，满屏弹幕会挡住房间列表。飘过的动画建议用 CSS transform + `animationend`
//         自删节点（**不要用 setInterval 轮询清理**），并且**同一时刻限流**（例如最多 5 条在飘、
//         超出直接丢弃或排队），否则多人同时发言会糊屏。
//
//       · **要守的约定**：① 开关关闭时**渲染与请求与现在完全一致**（照 D037/D040 的做法：
//         关掉就是「不画」，不是「画了再隐藏」）；② 界面文字一律包 `t()` 并补 4 个语言包
//         （`node tools/i18n.mjs check --all --strict` 必须 100%）；③ 新增设置项后
//         `test/server-settings.test.js` 与设置界面的既有用例要跟着过。
//
//       · **不要做的事**：不要给弹幕加发送者历史/常驻列表（用户只要求「飘一次」）；不要做成可点击跳转
//         （会带来额外的手势与焦点问题）。
//
// 另有 I001–I005 五条旧待办仍在，全部卡在「服务器部署后验证」：I001 终极模式第三次机变待复现、
// I002 线上带宽待验证、I003 39 套召唤物素材服务器待部署、I004 素材准入服务器待验证、
// I005 紧急保护生产触发待校准。细节见 docs/development/README.md。

// ============================================================================================
// 五、长期约定提醒（每次跟随上游更新都要守）
// ============================================================================================
//
// D036  WebSocket 压缩**永久**保留 20 人版的 `WS_COMPRESSION`，不采用上游的 `WS_DEFLATE`。
//       上游的结论基于单人会话，而 20 席房 8 Hz 的 `m.public` 正是「重复视图」流——两者结论
//       天然相反。实测 24 条 20 席 m.public（1.10 MB JSON）：本分支配置 76 KB（−93.1%），
//       上游配置 242 KB（−78.1%），**上游是 3.2 倍字节**。
//       · 唯一裁判是 `test/wire-pressure.test.js`（84 连接 / 0.8 Mbps / p95 < 2s）。
//       · 上游的 `test/ws-compression.test.js` **每次同步都会红，那是预期的**——适配测试，
//         不要改实现（把断言目标从 WS_DEFLATE 换回 WS_COMPRESSION，测试意图不变）。
//       · **不要为了让它变绿去调阈值**。要改必须先给出同机 A/B 实测 + 该测试结果。
//
// ============================================================================================
// 【本机环境问题·已解决】git push / git stash 报 "error launching git" 的真实原因
// ============================================================================================
//
// 症状：`git push` 和 `git stash push` 失败，报
//   error launching git:  Windows Installer SDK
// 而 `git fetch` / `git ls-remote` / `git commit` / `git send-pack` / `git receive-pack`
// 全部正常。**这个报错与网络、认证、仓库、以及任何沙箱都无关**（早先一版本文件把它归因给
// 沙箱，是错的，已改正）。
//
// 根因：`C:\Program Files\Git\cmd\git.exe` 这个 **46 KB 的包装器在本机启动失败**。
// `git push` 与 `git stash` 是仅有的两个「需要再启动一次 git 自己」的子命令
// （push 要用 `git-receive-pack` 走远端通道，stash 要再跑 `git`），它们按 PATH 找到的是
// `Git\cmd\git.exe`（`where git` 的第一个），那个包装器起不来 → "error launching git"。
// 其余子命令都是进程内执行或直接调具体 helper，所以不受影响。
//
// A/B 实测（本地裸仓库，完全排除网络与认证）：
//   PATH 原样（Git\cmd 优先）          → ❌ error launching git
//   PATH 前置 Git\mingw64\bin          → ✅ 推送成功
//   PATH 只留 Git\mingw64\bin          → ✅ Everything up-to-date
//
// **本机推送的命令写法**（每次推送都带上，直到重装 Git 或改掉系统 PATH 顺序）：
//
//   set "PATH=C:\Program Files\Git\mingw64\bin;%PATH%" && cd /d E:\zmd\20p-sync && git push origin capacity-20p
//
// 彻底修复（二选一）：
//   ① 重装 Git for Windows（推荐，恢复 cmd\ 包装器与 libexec 布局）；
//   ② 把系统环境变量里的 `C:\Program Files\Git\mingw64\bin` 移到 `C:\Program Files\Git\cmd`
//      **前面**，让所有程序（含 GitHub Desktop / TortoiseGit / CI 脚本）都不再依赖那个包装器。
//
// 另外两个本机环境事实（排查时顺带确认）：
//   · 本机 PATH 里 `C:\Program Files\TortoiseGit\bin` 排在 Git for Windows 之前，但 TortoiseGit
//     只带 DLL（gitdll.dll 等）**没有 git.exe**，所以它不是这个问题的原因（已排除）。
//   · `http.sslverify=false` 是**系统级**配置，每次 HTTPS 操作都会打印
//     「TLS certificate verification has been disabled!」安全警告。若非公司代理自签证书所必需，
//     建议 `git config --system --unset http.sslverify` 关掉——它会削弱中间人防护。
//   · 凭据方面：系统里存的 GitHub 凭据 target 是 `api.github.com` 域，与 git push 的
//     `github.com` 域不匹配，所以 GCM 会转为交互提示；在无 tty 的环境里表现为
//     `could not read Username`。人工推送时按提示登录一次即可（或用 PAT 当密码）。
//     网络侧还出现过对 push 的 `502 Bad Gateway`（读操作正常、写被拒），关掉代理/加速器后恢复。

// ============================================================================================
// 六、本文件自身的说明
// ============================================================================================
//
// 这是个**临时沟通文件**，不是一个功能模块：它没有 import、没有 export、不参与构建，
// 也不应该被任何代码引用。作用只是把「本机改不了 .md」这段时间里的变更与决定留住，
// 避免悬空引用（代码注释里已经出现 `(D038)`，对应第二节）。
//
// 当 docs/ 能在无加密的机器上编辑、且第二/三节的内容已经搬运完成之后，**可以删除本文件**。
// 在那之前请保留它，并随每次改动更新「最后更新」那一行。
