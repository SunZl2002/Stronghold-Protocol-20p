# 合并后：剩余问题与已定决策（2026-10-17 晚）

## 已通过

```
48 / 48 冲突已解          0 个冲突标记
95 个改动的 JS 文件        node --check 全过
D036 红线                 test/wire-pressure.test.js 通过
finalAssault.test.js      15 / 15
group-drafts.test.js      27 / 27
闸门 3（版本一致性）        通过
```

## ✅ 已定决策（用户，2026-10-17）

**库存耗尽时的商店行为：采纳上游 #624。**

> 已经在界面上展示的装备，库存耗尽也照样能买；差额记成 `acquireItem` 的「欠账」（`itemPool.debt`）。
> **不**保留我们分支的 `SOLD_OUT` 拒绝。

### 代码侧：已经是对的

- `server/match/player/acquire.js` — `displayed` 参数 + `debt` 记账已在（我们只在它旁边加了自己的
  `noPool` 固定礼物标记，池用 `itemPoolFor(this)` 分组读取）。
- `server/match/player/economy.js` / `prep.js` — 我们那两个 `canGain` 库存门已删除，正是 #624 的行为。
- `server/match/pool.js` — `SharedItemPool` 同时有我们的 `scale` 和上游的 `debt/owe/repay`。

### 测试侧：要改 `test/match/group-stock.test.js`（**唯一还没做的**）

用例 `exhausting one equipment group gates only its shop, reward, golden upgrade and effect rolls`
（第 62 行起）有 4 处还是旧语义：

| 行 | 现在断言 | 应改成 |
|---|---|---|
| 76 | `a.buy(0).error === 'SOLD_OUT'` | **购买成功**（`ok`），`funds` 20 → 19，`m.itemPoolFor(a).debtOf(PACK) === 1` |
| 77 | `a.funds === 20` | `19` |
| 78 | `a.pickReward(0).error === 'SOLD_OUT'` | **领取成功**（reward offer 也是「已展示」，prep.js 已按 #624 放行），`offers.length` 随之减少 |
| 79 | `a.offers.length === 1` | 按上一条调整 |

**必须保留的组隔离断言**（本分支的核心，不要动）：

```
m.itemPoolFor(b).left(PACK) === 2       ← 另一组不受影响
a.upgradeItem(x) === false              ← 金色升级仍被库存门拦住
a._rollItemSlot() === null              ← 抽卡仍排除空库存
b._rollItemSlot().id === PACK
ca.rollItem({tier:5}) === null          ← 效果 roll 同样
cb.rollItem({tier:5}) === PACK
ca.rollPool('test_group_item') === null
cb.rollPool('test_group_item') → { kind:'item', id:PACK }
checkInvariants(m)                      ← debt ≤ overage 的不变量必须成立
```

### 其他因此受影响的失败（同源，改完再看）

```
nine players: a five-player group does not expand private DIY stock
twenty client-combat participants finish a complete match with grouped pools and no engine errors
twenty players: buying, merging, selling and eliminating DIY / stand-in pieces …
effect-only items are never shop items: not in shopItemsByTier, never in the item slot, the pools or the 机变 supply
```

## 闸门 1（金标准，10 个场景 digest 不同）

**很可能是上游 0.3.0 自己的数值改动**，但必须逐场景确认后在
`docs/development/records/` 里写明原因。`npm run golden:update` 是最后手段，不是第一步。

## 下一步顺序

1. 按上表改 `group-stock.test.js`（**只改那 4 行，保留组隔离断言**）。
2. 重跑 `node tools/verify-20p.mjs`，看闸门 2 是否清掉。
3. 逐个核对 10 个金标准场景。
4. 全量 `node --test`、浏览器实测、皮肤测试。
5. 全绿后删掉 `merge-notes/` 与 `.cache/`。
