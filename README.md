# 我做了什么（what-i-did）

个人生活记录与统计网站。用日历记录每天做过的事，用随手记做流水账，并在任意时段上做统计。

- **公开只读**：任何人都能浏览日历、统计与随手记。
- **私有可写**：只有管理员（你本人）能管理 Tag、记录活动、编写随手记。
- **一个进程 + 一个 SQLite 文件**：没有外部数据库、没有对象存储、没有消息队列。

---

## 功能

| 页面 | 内容 |
| --- | --- |
| 日历 | 月网格，每格显示当天活动次数与各 Tag 的色点；点开某天可 `+1` / `−1` 记录；可按 Tag 筛选，筛选状态写在 URL 里，可直接分享 |
| 统计 | 本月 / 今年 / 自定义时段 × 多 Tag 筛选；汇总卡（总次数、活跃天数、当前连续、最活跃 Tag）、趋势折线图、Tag 分布环形图、Tag 明细表 |
| 随手记 | GitHub 风格贡献图（53 周，按当天条数着色），点格子筛选当天的随手记并直接增删改 |
| 管理 | 管理员专属：修改站点标题 / 副标题 / 描述；新建 / 编辑（名称、图标、颜色）/ 删除 Tag，删除前提示将影响的记录条数 |

响应式：≥ 900px 用左侧栏 + 右侧内容区，< 900px 用顶部栏 + 底部 Tab Bar。移动端顶部栏右侧始终有进入后台的入口：未登录显示「登录」，已登录显示「管理」。

---

## 技术选择（以及为什么不用别的）

| 选择 | 理由 |
| --- | --- |
| SQLite（better-sqlite3） | 数据量是"个人 × 每天几条"，十年也就几万行。不需要数据库服务 |
| 无 ORM，`schema.sql` + `db.prepare()` | 只有 5 张表、几种固定查询，`CREATE TABLE IF NOT EXISTS` 幂等执行即可，不需要迁移引擎 |
| 统计在 JS 纯函数里算 | 每个统计口径都能被单测覆盖（连续天数这类边界密集的逻辑尤其需要），写复杂 SQL 反而难测 |
| 自绘 SVG 图表 | 只需要一条折线 + 一个环形，图表库是 200 KB+ 依赖和一整套要覆盖的默认样式 |
| 手写 CSS + CSS 变量 | 视觉完全可控，深色模式跟随系统偏好，无 UI 框架 |
| 活动一行一条记录 | 次数由 `COUNT(*)` 天然得出，不维护冗余的 count 字段 |
| 日期存 `YYYY-MM-DD` 字符串 | 避免时区把深夜记录挪到相邻日期——这是这类应用最常见的错误来源 |
| 单管理员、无用户表 | 鉴权是一个二值判断，不是权限系统 |

---

## 快速开始（本地）

需要 Node 22 或更高。

```bash
npm install
cp .env.example .env          # Windows: copy .env.example .env
npm run hash-password -- '你的密码'   # 把输出写入 .env 的 ADMIN_PASSWORD_HASH
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"  # 写入 SESSION_SECRET
npm run build                 # 构建前端
npm start                     # 打开 http://127.0.0.1:8787
```

本机用 http 访问时，务必把 `.env` 里的 `COOKIE_SECURE` 设为 `false`，否则浏览器不会保存会话 cookie（表现为"登录后仍是未登录"）。

### 构建报 `remove ...\Temp\esbuild-xxxx: Access is denied.` 怎么办

不用处理，已经内置解决了。`web` 的 `dev` / `build` / `preview` 都走 `scripts/run-vite.mjs` 包装，
它在启动 Vite 前把 `TMPDIR` / `TEMP` / `TMP` 指向项目内的 `.tmp/`，于是 esbuild 的中间文件
不再落在系统临时目录，也就不会出现"删不掉系统 Temp 文件"的失败。

