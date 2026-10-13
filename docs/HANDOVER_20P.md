# 交接说明：这个仓库是什么、怎么用

## 1. 一句话

这是**20 人联机版**，已经**合并了原版 0.2.5** 的全部内容（玩法、数值、bug 修复、素材变更）。
原版以后再更新，按 [development/SYNC_20P.md](development/SYNC_20P.md) 再合一次即可。

## 2. 仓库状态

| 项目 | 值 |
|---|---|
| 主线分支 | **`capacity-20p`** |
| 基线 | 20 人版作者最终版 `v0.2.4-20p.5fix`（`6a2b72bb`） |
| 已合并的上游 | `v0.2.5`（`cf7a9400`，77 提交 / 221 文件） |
| 共同祖先 | `bc50cac0`，它同时是上游 tag `v0.2.4` 与 20 人版 `master` |
| 合并后冲突 | 8 个文件真冲突，其余 46 个交集文件自动合并 |
| 测试 | 金标准 9/9、容量与库存回归 166/166、`npm run ci` 通过 |
| `master` 分支 | 保留为历史（= 分叉点 0.2.4），**不再使用**；`feat/IncreasePlayerCapacity` 仅作为 tag 存在 |

## 3. 两个远程（**必须改**）

当前 `origin` / `upstream` 指向本机的路径，只是做这次合并时的临时镜像。**推送到你自己的仓库前先改地址**：

```bash
# 你自己的 fork —— 推送目标
git remote set-url origin https://github.com/<你的账号>/Stronghold-Protocol.git

# 原版作者 —— 只拉不推
git remote set-url upstream https://github.com/sganggs/Stronghold-Protocol.git

git fetch upstream --tags
```

**注意**：这次合并**没有推送任何远程**，也没有部署。所有结论都是本地结果。

```bash
# 推送主线（首次）
git push -u origin capacity-20p
```

## 4. 服务器上怎么跑

- **开服、Docker、素材、环境变量、服主命令、带宽建议、常见问题**：见 [OPERATIONS_20P.md](OPERATIONS_20P.md)
- 原版的通用部署说明（整合包 / 反向代理 / HTTPS / systemd 排错）：见 [DEPLOY.md](DEPLOY.md)
- **Docker 三个必须注意的点**（镜像里没有 `tools/`、`/app` 不可写、不含素材）都在
  [OPERATIONS_20P.md §3](OPERATIONS_20P.md) 里，**务必先看那节**。

最省事的路径（Debian + Node 22）：

```bash
git clone <你的仓库地址> stronghold && cd stronghold
git checkout capacity-20p
npm ci --no-audit --no-fund
node tools/doctor.mjs                 # 缺素材会在这里报出来
node tools/setup.mjs                  # 拉取游戏素材（约 250 MB）
PORT=3000 HOST=0.0.0.0 npm start
```

## 5. 原版再更新时怎么做

按 [development/SYNC_20P.md](development/SYNC_20P.md) 的七步走。**最关键的三条**：

1. **冲突逐条按 [development/DECISIONS.md](development/DECISIONS.md) 的 D001–D033 裁决，禁止整文件 `--ours`/`--theirs`。**
2. **合并后必须做「语义冲突检查」**（SYNC_20P.md 步骤 5）：
   本次真实发生过——上游新增代码引用了 20 人版已经拆掉的全局 `Match.itemPool`，
   **git 全程没有任何冲突提示**，运行时报 3–6 条引擎错误，只有跑测试才发现。
3. **跑 `npm run verify:20p`**，它是三道闸门：
   - 金标准（`test/golden/*.json` 是**上游的**基准，本分支从未改过）→ 证明 1–4 人玩法与上游逐位一致；
   - 20 人容量与分组库存回归 → 证明 D001–D033 的特性还在；
   - 版本一致性。

```bash
npm run verify:20p          # 快速
npm run verify:20p:full     # 含全量 golden 语料
```

`npm run golden:update` **是最后手段**：必须先把每个移动的场景解释到具体行为，再决定是否更新基准。

## 6. 为什么 20 人特性不会被原版覆盖

不是靠 git 自动保证的，而是三层：

| 层 | 内容 | 位置 |
|---|---|---|
| **决定表** | D001–D033：容量、分组、卡池、装备库存、轮选、联防、领袖血池、公告、素材缓存、大厅、协议、AI 上限、聊天、匹配开关，每条都写了「保留什么边界」和依据 | [development/DECISIONS.md](development/DECISIONS.md) |
| **守卫测试** | 上表每条基本都有对应测试钉住（`test/lobby-capacity`、`test/match/player-capacity`、`group-stock`、`group-drafts`、`unite-*`、`room-management` …） | `test/` |
| **金标准** | 1–4 人语料与上游逐位一致，容量改动的生效阈值被证明在 **6 人以上** | `test/golden/` |

另有一条边界值得记住：**20 人版不按人数放大怪物数量**。战斗场的敌人数量只由回合决定，
与实际人数无关；只有**领袖血池**随开战存活人数线性放大（上限 20），中途退出按百分比缩池。

## 7. 本次合并改了什么（速查）

- **8 处文本冲突**的解法与依据：见 [development/records/2026-10-12-05-upstream-v0.2.5-20p.md](development/records/2026-10-12-05-upstream-v0.2.5-20p.md) 与 [SYNC_20P.md §7](development/SYNC_20P.md)
- **3 处语义冲突**（git 未报）：`Match.itemPool` → `itemPoolFor`（`acquire.js`、`views.js`）、
  晋升奖励刷新恢复上游 `diyStockEntries`
- **4 个 20 人版自己留下的过期断言**已修好并绑定到常量（5 Hz → `DELAYS.PUBLIC_THROTTLE`、
  120 s → `BANDWIDTH_EMERGENCY_DEFAULTS.autoResumeMs`、`m.public.bossPairs` 与 `m.layer` 的协议登记、
  文档链接检查跳过围栏代码块）
- **协议**：`m.public.bossPairs` 走 v1 扩展位、`m.layer` 走 JSON 回退；
  **v1 目录指纹未改动**（`WIRE_VERSION` 仍为 1）

## 8. 还需要你确认或执行的事

| 事项 | 说明 |
|---|---|
| 部署 | 本次**未部署**。镜像未构建、远程未推送、服务器未重启 |
| 素材 | 本次**未执行** `npm run setup`；3D 战场场景需本机客户端提取，缺失时自动回退金属地块 |
| 预缓存包 | `npm run assets:pack` 未重新生成 |
| 浏览器套件 | `SP_E2E` / `SP_REAL_E2E` / `RENDER_E2E` / `SIM_E2E` 未运行（需 Chrome 与素材） |
| 20 真人压测 | 未做。仓库文档本身也声明只验证过「两个真实 WebSocket 会话 + 18 AI」，真实带宽与设备性能需上线后实测 |
| 压测敏感性 | `test/wire-pressure.test.js` 对机器负载敏感：4 核笔记本上并发跑全量套件会超出它自己的 2 s p95 阈值，**单独运行则通过**（p95 约 1.4 s） |
