/**
 *	加密环境下 使用 本文件向外界传达本次修改内容 和todo
 *
 *	为什么有这个文件：本机的加密环境会改写 .md / .txt 一类文本文件，所以 docs/ 下的文档
 *	（DECISIONS.md、development/README.md 等）不能在这台机器上安全编辑。这个 .js 文件不受影响，
 *	因此充当「变更通报 + 待办清单」的出口。文档一旦能在无加密的机器上编辑，请把下面的内容
 *	搬运回 docs/development/DECISIONS.md（D038 / D039）与 docs/development/README.md 的待办表。
 *
 *	最后更新：2026-10-14  ·  分支 capacity-20p  ·  新增 D039（在线玩家名单）
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
// 四、Todo（待搬运到 docs/development/README.md 的「待办与未确定事项」表）
// ============================================================================================
//
// I006  素材已下载、界面接线已完成（本提交）；仍在有素材的机器上做两步
//        ① 跑 `node tools/inject-skins-assets.mjs`
//           ⚠️ 千万不要在没有素材的机器上跑。该脚本会**无条件重写 data/assets.json**，
//              在没有素材的机器上跑的结果是：portrait 依旧 0，而且会把 spine 字段一起丢掉
//              （spine 也依赖文件是否在磁盘上），等于把已提交的清单降级。
//           跑完应看到 data/assets.json 里出现 portrait 字段（预期 131 条），
//           test/skins.test.js 里那条 `assert.equal(withPortrait, 0, ...)` 需要同步改成 131。
//        ③ 把皮肤素材并入 `setup` 与 `npm run assets:skins`，让新机器一条命令补齐
//           （模型 164.2 MB + 立绘 15.9 MB）。
//
// I007  已由本文件的第二节完成草稿（D038）。能在无加密机器上编辑 .md 时，把第二节搬进
//       docs/development/DECISIONS.md，并按仓库惯例在 documents 索引里补链接。
//
// I008  待决定：`docs/SKINS.md` 描述的 `tools/install-skins.mjs` 与 `server/skinInstall.js`
//       （按需安装队列）在皮肤来源仓库的任何分支上都不存在，实际实现是全量内置。
//       二选一：补实现，或把文档改成与代码一致。**建议改文档**——全量内置是已经跑通并验证过的
//       路径，补一个不存在的队列只会增加风险面。
//
// I009  待决定：皮肤显示是否铺开到商店以外的界面（详情卡、手牌、临时整备区、准备区，
//       `assetUrls.js` 共 5 处调用方）。本次按用户要求只做商店。铺开前需要先评估渲染开销与
//       是否影响 m.public 载荷（D037 已测得全员穿皮肤时每次广播 +1120 B）。
//
// I010  待验证：在**有完整素材**的机器上做一次皮肤渲染确认——商店立绘、战场模型。
//       目前只在离线骨骼解析、单元测试和真实 WebSocket 层面验证过模型与数据链路，
//       **没有浏览器渲染验证**。本机没有素材也没有可用的渲染验证条件，不能拿它替代。
//
// I011  待决定：版本与发布。`APP_VERSION` 仍是 `0.2.6`，皮肤写在 CHANGELOG 的「未发布」段。
//       是否切 `0.2.7`、是否打标签，以及皮肤素材（约 206 MB = 模型 190 MB + 立绘 15.9 MB）
//       是否改走 `packs/` 或预缓存分发。
//
// I012  待决定：D039 名单是否再加状态标记。用户 2026-10-14 问过「还有什么状态」，当时只做了四个
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
// 另：本机 `git push` 与 `git stash` 会被沙箱拦截（子进程创建失败，报 error launching git），
// 推送请在普通 CMD / GitHub Desktop 里做；`git fetch` 不受影响。

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
