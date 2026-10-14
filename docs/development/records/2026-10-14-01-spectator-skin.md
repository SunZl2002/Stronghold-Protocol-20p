# DEV-20261014-01 · 观战与联防的皮肤显示

## 基本信息

| 字段 | 内容 |
|---|---|
| 开始 / 最后更新 | 2026-10-14 / 2026-10-14，Asia/Shanghai |
| 状态 | **待复现**（用户已观察到；代码侧首轮排查未能复现，需一次带版本信息的复现） |
| 类型 | 修复 |
| 分支与开始 HEAD | `capacity-20p` @ `8f6c47de`（标签 `0.2.6-skin-alpha`） |
| 上游基线 | 已合并 v0.2.6（`488db49f`），本地缓存 |
| 提交归属 | 与本文同一提交，按记录路径查询 |
| 关联 | [D037](../DECISIONS.md#d037) 默认皮肤；[皮肤集成记录](2026-10-13-02-skins-integration.md)（模拟层丢皮肤的修复 `1ff7ae8e`）；待办 I006 |

## 需求、范围与验收

用户 2026-10-14 报告两件事：

1. **观战时看到的还是原皮**，应该「看谁的就用谁的皮肤」，而现在是**都没有**（即全房间观战都看不到皮肤）。
2. **联防（UNITE）时反而都有皮肤了** —— 但按设计应该展示**玩家各自装备的**皮肤，不该是同一套。

验收标准（据用户描述推断，待确认）：

- 观战某玩家时，其场上单位用**那个玩家选择的皮肤**渲染；
- 联防战场同理，按**各参与者自己装备的**皮肤逐个渲染；
- 未装备皮肤的玩家显示原皮（D037 之后默认都装，因此正常房间里应普遍是带皮肤的）。

## 调查与决定

| 问题 | 证据或来源 | 结论及确定程度 |
|---|---|---|
| 皮肤是否进入客户端战斗的 spec（观战靠它） | 离线探针 `.cache/probe-spectator-skin.mjs`：构造 `battleInput` 形状的玩家 → `buildBattleSpec` → `createBattleFromSpec` → `unitInfo` | **已确认带上**：spec 里 `units[].skin` 保留、客户端 `Unit` 拿到、`unitInfo` 发布。spec 的两道净化（`sanitizeUnitLoadout`、`specReplacer`）都不碰 `skin` |
| 观战者收到什么 | `server/match/match/clientCombat.js` `_startMsg`：`b.start` 携带 `spec`（观战席用 `_spectatorSpec`，只剥 `contentInfo.funds`） | **已确认**：spec 连同 `players[].units[].skin` 一起发给观战者 |
| 客户端模拟时服务端有没有 battle 对象 | `clientCombat.js:41` 的字段记录写死 `battle: null`；`sim/spec.js` 注释也说明「客户端战斗不在服务端跑」 | **已确认**：`watch.js` 的 `_sendField` 依赖 `f.battle`，客户端模拟下它为 `null`，**因此 `m.field.units` 在观战（客户端模拟）时是空的**；单位由客户端用 `b.starts` 的 spec 自己建 |
| 服务端跑战斗时（boss / 联防 / 掉线托管）谁发布单位 | `server/sim/battle/events.js` `fieldMeta()` → `snapshot.js` `unitInfo`（`skin: u.skin ?? undefined`） | **已确认**：这条路带皮肤，且 `1ff7ae8e` 已修好「模拟层丢皮肤」 |
| 那用户看到的现象从何而来 | 需要复现：现象指向**客户端侧**（spec → 本地 Battle → 渲染取单位）某处没把 `skin` 传进 `UnitInfo`，或观战窗口用了另一份单位清单 | **待复现**，不能凭推断下结论 |
| 用户观察到的是哪个版本 | 复现时 **localhost:3000 服务器并未运行**（本次排查时 `/healthz` 无响应，服务器是本次才重启的） | **不能确定**：用户可能看到的是 `1ff7ae8e`（00:21 提交）**之前**的构建，也可能是之后。**这一条必须先确认**，否则会修错地方 |

**已知的关键区别**：`watch.js` 注释与 `clientCombat.js` 显示，本作有**两种战斗模式**：`mode: 'client'`（浏览器本地模拟，观战走这条）与 `mode: 'server'`（服务端跑，boss / 联防 / 托管走这条）。**两条路的单位来源不同**，这正是「观战没有、联防却有」的最可能原因。

## 实现或操作

本次**只做调查，未改任何代码**（改动会产生无法验证的猜测性提交）。

## 验证

| 命令或场景 | 环境 / 数据 / 版本 | 实际结果 |
|---|---|---|
| 离线 spec 链探针 | `node .cache/probe-spectator-skin.mjs`，v0.2.6 + `1ff7ae8e` | spec 带 `skin`、客户端 `Unit.skin` = `char_199_yak@summer#1`、`unitInfo` 发布该字段；**通过** |
| 代码路径核对 | `watch.js` / `clientCombat.js` / `events.js` / `spec.js` 阅读 | `fieldMeta()` 带皮肤；客户端模拟下 `f.battle` 为 `null` ⇒ 观战 `m.field.units` 为空 |
| 真实观战复现 | — | **未做**。需要：一个真人带皮肤 + 一个观战席，且在**当前构建**上跑 |

**验证边界**：本轮全部是离线与代码级证据，**没有**在浏览器里真实观战过。不能用它代替复现。

## 结果、遗留与接手

- 实现结果：无代码改动；确认了「服务端→spec」这一段是好的，并把怀疑范围收窄到**客户端渲染取单位**与**两种战斗模式的差异**。
- 未确定或未完成：
  1. **先确认用户看到的是哪个构建**（`1ff7ae8e` 前后），这决定问题是否已被那次修复解决。
  2. 复现需要的信息：战斗模式（普通 / boss / 联防）、观战者身份（观战席 / 被淘汰玩家 / 掉线托管）、浏览器、是否刷新过页面（页面资源有版本校验，旧页面会 409）。
  3. 复现后按 `clientCombat.js` 的 `b.start` → 客户端本地 Battle → `UnitView` 的链子定位 `skin` 在哪一步丢的。
- 提交 / 远程 / 素材 / 线上：本记录与同一提交推送；远程 `origin/capacity-20p`；**未部署**。
- 接手入口：`server/match/match/watch.js`（`_sendField` / `_watchClient`）、`server/match/match/clientCombat.js`（`_startMsg`）、`server/sim/battle/events.js`（`fieldMeta`）、`server/match/player/round.js`（`battleInput` 写 `u.skin`）、`public/js/render/app.js`（`setField` → `addInfo` → `renderInfo`）。

## 后续补充

（按日期追加复现证据与结论。）
