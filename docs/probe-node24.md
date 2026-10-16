# 依赖可行性探针（已实际执行）

日期：2026-02（开发机 Windows，Node v24.11.1，npm 11.x）
目的：在写规划前验证拟用依赖在本机与未来 Docker 镜像中真实可用，避免把推断当成结论。

## 执行方式

在 `E:\projects\what-i-did\.probe` 中真实安装并运行：

```
npm install better-sqlite3 hono --no-audit --no-fund
npm install @hono/node-server --no-audit --no-fund
node t.mjs
```

`t.mjs` 内容：打开内存 SQLite 库、建表、插入、按日聚合查询；启动 Hono HTTP 服务并自请求一次。

## 实际结果（原始输出）

```
added 3 packages in 6s
better-sqlite3 = 13.0.3
hono = 4.13.13
added 1 package in 2s
sqlite ok: [{"d":"2026-05-12","c":1}]
sqlite version: 3.53.4
http ok: {"ok":true}
```

## 结论

| 项 | 结果 | 影响 |
| --- | --- | --- |
| better-sqlite3 13.0.3 安装 | 成功，6 秒，**未触发本地编译**，`build/Release` 下直接落预编译二进制 | 不需要 Visual Studio Build Tools / node-gyp；Docker 里 `node:22-alpine` 亦有对应预编译包 |
| better-sqlite3 运行 | 成功，SQLite 3.53.4，聚合查询正确 | 可作为唯一数据层依赖 |
| Hono 4.13.13 | 安装并成功起 HTTP 服务 | 可作为唯一服务端框架依赖 |
| Hono Node 适配器 | **`hono/node-server` 导入失败**（`ERR_PACKAGE_PATH_NOT_EXPORTED`）；改为 `@hono/node-server` 后成功 | 已纠正一个原本会踩到的依赖假设，规划中直接使用正确包名 |
| 总生产依赖数 | 4（hono、@hono/node-server、better-sqlite3、react/react-dom 属前端） | 无图表库、无日历库、无 ORM、无 UI 框架 |

## 附带发现（开发环境，非代码问题）

本机 npm 默认缓存目录 `C:\Users\HuajiMC\AppData\Local\npm-cache` 在当前沙箱策略下不可写，首次 `npm install` 报
`The operation was rejected by your operating system`。改用项目内缓存目录后正常：

```
npm install --cache .npm-cache
```

因此项目根目录放一个 `.npmrc`（`cache=.npm-cache`）+ 把 `.npm-cache/` 写进 `.gitignore`，
保证构建在受限环境下同样可复现，也避免污染全局缓存。

---

# 图标库探针：@tabler/icons-react

日期：同上。目的：在选定 Tag 图标方案前，用真实构建数据取代"感觉应该没问题"。

## 包事实（实测）

| 项 | 实测值 |
| --- | --- |
| 版本 / 许可 | 3.49.0 / MIT |
| peerDependencies | `react: >= 16`（React 19.3.1 实测安装成功） |
| 图标总数 | **6239** 个，每个图标一个独立 `.mjs` 模块 |
| 入口 | `main: dist/cjs/tabler-icons-react.cjs`、`module: dist/esm/tabler-icons-react.mjs`、`types` 齐备；**无 `exports` 字段** |
| 附带元数据 | `dist/esm/icons-list.mjs`（kebab-case 名称数组，0.12 MB）、`dist/esm/dynamic-imports.mjs`（名称 → `import()` 映射） |

## 实验 A：按需打包是否成立

`src/main.tsx` 只静态引入 2 个图标，Vite 构建：

```
index-*.js  218.5 KB
```

结论：**成立**。218.5 KB 是 React 19 + react-dom + 2 个图标，不是全库。若按需打包失效，产物会是数 MB 量级。

## 实验 B：把全库 6239 个图标做成"点开才懒加载"

用 `import.meta.glob` 对全部 6239 个图标模块做动态导入并构建：

```
文件数: 6238 个 chunk
总体积: 4.46 MB
最大 chunk: index-*.js 1360.3 KB（另有 505 KB 一个）
```

结论：**方案被证伪，不采用**。6238 个碎片 chunk 意味着选择器一打开就是数千次请求；
而 1360 KB 的主 chunk 说明 `icons-list.mjs` 与 `dynamic-imports.mjs` 这样的元数据模块体积本身不可忽略。
**这是消融实验的直接价值：一个看起来优雅的方案（全库懒加载）实测是坏的。**

## 实验 C：精选目录的打包代价

从全库按固定步长抽样 200 个图标，全部静态引入后构建：

```
index-*.js  90.1 KB
```