已验证：包装脚本下 `os.tmpdir()` 返回 `<项目>/.tmp`，默认环境则是 `C:\Users\...\Temp\dsh-xxxx`。
如果你的机器上仍然报这个错，说明有别的进程（杀毒软件、同步盘）锁住了 `.tmp/`，可以删掉该目录重试。

> 另有一个不同的错误值得区分：`Error: spawn EPERM` 表示**当前环境禁止启动子进程或 worker 线程**，
> 这是沙箱/受管终端的限制，不是项目问题——换一个普通终端或在 Docker 里构建即可。

### 开发模式（前后端分离，带热更新）

```bash
npm run dev:server            # 后端 http://127.0.0.1:8787
npm run dev:web               # 前端 http://127.0.0.1:5173（/api 自动代理到后端）
```

> 在受限的沙箱环境里，`npm install` 需要加 `--ignore-scripts`、`vite build` 需要放宽权限，
> 原因是 esbuild 必须启动带管道的子进程。详见 [docs/probe-node24.md](docs/probe-node24.md)。

### 测试

```bash
npm test          # web + server 单测：日期边界、统计口径、鉴权、接口行为、favicon（66 个用例）
npm run test:smoke   # 端到端冒烟：真端口、真 HTTP、真 cookie、真静态文件（43 项检查）
```

`test:smoke` 会在 8791 端口用独立的临时数据库起一个真实服务实例，覆盖跨年连续天数、
按周/按月趋势分桶、级联删除、未授权写入拒绝、深层路由回退与静态资源缓存头等，
跑完自动关闭。它不 spawn 子进程（服务在测试进程内启动），因此不依赖任何外部环境。

前端类型检查：`npm run typecheck --workspace web`。

构建时还会自动执行四项静态检查（`npm run build` 里串联，任一项失败即构建失败）：

| 检查 | 拦截的问题 |
| --- | --- |
| `check-bundle-size.mjs` | 图标库被整体引入入口包（会把 5 MB 静默塞给访客） |
| `check-icon-names.mjs` | 手写的图标名拼错（会静默显示成灰色占位方块） |
| `ui-audit.mjs` | JSX 里用了 CSS 未定义的类名（样式静默不生效） |
| `audit-contrast.mjs` | 主题令牌的文字对比度低于 WCAG AA（小字看不清、按钮白字发虚） |

### 界面截图（人工核对用）

```bash
npm start                                                  # 另开一个终端
node scripts/seed-demo.mjs                                 # 先造演示数据（需要 ADMIN_PASSWORD）
BASE=http://127.0.0.1:8787 node scripts/screenshot.mjs     # 公开视角：5 页 × 桌面/移动
BASE=http://127.0.0.1:8787 node scripts/screenshot-admin.mjs --password '你的密码'
```

产物在 `.tmp/shots/` 与 `.tmp/shots-admin/`。

> 两个脚本都需要**放宽执行权限**（不能在受限沙箱里跑）：Chromium 的多进程架构必须创建
> 操作系统命名管道，而沙箱禁止这件事。脚本内部已处理了三个坑，值得知道原因：
> 必须用 `chrome-headless-shell` 而不是 `chrome.exe`（后者要启动崩溃上报服务，起不来就自终止）、
> 必须关闭 `NetworkServiceSandbox`、必须禁用 HTTP 缓存（否则可能拿到上次构建的 `index.html`，
> 表现为白屏且报错信息误导）。

---

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | 监听端口 |
| `HOST` | `127.0.0.1` | 监听地址。默认只允许本机/反向代理访问；容器里设为 `0.0.0.0` |
| `DB_PATH` | `./data/what-i-did.db` | SQLite 文件路径 |
| `SESSION_SECRET` | 无 | 至少 32 字符。生产环境缺失时**拒绝启动** |
| `ADMIN_PASSWORD_HASH` | 无 | 由 `npm run hash-password` 生成。服务端只存哈希 |
| `SESSION_DAYS` | `30` | 会话有效期 |
| `COOKIE_SECURE` | `true` | 是否给会话 cookie 加 `Secure`。走 HTTPS 时保持 `true` |
| `NODE_ENV` | 无 | `production` 时会强制校验上面的密钥类配置 |

