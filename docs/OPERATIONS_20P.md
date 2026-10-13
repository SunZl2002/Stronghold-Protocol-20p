# 20 人联机版 · 开服与运维手册

本仓库 = **20 人联机版**（原分支 `feat/IncreasePlayerCapacity`，作者最终版 `v0.2.4-20p.5fix`）
**已合并原版 0.2.5** 的全部内容（玩法、数值、bug 修复、素材变更）。

- 上游原版：<https://github.com/sganggs/Stronghold-Protocol>（本仓库的第二个远程 `upstream`）
- 20 人版原始仓库：<https://github.com/LongQianChen/Stronghold-Protocol>（远程 `origin`）
- 20 人玩法规则：见 [docs/PLAYER_CAPACITY.md](PLAYER_CAPACITY.md)、[docs/development/DECISIONS.md](development/DECISIONS.md)
- **跟随原版更新怎么做**：见 [docs/development/SYNC_20P.md](development/SYNC_20P.md)
- 原版的通用部署说明（整合包 / 源码 / 反代）：见 [docs/DEPLOY.md](DEPLOY.md)

---

## 0. 一句话

Debian 服务器上，**Node 22 + 源码**直接跑最省事；要 Docker 也能跑，但**必须额外挂载
`runtime/`、`tools/`、`public/assets/`**，否则服主命令和素材都用不了。

---

## 1. 系统要求

| 项目 | 要求 | 说明 |
|---|---|---|
| Node.js | **22.21+ 或 24**（`engines` 只写 `>=22`） | `package.json engines` 声明 `>=22`，但 **22.19 及更早不会让 `fetch()` 走 `HTTP(S)_PROXY`**：服务器若需经代理下载素材，必须用 Node ≥22.21 或 ≥24，或以 `NODE_USE_ENV_PROXY=1` 启动（旧版 Node 上该变量无效）。不经代理时 22.x 均可 |
| 操作系统 | Linux（Debian 12 已验证路径） | 带宽熔断读取 `/proc/net/*`，**仅 Linux 可用**；Windows 不会伪造该测量 |
| CPU | 主频优先 | 每个房间每作战回合约 1 ms；**AI / 断线托管战场由服务器模拟，是主要开销** |
| 内存 | 4 GB 起 | 缓存与注册表都有上限（压缩缓存 96 MiB、素材清单 32 MiB、会话 20 000、连接 2 000、房间 1 000） |
| 磁盘 | 源码 + 约 250 MB 素材 + 公告/配置 | 素材不进 Git，也不进 Docker 镜像 |
| 带宽 | 8 Mbps 上行够 20 人房 | 前提：**所有玩家都用新版页面**（见 §6） |

安装 Node 22（Debian，NodeSource）：

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl gnupg
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
  | sudo tee /etc/apt/sources.list.d/nodesource.list
sudo apt-get update && sudo apt-get install -y nodejs
node --version   # 期望 v22.x
```

---

## 2. 方式一：源码直跑（推荐）

```bash
# 1. 取源码（换成你自己的仓库地址 / 分支）
git clone <你的仓库地址> stronghold && cd stronghold
git checkout capacity-20p          # 整合了 0.2.5 的 20 人分支

# 2. 安装依赖（postinstall 会把 pixi / three / preact / zip 复制到 public/vendor）
npm ci --no-audit --no-fund

# 3. 自检：依赖、数据、素材清单
node tools/doctor.mjs

# 4. 启动
PORT=3000 HOST=0.0.0.0 npm start
```

若第 3 步报素材缺失，再执行 §4。

**用 systemd 常驻**（`/etc/systemd/system/stronghold.service`）：

```ini
[Unit]
Description=Stronghold Protocol (20-player)
After=network.target

