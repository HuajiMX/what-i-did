# 多阶段构建：第一阶段产出前端静态文件，第二阶段只带运行期依赖。
# 最终镜像不含源码、前端工具链与 .env。
#
# 为什么用 bookworm-slim（glibc）而不是 alpine（musl）：
#   better-sqlite3 包内自带全平台预编译二进制（node_modules/better-sqlite3/prebuilds/）。
#   实测在 glibc 上安装走预编译，8 秒完成、不生成 build/Release；
#   而在 alpine 上会退化成 node-gyp 现场编译，在 1.6 GB 内存的小 VPS 上能卡到超时
#   （实测报错：gyp ERR! find Python）。
#   下面仍保留构建工具作为兜底——万一某个版本没有对应预编译包，也能编译通过。

# ── 阶段一：构建前端 ────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS web-build
WORKDIR /app

# 先只拷贝清单文件，让依赖层可以被缓存
COPY package.json package-lock.json .npmrc ./
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json

# 编译工具必须在 npm ci **之前**装好：缺了会在 better-sqlite3 的 node-gyp 步骤直接失败。
# 刻意不加 --ignore-scripts：postinstall 会用 scripts/gen-icon-catalog.mjs 生成图标清单
# （server/src/icon-names.json），跳过后服务端启动会缺图标白名单。
# 装完立即删除这些构建依赖，不留在镜像层里。
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && npm ci \
 && apt-get purge -y --auto-remove python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY scripts ./scripts
COPY web ./web
COPY server/src ./server/src

RUN npm run build

# ── 阶段二：运行期 ──────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json .npmrc ./
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json

# 只装生产依赖。同理需要构建工具兜底（正常情况下走预编译二进制，不会真的编译）
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && npm ci --omit=dev --workspace server --include-workspace-root \
 && npm cache clean --force \
 && apt-get purge -y --auto-remove python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# 运行期需要的文件。注意没有 .env —— 配置一律通过环境变量注入
COPY server/src ./server/src
COPY scripts ./scripts
COPY --from=web-build /app/web/dist ./web/dist

# 数据目录由 compose 挂载；先用 root 建目录再交给 node 用户
RUN mkdir -p /app/data && chown -R node:node /app/data /app/server /app/web

USER node
EXPOSE 8787
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/src/index.js"]