站点标题、副标题与描述不属于环境变量：它们存在数据库的 `settings` 表里，在后台「管理」页修改，保存后立即生效，无需重启服务。副标题与描述可以留空（留空后不显示 / 不输出 meta description）。

服务端会在返回 `index.html` 前把当前配置的 title 与 meta description 注入首屏 HTML，因此搜索引擎和其他不执行 JS 的抓取器也能读到后台设置的值；前端仍会在 SPA 路由切换时更新 `document.title`。

同时会注入 `site-title` / `site-subtitle` / `site-description` 三条 meta，前端首屏直接读取它们完成水合。这样 `/api/site` 返回前不会先用兜底文案渲染，浏览器标签页与侧栏也就不会先闪一下「我做了什么」再变成配置值。

### 写入频率上限（批量补记历史时需要注意）

服务端对写操作有一个**每 IP 每分钟 120 次**的保护性上限（在 `server/src/app.js` 的中间件里），
防止脚本失控或误操作把库写坏。正常手点记录不可能碰到。

但如果你打算**批量补记历史**（例如用脚本把过去一年的记录灌进去），会撞到这个上限并收到 429。
`scripts/seed-demo.mjs` 已经内置了"遇到 429 就退避重试并计数"的处理，可以直接参考它的写法。
上限值本身是常量 `120`，若你有长期批量导入需求，改大它即可（位置见上面的中间件）。

演示数据与截图：

```bash
npm start                                      # 另开一个终端
ADMIN_PASSWORD='你的密码' node scripts/seed-demo.mjs
node scripts/screenshot.mjs                    # 需要放宽权限，见下
```

管理员密码是运行时读取的，改完 `.env` 重启容器即可生效，不需要重新构建镜像。

---

## 部署（Docker Compose，可选）

> **当前线上部署用的是 Node + systemd，不是容器。** 这一节保留给"想用容器"的场景。
> 在内存较小的 VPS（例如 1.6 GB）上直接跑 Node 更省事：装依赖只要十几秒，
> 容器方案还要额外拉镜像。两种方式的取舍与踩坑记录见 [AGENTS.md](AGENTS.md) 的部署章节。

```bash
cp .env.example .env
# 1) 生成 SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
# 2) 生成密码哈希
node scripts/hash-password.mjs '你的密码'
# 3) 把两个值填进 .env，并确认 COOKIE_SECURE=true

docker compose up -d --build
```

`.env` 里记得设 `TZ`（例如 `TZ=Asia/Shanghai`）。容器默认 UTC，不设会让"今天"算错——北京时间 0:00–8:00 的记录会落到前一天。

数据存在 Docker 命名卷 `what-i-did-data` 里，容器重建不影响数据。

> 为什么用命名卷而不是 `./data` 绑定挂载：绑定挂载的目录在宿主机上默认属于 root，
> 而容器以非 root 用户运行，SQLite 会因权限不足无法创建数据库文件。
> 若你确实想直接看到宿主机上的 db 文件，把 compose 里的卷改成 `./data:/app/data`，
> 并在启动前执行 `mkdir -p data && sudo chown 1000:1000 data`。

### 反向代理

`docker-compose.yml` 默认把端口绑到 `127.0.0.1:8787`，也就是只接受本机/反向代理访问——这样容器里的"客户端 IP"才是可信的（登录限速按 IP 统计）。用一个最小的 Nginx 配置：

```nginx
server {
  listen 443 ssl http2;
  server_name example.com;

  ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

如果暂时不做 HTTPS、直接用 `http://IP:8787` 访问：把 compose 里的端口改成 `"8787:8787"`，并把 `COOKIE_SECURE` 设为 `"false"`。此时**密码与会话 cookie 都是明文传输**，只建议在可信内网这么做。

