# 合并上游 0.3.0 —— 进度与复现步骤

**这不是产品代码，是一次大合并的工作笔记。** 合并完成后请删掉整个目录。

## 状态（2026-10-16）

```
上游:  sganggs/Stronghold-Protocol  master = c24e17ee  (v0.3.0, 390 个新提交)
我们:  本分支 capacity-20p            领先 147 / 落后 390
冲突:  48 个文件 / 97 个冲突块
已解:  44 个      ← 本目录的脚本可重放（含 choices.js / assetCache.js / units.js / test/client-static）
剩余:  10 个      ← 见下「剩余清单」
```

**分支本身没有被改动**：合并被中止，`HEAD` 是 `09704bbd`，tag `v0.2.6-skin` 在位。

## 一条重要结论（省下大量重复分析）

**97 个冲突块里，绝大多数是「两边往同一位置各加各的」** —— 不是真取舍。解法是**都留**：

- `public/i18n/*.json`：**键的并集**（两边都只加 msgid）
- `public/js/ui/settings.js`：**开关都留**（我们的皮肤/弹幕 + 上游的秘术师能量/作战统计）
- `public/js/ui/gameLogic/settings.js`：**设置键并集**
- `server/net.js`：`HEAVY_TYPES` **并集**
- `shared/protocol.js`：`b.yield`（我们）+ `cs`/`b.rehearsalResult`（上游）
- `public/js/screens/room.js`：`canStart` **合并双方条件**
- `public/js/main.js`、`public/js/ui/hud.js`、`server/http/files.js`、`server/http/routes.js`：都留
- 14 个文档文件：都留

**真正需要判断的只有 `server/match/player/*` 那 3 个**（20 人容量经济 vs 上游 #624 修复）。

## 复现到「已解 44 个」

```bash
cd <repo>
git merge --no-commit --no-ff upstream/master

# 机械层（按顺序，都是一次性脚本，读冲突文件按行号/键名处理）
node merge-notes/resolve-i18n.mjs        . public/i18n/en.json public/i18n/ja.json public/i18n/ko.json public/i18n/zh-TW.json
node merge-notes/resolve-additive.mjs    .          # .gitignore + CHANGELOG.md
node merge-notes/resolve-both.mjs        .          # 14 个纯叠加文件
node merge-notes/resolve-gl-settings.mjs .          # ui/gameLogic/settings.js
node merge-notes/resolve-proto-net.mjs   .          # shared/protocol.js + server/net.js
node merge-notes/resolve-manual5.mjs     .          # main.js / hud.js / room.js / http/files.js / http/routes.js

# 生成物：不要手工合
git checkout upstream/master -- package-lock.json && npm install
git checkout --ours -- data/assets.json             # 保留我们的结构（见下）

git add -A   # 36 个冲突消失，剩 14 个
```

> 脚本的第一个参数是**仓库根目录**（`.` 即可，脚本用它拼路径）。

**逐个文件看冲突**（比翻几万行文件快得多）：

```bash
node merge-notes/show-conflicts.mjs . server/lobby.js server/index.js
```

## 两个必须记住的判断

### 1. `data/assets.json` 保留**我们的**结构（用户 2026-10-16 决定：「中日就行」）

上游 0.3.0 的 `audio` 有 **6 棵树**：`voice` / `voiceJp` / `voiceEn` / `voiceKr` / `voiceNative` / `voiceNativeLangType`。
**我们磁盘上只有 cn + jp**，缺 en(2548) + kr(2548) + native(616) = **5712 个文件 ≈ 160 MB**。

而且 **`tools/assets/plan.mjs` 按设计只生成 cn/jp 两棵树**（`voiceTree(voiceLang)` + `voiceTree(VOICE_JP_LANG)`），
所以**下载工具根本计划不出 en/kr/native** —— 试了三次，`downloadedBytes: 0`。

**决定：只要中日。** 因此保留我们的 manifest（cn/jp + 皮肤 174），**不要**上游的 en/kr/native 引用，
这样客户端不会去请求不存在的文件。副作用（已知、可接受）：**0.3.0 的英语/韩语/本土语配音设置在新分支上没有声音。**

我们的 manifest 引用的 12293 个文件，**磁盘上一个不缺**。

### 2. `version` 字段会自动变成 `0.3.0`

`package.json` 本身不冲突（我们改 `happy-dom`，上游改 `ses`/`acorn`/version），所以合并后
`package.json` 与 `APP_VERSION` **自动变成 0.3.0**。**I011（版本策略）要重新决定**：要不要 `0.3.0-20p`，
以及刚推的 `v0.2.6-skin` 怎么处理。

## 剩余 10 个（按建议顺序）

**第一批 · 非对局逻辑**

