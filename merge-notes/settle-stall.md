# 结算卡住（SETTLE 之后不回 PREP）

> **已解决（2026-10-19）**：根因是 `Lobby.welcomeInfo()` 少了 `return info;`（合并时丢的），每个 `welcome` 都是空的，
> 客户端因此拿不到内容标识 → 拒绝权威 → 从不发送 `b.result` → 服务端等满时限后重算。
> 修复提交 `7e866198`。下面的记录保留，作为「这一类 bug 怎么查」的过程材料。

## 真正的根因链

```
welcomeInfo() 没有 return  →  welcome 里没有 content
  →  客户端 store.content = null  →  vanillaCs() = null
  →  csAccepted() = false  →  e.authoritative = false
  →  finished() 的发送分支被跳过  →  从不发 b.result
  →  服务端等「战场时长 + RESULT_GRACE_MS(15s)」
  →  server takeover … (timeout)  →  服务端重算整场战斗  →  结算慢
```

**关键教训**：这条链上从未出现任何异常或日志 —— 每一环都是「合法地跳过」。最终定位靠的是**在两端的入口各打一行日志**
（`finished()` / `deliver()` / `_onResult` 全静默 → 再往上游追到 `csAccepted` → 再追到 `welcome`）。

---

以下是最初的现象记录与排查过程（历史）。

## 现象

- 单人局（`独立模拟`）打完第 1 轮战斗后，比赛停在 `phase = SETTLE, round = 1`，永远不进第 2 轮预备。
- 客户端一直显示 `inMatch: true, phase: "SETTLE", result: false`。
- 服务端要等到「战场时长 + `RESULT_GRACE_MS`（15 秒）」才靠超时接管，所以玩家感觉「每局结束都要等很久」。
- 复现用例：`SP_REAL_E2E=1 SP_REAL_ROUNDS=1 node --test --test-name-pattern=solo test/ui/real.e2e.test.js`
  → `Error: solo: timed out waiting for prep 2 (last: {… "phase":"SETTLE","round":1 …})`

## 三个对照实验（关键）

| 代码 | 同一个用例 |
|---|---|
| 合并前 `2d883db2`（工作树 `../sp-prem`） | ✅ 通过 |
| 纯上游 `d905c146`（工作树 `../sp-upstream31`） | ✅ 通过 |
| 合并后（HEAD） | ❌ 卡在 SETTLE |

两边都好、只有合并结果坏 —— 缺陷是**解冲突引入**的，不是上游的，也不是我们 20 人特性本身。

## 已排除的假设（都做过实验，不要重复）

| 假设 | 实验 | 结论 |
|---|---|---|
| `settle()` 之后的 3 秒定时器没装上 | `setDeadline` 入口/armed 日志 | ❌ 装上了：`armed ms=3000`，`frozen=false` |
| 定时器被 `Match.dispose()` 取消 | `FreezeScheduler.clearTimeout` 深栈 | ❌ 只有测试结束时 `Lobby.shutdown` 那一次 |
| 比赛被提前 dispose | `Match.dispose()` 入口栈 | ❌ 整场只在 `srv.close()` 时 dispose 一次 |
| 事件循环被 CPU 卡死 | `node --cpu-prof` + 分析热点 | ❌ 85 秒里最热函数仅 456 ms |
| `RealScheduler` 的 `h.unref?.()` | 去掉后重跑 | ❌ 仍然失败 |
| 同步 IO 阻塞 | `git grep readFileSync/execSync/spawnSync` | ❌ 结算路径上没有 |
| 调度器被冻结 | `[src]` 探针 | ❌ `frozen=false`，`source=RealScheduler`，`virtual=false`，`disposed=false`，`owns=true` |
| 结算被调用两次（竞态） | `settle()` 入口栈 | ❌ 只调用一次，来自 `_afterCombat` |
| 在 timer 回调里装载导致重入 | 改用 `setImmediate` 装载 | ❌ 同样不触发（`armed=true` 但不回调） |
| `clientCombat.js` 的语义差异 | 换成上游那份 | ❌ 仍然失败 |
| `infra.setDeadline` 被我改坏 | 与合并前逐行对比 | ❌ 语义等价（只多了 upstream 的 test 钩子 + `gameNow()`） |

## 目前最矛盾、也是唯一没解释的一点

**同一个原生 `setTimeout`，在两次运行里结果相反：**

- 一次在 `settle()` 里放 `setTimeout(() => this.afterSettle(), 3000)`：**触发了**，`afterSettle` 跑完，
  `startRound(2)` → `_startRoundAfterOffers(2)` 的 A/B/C/D/E（重建工作）全部跑完。
- 另一次同样的兜底：**完全没触发**。

同时观察到：

- 结算后 `sched.handles` 从 1 变 0（句柄消失），但 `_phaseTimer` 仍非空、`phase` 仍是 SETTLE。
- 结算后放的原生 `setInterval` 心跳只跳了 1 次就停（说明循环不再推进定时器）。
- CPU profile 显示这段时间没有 JS 在跑（说明不是 JS 忙等）。

三者合起来指向：**事件循环在停摆，但既不忙、也没有异常** —— 这在纯 JS 层很难解释，需要考虑原生层
（同步 IO / 阻塞式系统调用 / 子进程管道）或 Node 定时器被替换的可能。

## 下一步建议（按性价比排序）

1. **在 `settle()` 里同时挂一个 `setInterval` 和一个 `setTimeout`，并打印 `process._getActiveHandles()`**
   —— 看停摆瞬间句柄列表里还有没有 Timer；有 Timer 但不跳 = Node 定时器层被破坏，没有 = 卡在原生调用。
2. **`strace`/Procmon 级别观察**：停摆期间进程是否在 `read`/`write` 系统调用上阻塞（比如命名管道、
   我们 fork 的 `server/announcementNotices.js` 写文件、或 asset 缓存）。
3. **逐块二分**：整文件替换不可行（上游 `phases.js` 缺 `installDraftFacade`），
   所以要按「函数级」二分：把 `_startRoundAfterOffers` / `afterSettle` / `settle` 三个函数
   逐个替换成上游实现（保留我们的导出），每换一个跑一次 e2e。

## 与「等很久」的关系

即使 SETTLE 不卡，玩家感知的延迟还有另一个来源：客户端战斗的截止时间 =
`f.startAt + (战场时长 / gameSpeed) * 1000 + RESULT_GRACE_MS(15s)`
（`server/match/match/clientCombat.js:142`）。客户端若未及时上报 `b.result`，服务端就要等满这个时限再接管重算。
现场日志里出现过 `server takeover … (timeout)`，与这条一致。**这一条与 SETTLE 卡住是两个独立问题，
修任何一个都能缩短等待，但要都修才彻底。**