---

## 数据备份与恢复

SQLite 开了 WAL 模式，**活动中的数据库不能直接 `cp` 文件**——最新的写入可能在同目录的 `-wal` 文件里，只复制主文件会丢数据。两种正确做法：

```bash
# 做法一（推荐）：用 SQLite 自己的备份命令，不中断服务
docker compose exec app sh -c 'node -e "
  const D=require(\"better-sqlite3\");
  const db=new D(\"/app/data/what-i-did.db\",{readonly:true});
  db.backup(\"/app/data/backup-\"+new Date().toISOString().slice(0,10)+\".db\").then(()=>console.log(\"ok\"));
"'

# 做法二：先停容器，再复制文件（此时 WAL 已合并）
docker compose stop
cp data/what-i-did.db ~/backups/what-i-did-$(date +%F).db
docker compose start
```

恢复：停容器 → 用备份文件覆盖 `data/what-i-did.db` → 删除残留的 `data/what-i-did.db-wal` 与 `-shm` → 启动容器。

## 回滚

镜像按提交构建，回滚就是切回上一个能用的提交：

```bash
git log --oneline                 # 找到上一个好版本
git checkout <commit>
docker compose up -d --build
```

数据库结构目前只有 `CREATE TABLE IF NOT EXISTS`，因此回滚代码不会破坏已有数据。若某次提交修改了列定义，需要在 README 的提交说明里单独写迁移步骤。

---

## 图标系统

