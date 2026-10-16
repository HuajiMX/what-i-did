import { Hono } from "hono";
import {
  buildLogoutCookie,
  buildSessionCookie,
  clientIp,
  readCookie,
  SESSION_COOKIE,
  verifyPassword,
} from "../auth.js";
import { config } from "../config.js";
import { readJsonBody, requireString, ValidationError } from "../validate.js";

/** 登录窗口：同一 IP 15 分钟内最多 5 次失败 */
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;

export function authRoutes({ sessions, rateLimiter, isAdmin }) {
  const routes = new Hono();

  /** 前端唯一的鉴权探针：决定是否显示管理入口 */
  routes.get("/me", (c) => {
    const admin = isAdmin(c);
    return c.json({
      admin,
      // 告诉前端后台是否已正确配置密码，避免"密码对了但服务端没配"这种无从诊断的情况
      configured: Boolean(config.adminPasswordHash),
    });
  });

  routes.post("/login", async (c) => {
    const ip = clientIp(c);
    const limit = rateLimiter.hit(`login:${ip}`, LOGIN_MAX_FAILURES, LOGIN_WINDOW_MS);
    if (!limit.allowed) {
      const minutes = Math.ceil(limit.retryAfterMs / 60000);
      return c.json({ error: `登录失败次数过多，请 ${minutes} 分钟后再试` }, 429);
    }

    const body = await readJsonBody(c);
    const password = requireString(body.password, "password", { max: 256 });

    if (!config.adminPasswordHash) {
      throw new ValidationError("服务端未配置 ADMIN_PASSWORD_HASH，请先执行 npm run hash-password");
    }
    if (!verifyPassword(password, config.adminPasswordHash)) {
      return c.json({ error: "密码错误" }, 401);
    }

    // 成功登录后清掉失败计数，避免正常使用者被自己之前的输错拖累
    rateLimiter.reset(`login:${ip}`);
    const { token, expiresAt } = sessions.create(ip);
    c.header("Set-Cookie", buildSessionCookie(token, expiresAt));
    return c.json({ admin: true });
  });

  routes.post("/logout", (c) => {
    const token = readCookie(c.req.header("cookie"), SESSION_COOKIE);
    if (token) sessions.destroy(token);
    c.header("Set-Cookie", buildLogoutCookie());
    return c.json({ admin: false });
  });

  return routes;
}
