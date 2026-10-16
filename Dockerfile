# 多阶段构建：第一阶段产出前端静态文件，第二阶段只带运行期依赖。
# 最终镜像不含源码、前端工具链与 .env。

# ── 阶段一：构建前端 ────────────────────────────────────────────────────────
FROM node:22-alpine AS web-build
WORKDIR /app

# 先只拷贝清单文件，让依赖层可以被缓存
COPY package.json package-lock.json .npmrc ./
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json

# 编译工具必须在 npm ci **之前**装好。
# Alpine(musl) 上 better-sqlite3 没有预编译二进制，安装时必然走 node-gyp 现场编译；
# 缺 python3/make/g++ 会直接失败（实测报错：gyp ERR! find Python）。
# 刻意不加 --ignore-scripts：better-sqlite3 需要编译原生模块，
# postinstall 还会生成图标清单（server/src/icon-names.json）。
# 装完立即删除这些构建依赖，不留在最终层里。
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
 && npm ci \
 && apk del .build-deps

COPY scripts ./scripts
COPY web ./web
COPY server/src ./server/src

RUN npm run build

# ── 阶段二：运行期 ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json .npmrc ./
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json

# 只装生产依赖。同样需要构建工具：musl 平台没有 better-sqlite3 的预编译包
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
 && npm ci --omit=dev --workspace server --include-workspace-root \
 && npm cache clean --force \
 && apk del .build-deps

# 运行期需要的文件。注意没有 .env —— 配置一律通过环境变量注入
COPY server/src ./server/src
COPY scripts ./scripts
COPY --from=web-build /app/web/dist ./web/dist

# 数据目录由 compose 挂载到宿主机；先用 root 建目录再交给 node 用户
RUN mkdir -p /app/data && chown -R node:node /app/data /app/server /app/web

USER node
EXPOSE 8787
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/src/index.js"]