Tag 图标来自 [@tabler/icons-react](https://tabler.io/icons)（MIT，共 6238 个图标）。按三层组织，避免把整个图标库塞给访客：

| 层 | 内容 | 谁加载 | 体积（实测） |
| --- | --- | --- | --- |
| 常用 | `web/src/icons/common.ts` 里显式具名 import 的约 60 个图标 | 所有访客（在入口包里） | 入口包合计 316.8 KB / gzip 100 KB |
| 按需 | 全库图标折叠成一个懒加载 chunk | 只有真的用到冷门图标的访客 | 2390.5 KB / gzip 454 KB / brotli 338 KB |
| 选择器 | `IconPicker`，含中文分类与搜索 | 仅管理员，点开选择器时 | 同上（同一个 chunk） |

**不要写 `import * as Icons from "@tabler/icons-react"` 或 `Icons["Icon" + name]`**：那会把 6238 个图标（约 5 MB）静默打进公开页面的入口包，构建不会报错、只是访客变慢。`scripts/check-bundle-size.mjs` 会在构建时拦住这种情况（体积上限 + 入口包内图标特征串检查）。

服务端的图标名白名单由 `scripts/gen-icon-catalog.mjs` 从图标包生成到 `server/src/icon-names.json`，改图标库版本后执行 `npm run icons` 重新生成。

浏览器图标同时提供 `web/public/favicon.svg` 与 `web/public/favicon.ico`：支持 SVG 的浏览器用矢量版，不支持的回退到 ICO。两处图形必须一致，改完 SVG 后执行 `npm run favicon` 重新生成 ICO。

---

## 目录结构

```
server/src/
  app.js         应用组装：中间件、路由挂载、静态托管、错误处理
  index.js       入口：配置自检、启动、优雅关闭
  db.js          SQLite 打开与 schema 执行
  schema.sql     5 张表，全部幂等
  dates.js       日期纯函数（月末钳制、闰年、周对齐）
  stats.js       统计纯函数（聚合、连续天数、趋势分桶）
  auth.js        scrypt 校验、会话、限速
  site.js        站点信息默认值、读取与首屏 HTML 注入
  validate.js    入参校验与 Tag 调色板
  routes/        site / tags / activities / notes / stats / auth
server/test/     50 个用例（node --test）
web/src/
  icons/         图标三层结构
  pages/         日历 / 统计 / 随手记 / 管理 / 登录
  components/    当天面板、确认弹窗、趋势图、环形图
  lib/           日期工具、useAsync
  state/         登录态、提示条
  styles/        tokens / base / layout / components
scripts/         图标清单生成、密码哈希、体积断言、类名与对比度审计、截图、演示数据
```

## 已知限制

- **没有自动化浏览器端到端测试**：本开发环境的沙箱同时挡住了 Playwright 安装与无头浏览器启动，因此界面渲染未经浏览器验证。已用三类静态检查替代（构建时自动执行）：产物体积断言、图标名一致性、JSX 类名与 CSS 定义的一致性。界面外观与交互请按下面的清单人工核对一次。
- 登录限速是内存实现，重启进程即清零。单管理员场景下够用；若将来需要多实例部署，需要改成共享存储。
- 时区按服务器本地时间判定"今天"。若服务器时区与你所在地不同，跨日边界会有偏差，建议容器设置 `TZ`。
- 深色模式跟随系统偏好，没有手动切换开关。

### 首次部署后的人工核对清单

1. 桌面端（≥ 900px）：左侧栏导航可切换；日历每格显示当天活动的缩略图标与次数（只记 1 次不显示数字）；点某天，**下方**的"当天活动"即时切到该日，`+` / `−` 能改变格子里的预览。
2. 移动端（< 900px，浏览器开发者工具切设备视图）：顶部栏左侧显示站点标题/副标题，右侧未登录为「登录」、已登录为「管理」+「退出」；底部 Tab Bar 三项可切换；日历格子里的图标自动换行且不溢出；当天活动在下方单列显示。
3. 统计页："本月 / 今年 / 自定义"切换后汇总卡、折线图、环形图、明细表同时更新；Tag 筛选 chip 点击后有计数变化。
4. 随手记：热力图点格子后，下方列表切换该日并滚动到位；管理员可在同一张卡片里新增、编辑、删除（`Ctrl/⌘ + Enter` 保存）。
5. 管理：修改站点标题 / 副标题 / 描述并保存，侧栏、移动端顶栏、浏览器标签页与 meta description 立即变化；留空副标题与描述后不再显示。
6. Tag 管理：新建 Tag 时图标选择器能打开（首次打开会下载约 2.4 MB 的图标 chunk），"全部图标"标签页可搜索英文名；删除 Tag 时弹窗显示将影响的记录条数。
7. 深色模式：切换系统偏好后刷新，页面配色随之变化且文字仍清晰（对比度已由 `audit-contrast.mjs` 校验）。
8. 登录：登录后出现「管理」入口（桌面侧栏 + 移动端顶栏）与各处的编辑控件；退出后写操作入口消失。

### Docker 方案的实测结论

`Dockerfile` 与 `docker-compose.yml` 保留作为可选路径。**在真实 VPS 上构建过一次，结论如下**（这台机器 2 核 / 1.6 GB 内存，Docker Hub 直连很慢、靠国内加速器也不快）：

1. **必须用 glibc 基础镜像（`node:22-bookworm-slim`），不能用 Alpine。**
   `better-sqlite3` 包内自带全平台预编译二进制（`node_modules/better-sqlite3/prebuilds/`），
   glibc 上安装走预编译、约 8 秒完成且不生成 `build/Release`；
   Alpine(musl) 会退化成 `node-gyp` 现场编译，在这种小内存机器上直接卡死
   （实测报错 `gyp ERR! find Python`，以及在装编译工具前跑到超时）。
2. **编译依赖必须在 `npm ci` 之前装好**，装完立即清理。Dockerfile 现在就是这个顺序。

> 同类机器上更省事的选择其实是直接跑 Node + systemd（装依赖十几秒，无需拉镜像）。
> 具体步骤与踩坑记录见 [AGENTS.md](AGENTS.md)。

验证镜像可用的最小步骤：

```bash
docker compose build          # 能构建成功即通过第一关
docker compose up -d
docker compose logs app       # 应看到监听地址与数据库路径
curl -sS http://127.0.0.1:8787/api/health
```
