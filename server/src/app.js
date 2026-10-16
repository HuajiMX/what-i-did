import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  clientIp,
  createRateLimiter,
  createSessions,
  readCookie,
  SESSION_COOKIE,
} from "./auth.js";
import { config } from "./config.js";
import { nowIso } from "./db.js";
import { activityRoutes } from "./routes/activities.js";
import { authRoutes } from "./routes/auth.js";
import { noteRoutes } from "./routes/notes.js";
import { statsRoutes } from "./routes/stats.js";
import { tagRoutes } from "./routes/tags.js";
import { ValidationError } from "./validate.js";

const here = path.dirname(fileURLToPath(import.meta.url));

/** 图标名白名单：构建期由 scripts/gen-icon-catalog.mjs 生成，运行期零依赖地读一个 json */
function loadIconNames() {
  const file = path.join(here, "icon-names.json");
  if (!existsSync(file)) {
    throw new Error(`缺少 ${file}。请先执行 npm run icons`);
  }
  return new Set(JSON.parse(readFileSync(file, "utf8")).names);
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "DENY",
  // 图片允许 data:（贡献图等内联 svg 用）；不放开任何外部源，因此 CDN 方案一旦引入就会立刻暴露
  "Content-Security-Policy": [
    "default-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join("; "),
};

/**
 * 组装应用。抽成工厂函数是为了让测试能注入内存数据库与假时钟。
 */
export function createApp({ db, clock = () => new Date() } = {}) {
  if (!db) throw new Error("createApp 需要传入 db");

  const iconNames = loadIconNames();
  const sessions = createSessions(db);
  const rateLimiter = createRateLimiter();

  const isAdmin = (c) => sessions.verify(readCookie(c.req.header("cookie"), SESSION_COOKIE));

  const app = new Hono();

  // ── 中间件：安全响应头、写操作鉴权与限速 ────────────────────────────────
  app.use("*", async (c, next) => {
    await next();
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) c.header(key, value);
  });

  app.use("/api/*", async (c, next) => {
    const method = c.req.method;
    const isWrite = method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE";
    // 登录本身必须免鉴权（否则永远无法登录），但它有自己的失败限速
    const isLogin = c.req.path === "/api/auth/login";
    if (isWrite && !isLogin) {
      if (!isAdmin(c)) return c.json({ error: "需要管理员权限" }, 401);
      const ip = clientIp(c);
      const limit = rateLimiter.hit(`write:${ip}`, 120, 60 * 1000);
      if (!limit.allowed) return c.json({ error: "操作过于频繁，请稍后再试" }, 429);
    }
    await next();
  });

  // ── 路由 ────────────────────────────────────────────────────────────────
  app.route("/api/auth", authRoutes({ sessions, rateLimiter, isAdmin }));
  app.route("/api/tags", tagRoutes({ db, iconNames }));
  app.route("/api/activities", activityRoutes({ db }));
  app.route("/api/notes", noteRoutes({ db }));
  app.route("/api/stats", statsRoutes({ db, clock }));

  app.get("/api/me", (c) => c.json({ admin: isAdmin(c), configured: Boolean(config.adminPasswordHash) }));
  app.get("/api/health", (c) => c.json({ ok: true, at: nowIso() }));

  // ── 静态前端 ────────────────────────────────────────────────────────────
  const hasWebDist = existsSync(config.webDist);
  if (hasWebDist) {
    // 带内容哈希的产物可以长缓存；index.html 必须每次校验，否则更新后用户会一直看到旧版本
    app.use("/assets/*", serveStatic({ root: config.webDist, onFound: (p, c) => c.header("Cache-Control", "public, max-age=31536000, immutable") }));
    app.use("/*", serveStatic({ root: config.webDist }));
    const indexHtml = readFileSync(path.join(config.webDist, "index.html"));
    // 前端路由深链接（/stats、/notes）在服务端没有对应文件，回退到 index.html
    app.notFound((c) => {
      if (c.req.path.startsWith("/api/")) return c.json({ error: "接口不存在" }, 404);
      c.header("Content-Type", "text/html; charset=utf-8");
      c.header("Cache-Control", "no-cache");
      return c.body(indexHtml);
    });
  } else {
    app.notFound((c) =>
      c.json(
        {
          error: "前端尚未构建",
          hint: "开发时访问 Vite 的地址（npm run dev:web）；部署前执行 npm run build",
        },
        404,
      ),
    );
  }

  // ── 错误处理 ────────────────────────────────────────────────────────────
  app.onError((err, c) => {
    // 带 status 的显式错误（validate.js 的 ValidationError、normalizeRange 的区间错误等）都是客户端错误
    if (Number.isInteger(err?.status) && err.status >= 400 && err.status < 500) {
      return c.json({ error: err.message }, err.status);
    }
    // SQLite 唯一约束冲突等转换为可读信息
    if (typeof err?.code === "string" && err.code.startsWith("SQLITE_CONSTRAINT")) {
      return c.json({ error: "数据冲突：可能存在同名记录" }, 409);
    }
    console.error("[what-i-did] 未处理的错误：", err);
    return c.json({ error: "服务器内部错误" }, 500);
  });

  return app;
}
