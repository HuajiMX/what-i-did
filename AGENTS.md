# AGENTS.md

给在这个仓库里工作的 AI agent 的说明。**先读完这一页再动手**——里面大部分条目是踩过坑之后写下来的，犯同样的错会直接导致线上故障。

---

## 项目是什么

个人生活记录网站：用日历记录每天做过的事（活动 Tag），用随手记做流水账，在任意时段上做统计。

- **公开只读**：任何人都能看日历、统计、随手记
- **私有可写**：只有管理员能管 Tag、记活动、写随手记
- **一个 Node 进程 + 一个 SQLite 文件**：没有外部数据库、没有对象存储、没有消息队列

技术栈：Node 22 ESM · Hono 4 · better-sqlite3 13 · React 19 + Vite 7 + TypeScript 5.9 · 手写 CSS

---

## 常用命令

```bash
npm ci                    # 装依赖（postinstall 会生成 server/src/icon-names.json）
npm run build             # 构建前端，串联 5 项检查，任一失败即中断
npm start                 # 起服务（默认 http://127.0.0.1:8787）
npm test                  # 单元测试：web 16 个 + server 50 个
npm run test:smoke        # 端到端冒烟：真端口、真 HTTP、真 cookie，42 项检查
npm run typecheck --workspace web    # 三份 tsconfig 都要过
npm run dev:server        # 后端带 --watch
npm run dev:web           # 前端 5173，/api 代理到 8787
npm run icons             # 重新生成图标清单（改图标库版本后执行）
npm run favicon           # 由 favicon.svg 的同一图形重新生成 favicon.ico
npm run hash-password -- '你的密码'
```

**`npm run build` 只做打包，不做类型检查。** Vite 会忽略类型错误，所以改完 .ts/.tsx 必须单独跑 `npm run typecheck --workspace web`——这一条漏过好几次，漏了会在运行时才暴露。

---

## 提交之前必须满足

1. `npm test` 全绿（66 个用例）
2. `npm run typecheck --workspace web` 零错误
3. `npm run build` 五项检查全绿（体积、图标名、类名、对比度）
4. 涉及界面/尺寸的改动，**实测数值而不是看截图**（见下面的"验证方法"）

**不要把同一个问题的多轮微调拆成多个提交。** 功能边界才值得单独提交；一轮轮调尺寸、调颜色的过程应该合成一个。

**提交信息用中文，写清"为什么"和实测数据。** 不要写"修复 bug"这种没有信息量的话。仓库里的历史提交是范例。

---

## 架构要点

```
server/src/
  app.js        应用组装：中间件、路由挂载、静态托管、错误处理
  index.js      入口：配置自检、启动、优雅关闭
  config.js     .env 解析（已存在的环境变量优先，不会被文件覆盖）
  db.js         SQLite 打开 + schema 执行（WAL 模式）
  schema.sql    5 张表，全部 CREATE TABLE IF NOT EXISTS
  dates.js      日期纯函数
  stats.js      统计纯函数（聚合、连续天数、趋势分桶）
  site.js       站点信息默认值、读取与首屏 HTML 注入
  auth.js       scrypt 校验、会话、限速、clientIp
  routes/       site / tags / activities / notes / stats / auth
web/src/
  icons/        图标三层结构（见下）
  pages/        日历 / 统计 / 随手记 / 管理 / 登录
  components/   当天面板、确认弹窗、趋势图、环形图、品牌标记
  lib/          日期工具、useAsync、preview（预览取舍规则）
  state/        登录态、提示条
  styles/       tokens / base / layout / components
```

### 关键设计决定（不要"顺手优化"掉）

- **日期一律存 `YYYY-MM-DD` 本地字符串**，日历算术用 UTC 做。用 `Date` 对象或时间戳会把深夜记录挪到相邻日期——这是这类应用最常见的错误来源。
- **活动一行一条记录**，次数由 `COUNT(*)` 得出。不要加冗余的 `count` 列。
- **统计在 JS 纯函数里算**，不写复杂 SQL。每个口径都要能被单测覆盖（连续天数这类边界密集的逻辑尤其如此）。
- **单管理员、无用户表**。鉴权是一个二值判断，不是权限系统。
- **站点文案（title / subtitle / description）存 `settings` 表**，不写 `.env`：后台保存即生效，且能跟着数据库一起备份。默认值在 `server/src/site.js`，前端加载失败时的兜底值在 `web/src/state/site.tsx`，改动时两处同步。
- **首屏 title / meta description 由服务端注入**（`renderIndexHtml`），不能只靠前端 `useEffect`——爬虫通常不执行 JS，否则抓到的还是打包时的默认文案。首页与 `/index.html` 必须注册在 `serveStatic` 之前，SPA 深链接走 `notFound` 时也要注入。
- **`config.adminPasswordHash` 是 getter**，运行时读环境变量。别改成启动时快照，否则轮换密码需要重启。

