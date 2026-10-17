# 合并后待修（2026-10-17）

合并已提交：`16f232ff`。**48 个冲突全部解决、0 标记**，但有 7 个文件语法坏，
全部来自 `resolve-both.mjs` 的「纯叠加 → 两边都留」假设 —— 那几个文件里两边**各自声明了同名成员**，
拼在一起就是重复声明 / 孤儿代码。

## 坏的文件（`node --check` 失败）

```
public/js/ui/gameLogic/settings.js
public/js/ui/stats.js
server/match/effectsMeta.js
server/match/invariants.js
server/match/match/phases.js
server/match/match/spDraft.js
test/match/runner.test.js
```

**同一个模式**：`SharedItemPool` 那种 —— 一个类里出现两个 `constructor` / 两个同名方法。
`server/match/pool.js` 已用这种方式修好（保留我们的 `scale` + 上游的 `debt`），可作为范例。

## 修法

对每个文件：找到重复的成员，**合并成一个**（两边字段/分支都要），而不是留两份。
`node --check <file>` 通过后再跑下一项。

## 之后的验证顺序

1. `node --check` 全过（`git show --name-only --pretty=format: HEAD` 过滤 `.js`）
2. `node --test test/wire-pressure.test.js` —— **D036 红线**
3. `node tools/verify-20p.mjs` —— 闸门 2 是 20 人特性，闸门 1 失败可能只是上游数值改动（要逐场景确认）
4. `node --test` 全量
5. 浏览器实测

## 注意

- `data/assets.json` 保留我们的（中日），已提交。
- `merge-notes/` 里 13 个 resolve 脚本的「都留」策略对这 7 个文件**不适用**，修好后请更新 `resolve-both.mjs`
  或把它们移出该脚本。