[Service]
Type=simple
User=stronghold
WorkingDirectory=/srv/stronghold
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOST=0.0.0.0
Environment=SP_SERVER_SETTINGS_DIR=/srv/stronghold/runtime
Environment=SP_ANNOUNCEMENTS_DIR=/srv/stronghold/runtime/announcements
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd -r -s /usr/sbin/nologin stronghold || true
sudo chown -R stronghold:stronghold /srv/stronghold
sudo systemctl daemon-reload && sudo systemctl enable --now stronghold
curl -s localhost:3000/healthz
```

---

## 3. 方式二：Docker

仓库自带的 `Dockerfile` 与上游**逐字节相同**；编译 20 人版**不需要改它**。但它有四个必须知道的限制：

1. **镜像里没有 `tools/`、`scripts/`、`packs/`** → 本手册里的服主命令（`tools/server-settings.mjs`、
   `tools/announcements.mjs`、`tools/asset-cache-pack.mjs`）**在容器内不存在**，必须挂载 `tools/` 或从宿主机源码跑。
2. **`/app` 对 `node` 用户不可写**，且镜像没有 `VOLUME` → 默认的 `runtime/` 建不出来，
   公告和服主配置写不进去。**必须挂载 `runtime/` 并 chown 1000:1000**。
3. **镜像不含游戏素材**（`.dockerignore` 排除 `public/assets`），也**不含提取好的战场场景**；
   `FETCH_ASSETS=1` 只补常规素材，场景需要本机客户端提取。素材请用只读卷挂载。
4. **素材哈希索引写在 `.cache/`，不在 `runtime/` 下**（`.dockerignore` 也排除了 `.cache`）→
   容器里如果 `/app/.cache` 不可写，服务器只能在内存里算哈希：**每次重启都要把
   `public/assets` + `public/fonts` 全部重读一遍**（几百 MB，冷启动明显变慢）。
   把 `.cache/` 也挂成可写卷，只在素材真的变了时才重扫。

### 3.1 推荐的运行方式（四个卷）

```bash
# 构建二选一：
#   A) 构建期下载常规素材（需要联网，约 250 MB 起）
docker build -t stronghold-20p:0.2.6 --build-arg FETCH_ASSETS=1 .
#   B) 不带素材，全部靠挂载（推荐：素材留在宿主机，镜像小、升级只换镜像）
docker build -t stronghold-20p:0.2.6 .

# 运行时写的两个目录（container 内是 node 用户 uid 1000）
mkdir -p runtime .cache
sudo chown -R 1000:1000 runtime .cache

docker run -d --name stronghold \
  --restart unless-stopped \
  -p 3000:3000 \
  -v "$PWD/runtime:/app/runtime" \
  -v "$PWD/.cache:/app/.cache" \
  -v "$PWD/tools:/app/tools:ro" \
  -v "$PWD/public/assets:/app/public/assets:ro" \
  -e SP_SERVER_SETTINGS_DIR=/app/runtime \
  -e SP_ANNOUNCEMENTS_DIR=/app/runtime/announcements \
  stronghold-20p:0.2.6
```

四个卷各自解决什么：

| 挂载 | 读写 | 为什么必须 |
|---|---|---|
| `runtime/` → `/app/runtime` | **读写**（chown 1000:1000） | 服主配置 `server-settings.json` 与公告正文/图片。**这是唯一需要备份的目录** |
| `.cache/` → `/app/.cache` | **读写**（chown 1000:1000） | 素材哈希索引 `asset-hashes.json`。不挂 = 每次重启重扫全部素材；只读 = 同上（服务器退回内存计算） |
| `tools/` → `/app/tools` | 只读 | 容器内没有 `tools/`，服主命令（配置、公告、打预缓存包）都要用它 |
| `public/assets/` → `/app/public/assets` | 只读 | 镜像里没有素材。选 A 构建时可省，但仍建议挂载宿主机那份，便于单独更新素材 |

**`public/fonts/` 与 `data/local-assets.json` 的注意点**：上游 `Dockerfile` 的注释写的是
「`public/fonts`、`data/assets.json`、`data/local-assets.json` 若存在会被复制进去」，
但 **20 人版的 `.dockerignore` 额外排除了 `data/local-assets.json`**（避免把某台机器提取过的结果
带进公共镜像）。`.dockerignore` 优先于构建上下文，所以**这个文件在本分支不会被 COPY 进镜像** ——
上游那句注释在本分支不再成立。要在容器里用**本地提取的棋盘/场景**，必须自己挂载：

```bash
  -v "$PWD/public/fonts:/app/public/fonts:ro" \
  -v "$PWD/data/local-assets.json:/app/data/local-assets.json:ro" \
  -v "$PWD/public/assets/local:/app/public/assets/local:ro"
