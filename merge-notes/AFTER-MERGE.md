# 合并后：已修到哪、还剩什么（2026-10-17 晚）

## 已通过

- **48 / 48 冲突全部解决**，0 个冲突标记；合并已提交。
- **全部 95 个被改动的 JS 文件 `node --check` 通过**。
- **D036 红线通过**：`node --test test/wire-pressure.test.js` →
  84 个 compact socket / 四个房间 / 0.8 Mbps 应用层预算 + 四个冷 br 下载，全部 OK。
- `data/assets.json` 保留我们的（中日，0 个文件缺失）。

## 还失败

`node tools/verify-20p.mjs`：

| 闸门 | 结果 | 说明 |
|---|---|---|
| 1 金标准 | 失败 | **10 个场景**的 digest 与存档不同 |
| 2 20 人容量 | 失败 | 三个用例：`boss preview / Hidden Core 单次抽取`、`八人领队战中途离开时共享池只缩不放 HP%`、`Final Assault 单人：merged team LP` |
| 3 版本一致 | 通过 | |

### 判断线索（还没查完）

- 闸门 1 的 10 个场景差异**很可能是上游 0.3.0 自己的数值改动** —— 但必须逐场景确认，
  `npm run golden:update` 是最后手段。
- `merged team LP` 指向 `server/match/finalAssault.js`。已排除：`damage()` 在
  `SharedBossPool`(109) 与 `CreditPool`(164) 是**两个不同的类**，不是重复声明。
- `SharedItemPool` 的 `scale` 仍由 `pool.js:36` 传入；`debtOf/owe/repay` 都在。
  所以 20 人分组池的“缩容”不是没接上 scale 那么简单，要实测。
- 可疑点（按优先级）：`SharedItemPool.cap()` 用 `Math.ceil(cap * scale)` 而我们保留了它 ——
  上游的 `debt` 记账是否假设 cap 是**未缩放**的原值？若是，`over/debt` 的判定基准就错了。
  这可以直接解释“八人领队战共享池”和“merged team LP”。

## 下一步

1. 先在 `test/match/` 里单跑那三个 20 人用例，拿到具体断言值。
2. 检查 `cap()` 缩放与 `debt/over` 基准是否一致（上面那条怀疑）。
3. 逐个核对 10 个金标准场景的差异来源（上游数值 vs 解冲突错）。
4. 全量 `node --test`、浏览器实测、皮肤测试。
5. 全绿后删掉 `merge-notes/` 与 `.cache/`。

## 命令

```bash
node tools/verify-20p.mjs
node --test test/wire-pressure.test.js
node tools/verify-20p.mjs --full
```
