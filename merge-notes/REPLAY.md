# 复现：把合并推进到「已解 46 个」

在上游合并的基础上按顺序跑。**全部在仓库根目录执行**（`$PWD` 即仓库根）。

```bash
git merge --no-commit --no-ff upstream/master

# 机械层
node merge-notes/resolve-i18n.mjs        "$PWD" public/i18n/en.json public/i18n/ja.json public/i18n/ko.json public/i18n/zh-TW.json
node merge-notes/resolve-additive.mjs    "$PWD"   # .gitignore + CHANGELOG.md
node merge-notes/resolve-both.mjs        "$PWD"   # 14 个纯叠加文件
node merge-notes/resolve-gl-settings.mjs "$PWD"   # ui/gameLogic/settings.js（设置键并集）
node merge-notes/resolve-proto-net.mjs   "$PWD"   # shared/protocol.js + server/net.js
node merge-notes/resolve-manual5.mjs     "$PWD"   # main.js / hud.js / room.js / http/files.js / http/routes.js
node merge-notes/resolve-handmade4.mjs   "$PWD"   # ui/settings.js / assets.js / gameLogic.test.js / tools/package.mjs
node merge-notes/resolve-assetcache.mjs  "$PWD"   # assetCache.js —— 两个模块合成一个文件
node merge-notes/check-duplicates.mjs    "$PWD"   # 合并模块后查重复 import/声明

# 需要「合并逻辑」而不是「都留」的
node merge-notes/resolve-units2.mjs      "$PWD"   # units.js（皮肤穿四处）
node merge-notes/resolve-choices-units.mjs "$PWD" # choices.js（上限 + player 参数）
node merge-notes/fix-choices-orphan.mjs  "$PWD"   # choices.js 的孤儿 for 收尾（必须在上一条之后）
node merge-notes/resolve-platform.mjs    "$PWD"   # match/platform.js（紧急保护 + 排练钩子）

# 生成物
git checkout upstream/master -- package-lock.json && npm install
git checkout --ours -- data/assets.json          # 见 README：只要中日，保留我们的结构

git add -A
```

跑完 **46 / 48**。**已实测**：重放后只剩 9 个带标记文件
（`test/package.test.js` + `server/match/player/*` ×3 + `runner.js` / `game.js` / `http/static.js` / `index.js` / `lobby.js`），
且 `choices.js` / `units.js` / `platform.js` / `client-static.test.js` / `assetCache.js` **全部 `node --check` 通过**。