```

镜像自带的 `Dockerfile` 跑的是 `node tools/fetch-assets.mjs`，**不会**下载/提取官方战场场景；
场景素材在本机提取（见 §4），提取结果就在 `public/assets/` 下，因此挂载 `public/assets` 时一并生效。

### 3.2 验证

```bash
curl -s localhost:3000/healthz
docker exec -it stronghold node tools/server-settings.mjs show
docker logs stronghold | grep -i 'asset'      # 看素材清单与哈希索引是否就绪
```

构建参数只有两个：`NODE_IMAGE`（默认 `node:22-alpine`）、`FETCH_ASSETS`（默认 `0`）。

> `.dockerignore` 已经包含 `runtime` 与 `data/local-assets.json`（20 人版追加的两行），
> 所以宿主机的私有公告、服主配置和本机提取清单不会进构建上下文。

### 3.3 玩家侧的预缓存包（在宿主机打，不挂进容器）

20 人版有预缓存功能（D016/D031）：服务器**在线**给玩家下发素材目录并限速补齐；
想要「一次下完」的玩家则从服主这里拿一个素材 ZIP 在游戏里的「预缓存」面板本地导入。

- **这个 ZIP 不是容器里的运行时目录，而是一次性分发包**，所以不在上面四个卷里。
- 它必须由**服务器实际提供的那份素材**生成（校验会比目录内容版本、文件数与字节数，
  对不上会被拒绝导入），因此在宿主机对同一份 `public/assets` + `public/fonts` 打包：

  ```bash
  # 在宿主机源码目录（与容器挂载的是同一份素材）
  npm run assets:pack
  # 产物默认在 .cache/asset-cache-pack/Stronghold-Protocol-assets-<版本12>.zip
  # 只导出目录 JSON（不重写已分发的 ZIP）：
  npm run assets:pack -- --catalog-only
  # 自上次完整包以来的增量包：
  npm run assets:pack -- --delta --base-catalog 旧目录.json
  ```

- **素材一变就要重打**：内容版本是全部文件 SHA-256 的摘要，改了素材而没重打，玩家导入会被拒。
- 宿主机打包时 `git ...` 无关，但**不要把 `.cache/asset-cache-pack/` 也挂进容器** ——
  容器不需要它，挂了只会让「哪个是权威素材」变得含糊。
- 如果容器走的是 A 方案（构建期下载），宿主机上并没有那份素材；此时要么
  `docker cp stronghold:/app/public/assets ./public/assets` 取回来再打包，
  要么直接用 B 方案的挂载结构（推荐）。

---

## 4. 游戏素材（服务器必须自备）

素材受版权保护，**不提交到 Git**，也不在 Docker 镜像里。两条路：

```bash
# A. 在线拉取（需要能访问素材源；直连不畅时用镜像）
node tools/setup.mjs
node tools/setup.mjs --asset-source=mirror

