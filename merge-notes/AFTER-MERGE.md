# 0.3.0 合并：状态（2026-10-18 凌晨）

## ✅ 三道闸门全绿（不变）

```
闸门 1  通过    金标准 288/288
闸门 2  通过    20 人容量与分组库存
闸门 3  通过    版本一致性 / 发布接线
```

## 全量测试的分目录快照

| 目录 | 结果 | 备注 |
|---|---|---|
| `test/content` | **2346 / 0** | ✅ |
| `test/sim` | **923 / 0** | ✅ |
| `test/render` | **875 / 0** | ✅ |
| `test/match` | 1097 / 13 | 见下 |
| `test/studio` | **83 / 6** | 从 52/37 修上来的（`index.js` 漏传 `studio`）|
| `test/plugins` | 267 / 9 | 见下 |

### 已修：`index.js` 漏传三个上游选项（studio 37 个失败的根因）

`createRequestHandler` 的合并版只留了我们的选项，**丢了上游的 `csp` / `studio` / `trustedRuntime`**。
没有 `studio`，请求永远不会被 studio 认领，落到 GET/HEAD 闸门 → **405**，
而测试期望 404/400。**`test/studio` 52/37 → 83/6。**

### 已修：三处 `while` 缺 `// loop-cap:` 注释

0.3.0 新增的约定（有测试）。我们的 `phases.js` / `spDraft.js` / `unite.js` 各有一处。

### 剩余：`test/plugins` 9 个

```
GET /p/ 的缓存头：actual 'no-cache'，expected 'public, max-age=31536000, immutable'
GET /p/: 扫描后放进去的符号链接不应被跟随
a plugins folder spelled in another case than on disk still serves its files
a plugin message agrees with the schema（actual false, expected true）
named operator / band / hammer / 黑云 / warden loops stop at the official cap（还要补 loop-cap）
整文件挂起：contentBattle / csp / dsl-data / script-integration（都只报 'test failed'）
```

**下一个该看**：`/p/` 的缓存策略 —— `static.js` 里我合并了上游的 `IMMUTABLE_CACHE` / `isNotModified`，
但 `/p/` 走的分支可能还在用我们旧的 `no-cache`。`isNotModified`/`IMMUTABLE_CACHE` 目前只出现在 import 里
（各 3 次），**很可能就是没接线**。


## 用「合并前提交」做的对照（决定性）

在 `..\sp-premerge`（= `48ad2bc1`，合并的第一个父提交）跑同一批文件：

| 文件 | 合并前 | 合并后 | 结论 |
|---|---|---|---|
| `test/match/runner.test.js` | 15/15 过 | 20/20 过 | ✅ 上游加了 5 个，全过 |
| `test/match/merge.test.js` | 13 过 **1 败** | 14 过 **1 败** | ⚠️ **同一个失败**：`h.sched.runUntil is not a function` → **与合并无关**，测试用了一个不存在的 harness API |
| `test/match/lobby-integration.test.js` | 5/5 过 | 有失败 | ⚠️ 合并相关（见下）|
| `test/match/connection.test.js` | 13/13 过 | 有失败 | ⚠️ 合并相关（见下）|
| `test/match/plugin-host.test.js` | **文件不存在** | 有失败 | 0.3.0 新增（子进程 match host）|

`plugin-host` 里 **「a whole match of AI seats in its match host (a child process)」是通过的（7.8 s）** ——
所以子进程环境没问题，`the room keeps its content set` 是**真断言失败**。

## 所以现在的分类（修正上一轮）

### ❌ 与合并无关（可以先忽略）
- `consume-on-equip built-ins`（`merge.test.js:276`）—— 合并前后都 `runUntil is not a function`。
  要么给 `VirtualScheduler` 补 `runUntil`，要么这个测试本来就没跑过。

### ⚠️ 合并相关，值得查（按优先级）

> **探针结果（重要）**：把断言的 `st.content` / `back.content` 打出来：
>
> ```
> ST   {"cs":"205305c6…","vanilla":false,"plugins":[{"id":"rules",…}]}
> BACK {"cs":"1a71d6ad…","vanilla":true,"plugins":[]}
> ```
>
> **房间的 content 被重置成了 vanilla**，不是「另一个自定义集」。而且**每次跑失败的用例会换**：
> 上一轮是 `a match host that runs out of memory`，这一轮是 `the watchdog: a worker that stops beating…`
> —— 说明这是**竞态**，不是稳定的逻辑错误。
>
> **已排除**：`resolveContent` 的 4 个调用点、`room.content` 的 4 个赋值点（320/479/811/817/994）、
> `onMatchEnd`（不动 content）、以及 `activeHumans().length === 0 → disposeRoom('empty')` 这两处
> 都与上游**完全一致**。
>
> **下一个该看的**：host 崩溃那一刻玩家是否被短暂判为「不在房间里」——
> 若 `activeHumans()` 变 0，`onMatchEnd` 会 `disposeRoom('empty')`，玩家随后收到的是**新房间**的 vanilla 状态，
> 正好就是上面 BACK 的样子。方向：`startGrace` / 断线判定 / proxy 崩溃时的 session 处理。

1. **`plugin-host`（watchdog / out-of-memory 两个用例）** —— 见上。
2. **`lobby-integration`：「co-op spectator removed by the host while the match runs」** ——
   合并前 5/5 过，合并后失败，说明 `room.removeSpectator` / seat 释放的语义被改了。
3. **`connection`：「public throttling starts at broadcast time…」** —— 计时/节流语义。
4. **`rehearsal capabilities` ×2** —— start effects 不能写玩家字段或实时波次；可能和
   `effectsMeta` 的权限/隔离有关。
5. **`verify` 系列 2 个**：「lets an unrelated real timer run between battle slices」。

### 环境/规模
`test/e2e`（`real-time co-op over websockets with the real simulation` 14 s+）等大用例还没单独跑过。

## 这轮之前的修复（都在 git 历史里）

`bands/meta.js` 重复 grant（金标准根因）、Boss 池的 `maxHp` 丢失、`wire` 恒 null 导致 `b.result` 从不发出、
`settle.js` 的 `up` 越界、`phases.js` 的全局草稿收尾、`spDraft.js` 的死代码 `also`、`items.js` 还错池子、
7 个「都留」语法损坏、`index.js`/`routes.js` 运行期缺失。

## 下一步

1. 查 `plugin-host` 的「the room keeps its content set」→ 大概率在 `lobby.js` 的 content 生命周期
2. 查 `lobby-integration` 的观战者移除
3. 其余按需
4. 最后：浏览器实测（皮肤 / 弹幕 / 作战统计 / 官方特效 / 插件）+ `verify-20p --full`
5. 全绿后删 `merge-notes/`、`.cache/`，并移除 `..\sp-premerge` worktree：
   `git worktree remove ../sp-premerge --force`

## 已知代价 / 故意偏离（不变）

- 英/韩/本土配音无声音（只有中日，`data/assets.json` 保留我们的）
- `public/assets/local` 不存在 → 官方战场降级
- 多波联防保留全部奖励、Boss 池第三参数 `maxHp` —— 都是 20 人契约，故意与上游不同