---

## 容易踩的坑

### CSS 顺序：基础规则必须在媒体查询之前

媒体查询**不增加优先级**。同优先级下后写的赢。把基础规则写在媒体查询后面，会把移动端的值反向覆盖，表现是"尺寸怎么改都没反应"。

```css
/* ✗ 错：这个 10px 会盖掉下面媒体查询里的 5px */
@media (max-width: 899px) { .x { font-size: 5px } }
.x { font-size: 10px }

/* ✓ 对：基础在前，覆盖在后 */
.x { font-size: 10px }
@media (max-width: 899px) { .x { font-size: 5px } }
```

这个坑在 `.day-cell` 和 `.day-preview-count` 上都踩过，第二个坑导致线上"数字字号改了没反应"，查了好几轮。

### 图表：不使用 `preserveAspectRatio="none"`

那会让宽高独立缩放，折线被压扁、圆点变椭圆。高度固定、宽度交给 CSS（`width: 100%`），只有窄屏用 `min-width` + 横向滚动。

**`min-width` 必须设在 SVG 自己身上**，设在滚动容器上不会让子元素超出。

### 坐标轴对齐：用同一个坐标系算绝对位置

SVG 里的圆点在 viewBox 坐标系中定位（含 `PAD_LEFT` 内边距），而 HTML 标签用百分比 `left` 定位、基准是容器的 padding 盒——两者基准不同，会整体偏移一个 `PAD_LEFT`。正确做法是把两者都算成"占整块画布的比例"（`coord.x / unit`），并且标签容器不设左右 padding。

### 图标：绝不能整库导入

```js
// ✗ 会把 6238 个图标（约 5 MB）静默塞进公开页面入口包，构建不报错、只是访客变慢
import * as Icons from "@tabler/icons-react";
const C = Icons["Icon" + name];
```

三层结构：

| 层 | 位置 | 谁加载 |
| --- | --- | --- |
| 常用 60 个 | `web/src/icons/common.ts` 显式具名 import | 所有访客（入口包） |
| 全库 6238 个 | `web/src/icons/generated/`（生成物） | 真用到冷门图标的访客，懒加载 chunk |
| 选择器 | `IconPicker` | 仅管理员，点开时 |

`scripts/check-bundle-size.mjs` 会拦住整库导入。服务端的图标名白名单由 `scripts/gen-icon-catalog.mjs` 生成到 `server/src/icon-names.json`。

### 日期边界

- `dates.js` 与 `web/src/lib/date.ts` 是**两份**实现（前后端各自用），改动时两边都要改。
- "今天"按服务器本地时区判定。部署时务必设 `TZ`，否则北京时间 0:00–8:00 的记录会算到前一天。

### 写操作有频率上限

`server/src/app.js` 的中间件限制**每 IP 每分钟 120 次写操作**。批量补记历史会撞到 429——参考 `scripts/seed-demo.mjs` 里的退避重试写法。

### 热力图：隐藏而不是不渲染

贡献图是 `grid-auto-flow: column` 布局。超过今天的格子要用 `visibility: hidden` 保留占位，**不能直接不渲染**——少一个节点会让后面所有格子往前挪、整列错位。

---

## 验证方法

**尺寸与几何问题必须读布局数值，不能看截图。** 截图会骗人，尤其是在缩放过的预览里。这个仓库里因为"目测截图"误判过至少三次。

可用手段（按可靠性排序）：

1. **单元测试**——纯逻辑（日期、统计、预览取舍规则）优先抽成纯函数再测。`web/test/` 与 `server/test/` 都用 `node --test`，Node 24 原生支持直接跑 `.ts`。
2. **浏览器实测**——`scripts/screenshot.mjs` 起 `chrome-headless-shell` 并通过 CDP 读 `getBoundingClientRect()`、`getComputedStyle()`。
   ```bash
   BASE=http://127.0.0.1:8787 node scripts/screenshot.mjs [pages]
   node scripts/screenshot-admin.mjs --password '你的密码'
   ```
   产物在 `.tmp/shots/`。截图脚本要放宽执行权限（Chromium 多进程需要命名管道）。