# B. 已有一份素材时只补缺项（推荐，不删已有文件）
node tools/fetch-assets.mjs --add-only
```

- 产出：`public/assets/**`（约 250 MB）+ `public/fonts/**`。
- **战场场景（0.2.5 新增，3D 棋盘按战场显示官方场景）**：完整整合包已含提取结果；
  从源码跑需要本机有官方客户端才能提取：

  ```bash
  node tools/setup.mjs --scenes
  # 或分两步
  python3 tools/local-extract/fetch_scenes.py
  python3 tools/local-extract/extract.py --only scene
  ```

  提取失败不影响开服：**没有场景时棋盘自动回退金属地块**。
- `SP_ASSETS_STRICT` 可让清单缺项直接失败（默认宽松）。

---

## 5. 服主配置与环境变量

### 5.1 三个必设的路径（Docker 下尤其重要）

| 变量 | 默认 | 说明 |
|---|---|---|
| `SP_SERVER_SETTINGS_DIR` | `<安装目录>/runtime` | 私有配置目录，放 `server-settings.json` |
| `SP_ANNOUNCEMENTS_DIR` | `<安装目录>/runtime/announcements` | 公告持久目录（含 `assets/` 图片） |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | 监听地址 |

**`runtime/` 是唯一需要备份的数据目录**（公告正文、图片、服主配置）。
`.cache/` 也建议挂成可写卷，但它**不需要备份**——里面只有可重建的哈希索引
（删掉/丢了只会让下次启动重扫一遍素材），Docker 下见 §3.1。
`runtime/`、`.cache/`、`public/assets/` 都已 gitignore；`tools/package.mjs` 也拒绝把 `runtime` 打进发布包。

### 5.2 服主命令（无需重启，约 1 秒生效）

```bash
node tools/server-settings.mjs show                 # 查看当前持久配置
node tools/server-settings.mjs show --json

# 每房 AI 队友上限（0–19，或 unlimited；默认不限）
node tools/server-settings.mjs ai-limit 19
node tools/server-settings.mjs ai-limit unlimited

# 在线素材补齐限速（单位 Mbps；默认不限）
node tools/server-settings.mjs asset-cache-limit 4 2      # 总 4、单 IP 2
node tools/server-settings.mjs asset-cache-limit unlimited unlimited
node tools/server-settings.mjs asset-cache-limit 0 0      # 关闭在线目录与补齐

# 是否要求玩家完整预缓存后才能创建/加入/最快匹配/观战（默认允许）
node tools/server-settings.mjs asset-cache required
node tools/server-settings.mjs asset-cache optional

# 带宽紧急熔断（实验性，作者标注"不建议开启"；默认关闭）
node tools/server-settings.mjs bandwidth-emergency on
node tools/server-settings.mjs bandwidth-emergency off
```

**持久配置优先于环境变量**：改环境变量要重启，改 CLI 约 1 秒生效。
非法持久配置会让进程在 `listen` 之前直接失败（故意的，避免静默降级放开严格模式）。

### 5.3 公告

```bash
# 发布（--pin 置顶；--id 省略时自动生成）
node tools/announcements.mjs publish --id welcome --title "开服公告" --file ./notice.md --pin
node tools/announcements.mjs list
node tools/announcements.mjs pin welcome
node tools/announcements.mjs unpin
# 局内紧急通知：先有一条公告，再 notify 它的 id
node tools/announcements.mjs notify maintenance
```

- 正文用 Markdown 子集，图片放 `<公告目录>/assets/`，正文里写 `![说明](assets/图.png)`。
- 单篇最多 32 张图、单文件 ≤16 MiB；只公开 PNG/JPEG/GIF/WebP/AVIF/BMP。
- **只有 GET 接口，没有网页发布后台**；公告数据和 WebSocket/网页都不进浏览器预缓存。
- 紧急通知有效队列 5 分钟、最多 32 条，不暂停对局。

### 5.4 全部新增环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `SP_COMPACT_WIRE` | 开 | `0` 关闭紧凑位置数组协议（只发原 JSON）。**关掉会让带宽回到约 20 倍** |
| `SP_WS_DEFLATE` | 开 | `0` 关闭 permessage-deflate |
| `SP_HTTP_RUNTIME_CACHE` | 开 | `0` 关闭 `?rv=` 内容寻址运行时缓存 |
| `SP_HTTP_BROTLI` | 开 | `0` 只提供 gzip |
| `SP_MAX_AI_PER_ROOM` | 不限 | 仅作启动默认值，持久配置优先 |
| `SP_REQUIRE_ASSET_CACHE` | `false` | 严格预缓存准入的启动默认值 |
| `SP_ASSET_CACHE_TOTAL_BPS` / `_CLIENT_BPS` | 不限 | 字节/秒；`0` 关闭 |
| `SP_BANDWIDTH_EMERGENCY_ENABLED` | **关** | 熔断总开关 |
| `SP_BANDWIDTH_RATIO` / `_TRIGGER_MS` / `_WINDOW_MS` / `_POLL_MS` | 0.6 / 15000 / 5000 / 1000 | 触发判据 |
| `SP_BANDWIDTH_INTERFACE` | 自动 | 默认路由网卡；空则读 `/proc/net/route` |
| `SP_BANDWIDTH_MIN_CLIENTS` / `_GAME_BPS` / `_MIN_PENDING_BYTES` / `_AUTO_RESUME_MS` | 2 / 500000 / 65536 / 60000 | 佐证与恢复 |

---

## 6. 8 Mbps 上行怎么配（实测数据推算）

分支作者的抓包实测（`docs/development/records/2026-10-10-09-compact-wire-bandwidth.md`）：
主 20 真人房单连接公共状态，原 JSON **3.84 Mbps** → 紧凑协议 **27.3 kbps（−99.29%）**。

按当前 **8 Hz** 广播节流（`server/match/match/match/common.js` `PUBLIC_THROTTLE: 125`）折算：

| 场景 | 估算 |
|---|---|
| 单连接公共状态 | ≈ 91 kbps |
| 20 玩家 + 5 观战（25 连接） | ≈ 2.3 Mbps；加私有/战场帧约 **2.5–3 Mbps** |
| **旧页面（原 JSON）单客户端** | ≈ **2.85 Mbps** ← 3 个没刷新的页面就能吃满 8 Mbps |

**结论与必做项**

1. **上线后让所有玩家刷新一次页面**，之后内容寻址缓存生效，二次访问正文 0 B。
   协议按物理连接独立协商，旧页面不会自动降级，只会一直用大报文。
2. **素材别从服务器拉**：`node tools/asset-cache-pack.mjs` 生成完整/增量 ZIP，走网盘或群分发
   （服主说明见 [docs/ASSET_CACHE.md](ASSET_CACHE.md)）。
   **预缓存需要 HTTPS 或 localhost**，纯 HTTP 的远程玩家用不了 Service Worker。
3. **给对局留余量**：`node tools/server-settings.mjs asset-cache-limit 4 2`。
   该项**只限素材补齐/目录下载**，普通游戏 HTTP 与 WebSocket 不排队。
4. 反代注意：`/api/asset-cache/file` 需要 `proxy_buffering off` + `gzip off`，
   并允许 WebSocket 的 permessage-deflate；`TRUST_PROXY` 必须正确设置，
   否则所有玩家会被当成同一个 IP（撞 `maxConnectionsPerAddr: 64`）。
5. 冷启动尖峰：单浏览器首次约 449 个资源 / 2.9 MB，25 人同时冷启动 ≈ 71 MB。

**诊断**：`/healthz` 会带 `bandwidthEmergency` 字段。若玩家报卡顿，先确认服务器是否已在丢弃
战斗快照（`server/net.js` 的 `snapDropBytes`）——那通常说明某个客户端链路慢，而不是服务器算不过来。

---

## 7. 验证与自检

```bash
# 依赖/数据/素材自检
node tools/doctor.mjs

# 完整测试（不需要素材；CI 就是这套）
npm run ci          # = node tools/ci.mjs：node --test + 冒烟 + lint + imports + typecheck

# 只跑 20 人容量相关回归
node --test test/lobby-capacity.test.js test/match/player-capacity.test.js \
  test/match/draft-capacity.test.js test/match/unite-capacity.test.js \
  test/match/unite-vote.test.js test/match/group-drafts.test.js \
  test/match/group-stock.test.js test/match/group-unite-rounds.test.js

# 玩法一致性金标准（1–4 人语料，必须与我方/上游一致）
node --test test/golden.test.js
GOLDEN_FULL=1 node --test test/golden.test.js     # 全量语料，约 20 s
```

浏览器端到端测试默认关闭，需要 Chrome：`SP_E2E=1`（UI）、`SP_REAL_E2E=1`（真实对局，需素材）、
`RENDER_E2E=1`、`SIM_E2E=1`。

---

## 8. 常见问题

**Q：玩家说"太卡/丢包"，但服务器 CPU 和内存都不高。**
先看是不是旧页面（§6 第 1 条）；再看是不是有人正在冷启动拉素材（§6 第 2/3 条）。

**Q：Docker 里 `node tools/server-settings.mjs show` 报文件不存在。**
镜像不含 `tools/`。按 §3 挂载 `-v "$PWD/tools:/app/tools:ro"`，或在宿主机源码目录跑。

**Q：容器重建后公告和配置没了。**
`runtime/` 没挂卷。见 §3 第 2 点，挂载并 `chown 1000:1000`。

**Q：3D 棋盘是灰金属块，没有战场场景。**
场景需要本机客户端提取，见 §4；缺失时自动回退是预期行为。

**Q：房间创建不了 / 加入被拒，玩家看到"服主要求完整预缓存"。**
服主开了 `asset-cache required`。让玩家在"预缓存"里导入完整素材包并补齐，或改回 `optional`。

**Q：改成 20 人房但只有 4 个人，内容会不会按 20 人生成？**
不会。玩法规模按**开局实际占用席位数**计算，空位和观战者不计入。见 [docs/PLAYER_CAPACITY.md](PLAYER_CAPACITY.md)。

**Q：我需要改观战席上限吗？**
不用改代码：**房主在等候房自己选 0 / 2 / 4 / 6 / 8，默认 4**（D034）。0 表示该房不开放观战，独立模拟房固定 0 席。若你要改的是**可选档位或默认值**，改 `shared/constants.js` 的 `SPECTATOR_CAPACITIES` / `DEFAULT_SPECTATORS`（`MAX_SPECTATORS` 是房主可申请的上限）。
注意**每个观战者 ≈ 一份完整的房间广播**，与多一个玩家同量级；本分支把上限设在 8 正是为了保留这条带宽边界（上游曾以流量为由把上限固定为 2）。

**Q：房主想把观战席调小，但提示"无效的目标"。**
目标值低于当前正在观看的人数。先在观战席名单里移除多余的人（房主可随时移除），再调小——不会静默挤掉正在看的玩家。
