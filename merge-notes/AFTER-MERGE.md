# 0.3.0 合并：状态（2026-10-17 深夜）

## ✅ 三道闸门全绿

```
node tools/verify-20p.mjs
  闸门 1  通过    金标准（288 个场景全部匹配）
  闸门 2  通过    20 人容量与分组库存回归
  闸门 3  通过    版本一致性 / 发布接线
  结论：全部通过。

D036  test/wire-pressure.test.js            ✅
48 / 48 冲突已解 · 0 个冲突标记 · 95 个改动 JS 文件 node --check 全过
```

## ⚠️ 全量测试还差 13 个（`test/match` 1113 个里 1097 过）

`test/match` 一开始 25 个失败，已修到 13。剩下的按类：

### A. 需要真子进程 / Worker（环境相关，可能不是 bug）
```
a match host that runs out of memory (a child process)
match hosts in rooms (P1c): verification, the watchdog, crashes
the watchdog: a worker that stops beating is terminated …
runner on a real Worker reports its simulated cs and cached detail stats
data set: Worker and in-page snapshots/events/results match every batch
SP_VERIFY=all in its match host: a result naming the room's content …
```
**先确认这些是不是本机环境限制**（没有可用 Worker / 子进程超时），再判断是不是合并引入的。
判据：在合并前的提交上跑一遍同一批用例。

### B. 计时敏感（可能是 flaky）
```
all verification lets an unrelated real timer run between battle slices
sample verification lets an unrelated real timer run between battle slices
runner: true infinite script and slow data step terminate, stop reports …
public throttling starts at broadcast time even when building the previous snapshot was delayed
```
同一判据：在合并前的提交上跑一遍。

### C. 看着像真 bug（优先级最高）
```
consume-on-equip built-ins: 盟约之币 funds, 随身身份牌 layers, 人事部文档 cap 9, 博士投影 promote; Arts limit
rehearsal capabilities: official-registry start effects cannot write any player field or the live wave
rehearsal capabilities: plugin start effects cannot write any player field or the live wave
co-op spectator removed by the host while the match runs …
real-time co-op over websockets with the real simulation …
```
`consume-on-equip` 在 `test/match/merge.test.js:276`，断言链从 `ps.funds === 1`（盟约之币）
到 `ps.deployCap === 9`（人事部文档）到 `a.id === goldenId`（博士投影）。
**先逐条打印这些值，看第一个不匹配的是哪个** —— 大概率是效果分发（`effectsMeta`）里某条内置规则被合并掉了。

`rehearsal capabilities` 那两个说的是「start effects 不能写玩家字段或实时波次」，
可能与我们保留的 `noPool` / 效果权限有关。

## 这轮修掉的（都在 git 历史里）

| # | 文件 | 症状 |
|---|---|---|
| 1 | `bands/meta.js` | **同一 grant 跑两遍** → 金标准 2 个场景偏离（`rng.meta` +20、`ai_1` 多放一个单位、羁绊层翻倍）|
| 2 | `simHost.js` / `runner.js` | `LocalBossPool.sync` 的第三参数 `maxHp` 被丢掉 → 20 人 Boss 池不缩小 |
| 3 | `simHost.js` / `runner.js` | `wire` 永远 null → `deliveryType` 恒为 `b.yield`，**b.result 一个都不发** |
| 4 | `settle.js` | `creditedKillsOf(up)` 循环外引用 → 每次结算抛 ReferenceError → 对局第 1 轮就死 |
| 5 | `phases.js` | 上游单组的全局收尾留下 → 第一组打完整个草稿就结束 |
| 6 | `spDraft.js` | 我们的早返回在前、上游 `also` 成死代码 → 突变细胞抽不到 |
| 7 | `items.js` | 还款用第一组的池 → 还错池子 |
| 8 | 7 个文件 | 「都留」造成语法级损坏（`pool.js` 两个 constructor 等）|
| 9 | `index.js` / `routes.js` | 运行期缺失（`startedAt` / `assetCache` / 残留 `track(res)`）|

## 剩下的验证

1. 上面 A/B/C 三组逐一确认
2. 浏览器实测：皮肤（`skinsOn` / 一键装备）、聊天弹幕、作战统计、官方特效、插件系统
3. `node tools/verify-20p.mjs --full`
4. 全绿后删掉 `merge-notes/` 与 `.cache/`

## 已知的、可接受的代价

- `data/assets.json` 保留我们的（中日）。0.3.0 的英/韩/本土配音在此分支**没有声音** ——
  磁盘上没有那 5,712 个文件，且 `tools/assets/plan.mjs` 按设计只计划 cn/jp。
- `public/assets/local` 不存在 → 0.3.0 的战场会降级；要补需要本地客户端 + 上游 `tools/local-extract/extract.py`。

## 两处**故意**与上游不同

1. **多波联防保留全部奖励**（`settle.js` 按 `uniteResults` 累计）——
   `test/match/unite.test.js` 的用例名就是「retain all rewards」。
2. **Boss 池的第三参数 `maxHp`**（20 人房里有人离开时池子缩小）—— 上游的单波次模型里没有这件事。