3. **构建期静态检查**——体积、图标名、JSX 类名与 CSS 的一致性、对比度。

**要验证"某个 CSS 值是否真的生效"时，读**浏览器计算值**（`getComputedStyle().fontSize`），不要读源码。**源码里写着 5px 但它可能被别的规则覆盖——这正是"改了没反应"类 bug 的典型形态。

---

## 部署（当前线上形态）

线上是 **Ubuntu 24.04 + Node 22 + systemd + 宝塔面板反代**，不是容器。

| 项目 | 值 |
| --- | --- |
| 域名 | `https://daily.huajimc.cn`（宝塔反向代理 → `127.0.0.1:8787`） |
| 代码 | `/www/wwwroot/what-i-did`（站点根，只读 555） |
| 数据 | `/var/lib/what-i-did/`（**故意放在站点目录外**，见下） |
| 服务 | `systemctl status what-i-did`，以 `whatidid` 非 root 运行 |
| 日志 | `journalctl -u what-i-did -n 50` |

### 三条硬约束

1. **数据库不能放在站点目录里。** 宝塔管理站点时会 chown/chmod 整个目录，会把 `.db` 改成只读（`SQLITE_READONLY`，表现为登录 500）。数据固定在 `/var/lib/what-i-did/`，`systemd` 的 `ReadWritePaths` 也只放这一个目录。

2. **不要用 `chmod -R a-w` 一把梭。** 这条命令会把数据文件也变只读。要限制写权限就精确到具体目录，或者用 systemd 的 `ProtectSystem` + `ReadWritePaths` 来做。

3. **反代必须透传 `X-Forwarded-For`。** 服务端按它取客户端 IP 做登录限速；丢了会让所有访客共用同一个额度，"别人输错密码把你锁住"。宝塔的反代默认带这个头。

### 升级

```bash
cd /www/wwwroot/what-i-did
git pull && npm ci && npm run build
systemctl restart what-i-did
```

服务启动时会重新执行 `schema.sql`（全幂等），回滚代码不会破坏数据。

### 备份

SQLite 开了 WAL，**不能直接 `cp` 主文件**（新写入可能还在 `-wal` 里）。

```bash
systemctl stop what-i-did
cp /var/lib/what-i-did/what-i-did.db ~/backup-$(date +%F).db
systemctl start what-i-did
```

或用 SQLite 自己的备份 API（`db.backup()`），不必停服务。

### 关于 Docker

仓库里保留了 `Dockerfile` / `docker-compose.yml` 作为**可选**的部署方式，但**当前线上不用容器**——这台 1.6 GB 内存的 VPS 上，直接跑 Node 更省事，也没有镜像拉取开销。

如果以后要用，注意两点（都已写进 Dockerfile）：

- **基础镜像用 glibc（`node:22-bookworm-slim`），不要 Alpine。** `better-sqlite3` 包内自带全平台预编译二进制（`node_modules/better-sqlite3/prebuilds/linux-x64.node`）。实测 glibc 上安装走预编译、8 秒完成且不生成 `build/Release`；Alpine 上会退化成 `node-gyp` 现场编译，在小内存机器上能卡到超时（实测 `gyp ERR! find Python`）。
- **编译依赖（`python3 make g++`）必须在 `npm ci` 之前装好**，装完立即清理，不留在最终层里。

---

## 已知限制

- 时区按服务器本地时间判定"今天"。部署时设 `TZ`。
- 登录限速是内存实现，重启进程清零。单管理员场景够用；多实例部署需要改成共享存储。
- 深色模式跟随系统偏好，没有手动开关。
- 界面没有自动化 E2E 测试，靠构建期静态检查 + 人工核对清单。

---

## 协作时的自我约束

这些是本仓库作者明确要求过的：

- **改动前先确认"要动的是哪一层"**，不要为了修 A 而破坏 B 的正常参数（例如为了消掉右侧留白去拉伸图表，结果把正方形格子压成长方形）。
- **同一个问题反复修不好时，质疑设计本身，而不是继续调参数。** 折线图"内容完整却有滚动条"连改三轮才发现根因是"宽度由 JS 算出来"这个脆弱结构，改成 CSS 控制后问题消失。
- **不确定就问，不要猜。** 猜错的代价往往比问一句大得多——比如"滚动条在卡片里还是整页"这一句，能省掉整轮无效排查。
- **不要为了让某个补丁生效去动无关参数。** 修边框溢出时把列间距从 3px 压到 2px，属于用新问题换旧问题。
- **报告进展时说实测数据，不要说"应该没问题"。**