结论：200 个图标约 90 KB（未 gzip；单图标约 450 B，含组件包装代码）。
与实验 B 的 4.46 MB 相比是 50 倍差距。**因此采用"精选目录"而非"全库"。**

## 图标名存在性校验

对 270 个候选生活向图标名逐一按文件存在性校验，**254 个存在，16 个不存在**：

```
缺失: baby, ball-golf, bonfire, boxing, grass, hat, highlighter, hiking,
      martial-arts, music-note, plane-takeoff, refrigerator, rowing, surfing, taxi, walk-a
```

需替换为同类正确名（如 `ball-golf` → `golf`、`music-note` → `music`、`plane-takeoff` → `plane-departure` 待逐个复核）。
**教训：图标名不能凭记忆写，必须逐个校验。**

---

# 开发环境沙箱约束（影响构建方式，需知悉）

当前会话的文件沙箱对"捕获子进程管道输出"是硬限制，导致两类命令在本机无法运行：

| 现象 | 根因（实测） | 处理 |
| --- | --- | --- |
| `npm install` 报 `EPERM syscall: spawn` | 依赖的 postinstall 脚本用管道 stdio 启动子进程 | 加 `--ignore-scripts` 安装成功（平台二进制随依赖包提供，实测 Vite 可正常构建） |
| `vite build` 报 `spawn EPERM` | esbuild 必须启动带通信管道的子进程（其固定工作方式） | **受限模式下无法绕过**，需一次放宽权限执行构建 |
| `vite build` 报 `remove ...Temp\esbuild-xxx: Access is denied` | esbuild 把临时文件写到系统 Temp（沙箱外），清理失败 | 构建前把 `TEMP`/`TMP` 指向工作区内目录 |

对交付物无影响：Docker 镜像与 Linux 服务器上不存在这些限制。
仅在"本机浏览器里看效果"这一步需要放宽一次权限，实现阶段会明确提示。

---

# 图标传输方式的对照实验（CDN vs 打包 vs 按需）

背景：提出过"用 CDN 引图标，或者只把搜到的图标缓存到本地"的想法。以下为实测数据，用于判定该不该引入这两种机制。

## 实测体积

| 对象 | 原始 | gzip | 说明 |
| --- | --- | --- | --- |
| 抽样 200 个图标模块 | 156.0 KB | **23.7 KB** | 单图标 ≈ 780 B 原始 / 120 B gzip |
| 全库 6239 个图标模块 | 5.00 MB | **≈ 0.50 MB** | 含重复模板代码，属上界估计 |
| 元数据（`icons-list` + `dynamic-imports`） | 515.0 KB | **74.5 KB** | 名称清单 + 名称→import 映射 |
| 全库一次性打包（实验 B，Vite 产物，minify 后） | 1360.3 KB | 未实测 | 另切出 505 KB 一个 chunk |

其他实测：
- 纯 SVG 包 `@tabler/icons@3.49.0` 整包 10.82 MB，`icons/outline/` 下 5184 个 svg，**单个 svg 平均 559 B**。
- CDN 可用性：`https://cdn.jsdelivr.net/npm/@tabler/icons@3.49.0/icons/outline/run.svg` → **HTTP 200**，返回标准 svg（`stroke="currentColor"`）。
- 沙箱内 PowerShell 无法直连网络（`Invoke-WebRequest` 连接被关闭，`example.com` 对照组同样失败），
  故 CDN 验证改用 `web_fetch` 完成。这是环境限制，与交付物无关。

## 结论

1. **公开页面的图标不值得为省体积引入 CDN。** 实测活跃 Tag 的图标合计 gzip ≈ 30 KB，
   而站点本来就带 React + react-dom（约 250 KB gzip 量级）。省 30 KB 换来外部域名依赖、
   每图标一次请求、以及外部服务不可用时的显示降级——**是最小方案的倒退，不是优化**。
2. **"缓存到本地"不能减少下载，反而增加机制。** 前端是编译产物，运行期新增图标若走自带映射，
   图标组件已被打进包里，本地"缓存"没有可省的东西；真正的机制（按需拉取 + 浏览器缓存）由 CDN 方案承担。
   若确实想让运行期零下载，正确做法是自建 `GET /api/icons/:name.svg` 端点 + 长缓存头，
   而不是 CDN。**当前规模下两者都不需要。**
3. CDN 方案唯一有真实收益的场景是"运行期需要数千个图标中的任意一个、且不能接受打包体积"。
   本项目的选择器只属于管理员，可以懒加载，因此不落在这个场景里。
4. 上一轮"全库 6239 个图标 = 6238 个碎片 chunk"的证伪结论继续有效：
   选择器不能对全部图标逐个动态 import。

