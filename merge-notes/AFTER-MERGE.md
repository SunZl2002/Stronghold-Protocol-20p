# 合并后：剩余问题（2026-10-17 深夜）

## 已通过

```
48 / 48 冲突已解            0 个冲突标记
95 个改动的 JS 文件          node --check 全过
D036 红线                   test/wire-pressure.test.js ✅
闸门 2  20 人容量与分组库存    ✅ 通过
闸门 3  版本一致性 / 发布接线   ✅ 通过
finalAssault 15/15 · group-drafts 27/27 · pool 12/12 · player-capacity 30/30 · group-stock 7/7
```

## 闸门 1（金标准）：**只剩 2 个场景**

```
coop2-NORMAL-3         ← 我们自己多出来的偏离（上游没有重算它）
coop2-NORMAL-70-diy    ← 与上游自己的重算清单一致（#650 自选库存翻倍）
```

上游 0.3.0 的提交 25705cdf 说的是：**只有 `coop2-NORMAL-70-diy` 和 `coop2-NORMAL-5-coverage-diy` 需要重算**
（「every other scenario matches」）。

所以 `coop2-NORMAL-70-diy` 的差异**是预期的**（#650 改了我们私有自选库存的容量，我们已经采纳）。
**但 `coop2-NORMAL-3` 是我们独有的偏离**，需要查清楚：要么是解冲突时改变了 vanilla（1-4 人）行为，
要么是我们分支本来的差异在上游重算金标准后暴露了出来。

### `coop2-NORMAL-3` 的差异细节（实测）

```
.end.teamLp         50 → 71
.end.virtualMs      116900 → 119900
.rng.shop           486 → 463
.rng.bots           21596 → 21897
.rng.meta           2 → 22
.rounds[0].ai_1.deployed   3 → 4
.rounds[0].ai_1.board      c5e8ecc5 → 27a9316b
```

`rng.meta` 差 **20** 次是很强的线索：某个路径多抽了 20 次 meta RNG。可疑处按优先级：

1. **`rollItemId` 的 `withAlso`**（本轮刚修）—— `also` 列表现在真的进入候选，`pick` 每次仍只抽一次，
   但**能抽到以前抽不到的 id** 会改变后续分支（例如获得装备 → 触发效果 → 再抽）。这很可能就是它。
2. `acquireItem` 的 `displayed` 路径（#624）—— 多出来的获得会改变后续 RNG。
3. `poolCopies` 的 co-op 倍率（#650）—— 影响候选池大小，进而影响 `pick` 的结果。

### 判断方法（下一轮）

```bash
# 1. 只在我们的 HEAD 上替换一个变量再跑，看差异是否消失
# 2. 或者：把 test/golden/matches.json 里 coop2-NORMAL-3 的 digest 用 `node tools/golden.mjs --scenario coop2-NORMAL-3`
#    重新算出来，逐字段对照上面的差异
```

**注意**：`npm run golden:update` 是**最后手段**。先用它之前必须能解释每一个字段的差异，
否则等于把真 bug 固化成基线。

## 之前几轮修掉的（备忘，都在 git 历史里）

1. `settle.js` —— `creditedKillsOf(up)` 在循环外引用循环变量 → 每次结算抛 ReferenceError → 对局第 1 轮就死。
2. `phases.js` —— `startDraftTurn` 留着上游单组的全局收尾 → 第一组打完整个草稿就结束（10 人桌 `d.order` 只有 4 条）。
3. `spDraft.js` —— `rollItemId` 我们的早返回在前、上游 `also` 实现在后成了死代码 → 突变细胞永远抽不到。
4. `items.js` —— `releaseItemStock` 用 `Match.itemPool`（第一组）还款 → 还错池子 → `debt > overage` 不变量崩。
5. 7 个「都留」拼坏的文件（语法级）。
6. `index.js` / `routes.js` 的运行期缺失（`startedAt` / `assetCache` / 残留 `track(res)`）。

## 全绿之后

- 全量 `node --test`
- 浏览器实测（皮肤、弹幕、官方特效、插件）
- `node tools/verify-20p.mjs --full`
- 删掉 `merge-notes/` 与 `.cache/`