| 文件 | 块 | 性质 |
|---|---|---|
| `test/client-static.test.js` | 1 | 清单断言，多半是并列 |
| `test/package.test.js` | 2 | 同上 |
| `server/match/match/platform.js` | 3 | 平台逻辑 |
| `server/match/choices.js` | 2 | 选择 |
| `public/js/assetCache.js` | 1 | 文件头整块（上游重写） |
| `public/js/render/units.js` | 2 | 含**皮肤模型** |
| `public/js/screens/game.js` | 3 | 含**弹幕层挂载**与皮肤注入 |
| `public/js/battle/runner.js` | 7 | 上游新的 Worker 模拟宿主 |
| `server/http/static.js` | 5 | 含**宽松哈希段**修复 |

**第二批 · 服务端大文件**

| 文件 | 块 | 性质 |
|---|---|---|
| `server/index.js` | 8 | 含**更新公告**接线 + 上游插件系统 |
| `server/lobby.js` | 9 | 最大：**皮肤同步** + D039 名单 + 上游插件 |

**第三批 · 20 人经济取舍（需要逐条确认）**

| 文件 | 块 | 性质 |
|---|---|---|
| `server/match/player/acquire.js` | 2 | 20 人经济（`isUnlimitedGiftItem` + `noPool`）vs 上游 #624 修复 —— **两边都要留，要手工移植** |
| `server/match/player/economy.js` | 1 | 同类 |
| `server/match/player/prep.js` | 1 | 同类（上游 #624：「已展示的装备奖励不因库存耗尽消失」）|

## ⚠️ 三条「别用直觉」的教训（都实际踩过）

**1. 冲突块可能「越过」它所属的方法** —— `public/js/render/units.js` 的 `_pictureUrl` 块，
**上游侧包含 `_loadPicture` 的函数头、`url`、`old` 和它自己的 `_pic` 记录**。因此：

- **整块替换** → 删掉下一个方法的头 →孤儿代码 → `SyntaxError: Unexpected token '!'`
- **两边都留** → `skinOpt` / `entry` 重复声明 → `Identifier already declared`

→ **按内容定位那段区域并重建**（`resolve-units2.mjs` 会先校验标记位置，不符就抛错）。
**皮肤要穿四处**：`_modelEntry` 的 `spineEntry` 选项、`_pictureUrl` 的三个 `a.picture`、
`_loadPicture` 与 `_clearPicture` 两处 `_pic.key`（**两处 key 必须一致**，否则比较会认为是不同的图）。

**2. 不要依赖行号** —— 我按行号写的 `resolve-units2.mjs` 在**别的解析器先跑之后失效**
（行号移位），而 `Out-Null` 把它的 `throw` 吞了，看起来像"没生效"。
**现在的版本全部按内容定位。**

**3. `choices.js` 同类问题** —— `rollItemId` 那个块的**上游侧包含 `for` 的收尾**
（`}` + `handled = true;`），所以替换文本**不能**再带那两行，否则留下孤儿的 `if`/`}`。
（这个文件第一次重放就是这么坏的。）

## `test/client-static.test.js` 已解 —— 0.3.0 的 CSP 改动

上游把引导从内联改成外置（`bootLegacy.js` + `boot.js` 里 catch 错误），并断言 **`devices.css` 是最后一个样式表**。
**本分支做不到那条断言**：自己的功能表（announcements / asset-cache / **match-chat**）围绕它链接 ——
实测 `devices.css` 在第 18 位、`match-chat.css` 在它之后。

→ 合并后的断言：**`devices.css` 之后只能是本分支的功能表**；**同时**保留上游的引导断言
（外置 `bootLegacy.js`、无内联 `onerror`）。**两边都留。**

上游把引导从内联改成外置（ootLegacy.js + oot.js 里 catch 错误），并断言 **devices.css 是最后一个样式表**。
**本分支做不到那条断言**：自己的功能表（announcements / asset-cache / **match-chat**）围绕它链接，
实测 devices.css 在第 18 位、match-chat.css 在它之后。

→ 合并后的断言：**devices.css 之后只能是本分支的功能表**；**同时**保留上游的引导断言
（外置 ootLegacy.js、无内联 onerror）。两边都留。

## 合并后必做的验证

1. **D036 红线**：`server/http/websocket.js` **没有冲突**，所以 `WS_COMPRESSION` 会自动保留 ——
   但**仍必须跑 `test/wire-pressure.test.js`**（84 连接 / 0.8 Mbps / p95 < 2s）。
2. 全套测试：`node --test`（注意 `test/` 里也有冲突文件）。
3. `node tools/verify-20p.mjs`（三道闸门）。
4. 皮肤：`test/skins.test.js` + 浏览器实测。
5. **`public/assets/local` 不存在** —— 上游 0.3.0 的官方战场场景/特效依赖它，合并后**战场会降级**。
   要补的话需要跑上游的 `tools/local-extract/extract.py`（需要本地客户端）。
