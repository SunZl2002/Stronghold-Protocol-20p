# 0.3.0 合并：状态（2026-10-17 夜）

## ✅ 全部闸门通过

```
node tools/verify-20p.mjs
  闸门 1  通过    金标准 / golden — 1-4 人玩法必须与上游逐位一致（288 个场景全部匹配）
  闸门 2  通过    20 人容量与分组库存回归
  闸门 3  通过    版本一致性 / 发布接线
  结论：全部通过。
```

```
D036 红线  test/wire-pressure.test.js             ✅ 84 socket / 0.8 Mbps / 冷 br 下载
48 / 48 冲突已解                                  0 个冲突标记
95 个改动的 JS 文件                               node --check 全过
finalAssault 15/15 · group-drafts 27/27 · pool 12/12
player-capacity 30/30 · group-stock 7/7
```

## 金标准那个偏离：根因是一个「两边都留」的重复循环

`server/sim/content/bands/meta.js` 的 `preparation_start_gain_chess_from_round`，两边**写的是同一条 grant**，
「都留」让它跑了**两遍** → 每个棋子发两次 →

```
ai_1.deployed  3 → 4          （机器人多放了一个单位）
kazimierzShip  0/2 → 0/4      （羁绊层数翻倍）
rng.meta       2 → 22         （多出来的 20 次抽取）
teamLp         50 → 71
```

改成一个循环：上游的 `timesOf` 计数 + 我们的 `noPool` 固定礼物标记。

## 两处**故意**与上游不同（不是遗留，是 20 人的契约）

1. **多波联防保留全部奖励** —— `settle.js` 按 `uniteResults`（`plan.history` + 最终结果）累计金币与击杀。
   上游只算最终的单个结果（它只有一个波次）。20 人房一回合跑好几个联防波次，
   `test/match/unite.test.js` 的名字就是「retain all rewards」。
2. **`uniteRan` 门** —— 这一条我们**改成了上游的写法**：联防完全没跑成（合成结果）时，按漏怪自己的数计费，
   而不是按存活人数。这是真的 parity 修正。

## 这轮修掉的全部真 bug（都在 git 历史里）

| # | 文件 | 症状 |
|---|---|---|
| 1 | `settle.js` | `creditedKillsOf(up)` 在循环外引用循环变量 → 每次结算抛 ReferenceError → **对局第 1 轮就死** |
| 2 | `phases.js` | `startDraftTurn` 留着上游单组的全局收尾 → **第一组打完整个草稿就结束**（10 人桌 `d.order` 只有 4 条） |
| 3 | `phases.js` | `if (g.done)` 缺 `}` → 后面的方法被吞 |
| 4 | `spDraft.js` | `rollItemId` 我们的早返回在前、上游 `also` 实现成了**死代码** → 突变细胞永远抽不到 |
| 5 | `spDraft.js` | 缺一个 `}` + `rollItemId` 两个头 |
| 6 | `items.js` | `releaseItemStock` 用 `Match.itemPool`（第一组）还款 → **还错池子** |
| 7 | `bands/meta.js` | **同一 grant 跑两遍** → 金标准 2 个场景偏离 |
| 8 | 7 个文件 | 「都留」造成语法级损坏（见 `pool.js` 的两个 constructor） |
| 9 | `index.js` / `routes.js` | 运行期缺失（`startedAt` / `assetCache` / 残留 `track(res)`） |

## 还没做的验证

1. 全量 `node --test`（正在跑）
2. 浏览器实测：皮肤（`skinsOn` / 一键装备）、聊天弹幕、作战统计、官方特效、插件系统
3. `node tools/verify-20p.mjs --full`
4. 全绿后**删掉 `merge-notes/` 与 `.cache/`**

## 已知的、可接受的代价

- `data/assets.json` 保留我们的（中日双语）。0.3.0 的英语/韩语/本土语配音设置在新分支上**没有声音** ——
  磁盘上没有那 5,712 个文件，且 `tools/assets/plan.mjs` 按设计只计划 cn/jp。
- `public/assets/local`（官方战场场景/特效）不存在 → 0.3.0 的战场会降级；要补需要本地客户端 + 上游的
  `tools/local-extract/extract.py`。
