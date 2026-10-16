import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

/**
 * 鉴权。刻意保持"一个人一把钥匙"的规模：
 * 没有 users 表、没有角色、没有权限系统，只有一个二值判断（是不是管理员）。
 * 新增这些结构在当前需求下不会解决任何问题，只会增加状态。
 */

export const SESSION_COOKIE = "wid_session";

/** 生成 `npm run hash-password` 写入 .env 的哈希格式：scrypt$N$r$p$salt$hash（均为 base64url） */
export function hashPassword(password, { N = 16384, r = 8, p = 1 } = {}) {
  const salt = randomBytes(16);
  const hash = scryptSync(normalizePassword(password), salt, 64, { N, r, p, maxmem: 128 * 1024 * 1024 });
  return ["scrypt", N, r, p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

function normalizePassword(password) {
  // 用 UTF-8 字节而非 JS 字符串比较，避免非 ASCII 密码在编码上产生歧义
  return Buffer.from(String(password), "utf8");
}

/** 校验密码。哈希格式非法时返回 false，不抛异常（避免把配置错误暴露成不同的响应）。 */
export function verifyPassword(password, stored) {
  if (typeof stored !== "string" || !stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const N = Number.parseInt(nRaw, 10);
  const r = Number.parseInt(rRaw, 10);
  const p = Number.parseInt(pRaw, 10);
  if (![N, r, p].every((v) => Number.isInteger(v) && v > 0)) return false;
  let expected;
  try {
    expected = Buffer.from(hashB64, "base64url");
  } catch {
    return false;
  }
  let actual;
  try {
    actual = scryptSync(normalizePassword(password), Buffer.from(saltB64, "base64url"), expected.length, {
      N,
      r,
      p,
      maxmem: 256 * 1024 * 1024,
    });
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const hashToken = (token) => createHash("sha256").update(token).digest("hex");

/**
 * 会话存储。唯一状态是 sessions 表。
 * 库里只存 token 的 sha256：库文件泄露不等于会话可被冒用。
 */
export function createSessions(db) {
  const insert = db.prepare("INSERT INTO sessions (token, created_at, expires_at, ip) VALUES (?, ?, ?, ?)");
  const remove = db.prepare("DELETE FROM sessions WHERE token = ?");
  const find = db.prepare("SELECT token, expires_at FROM sessions WHERE token = ?");
  const sweep = db.prepare("DELETE FROM sessions WHERE expires_at <= ?");

  return {
    /** 返回明文 token（只在这一刻存在于内存里），调用方负责写进 cookie */
    create(ip) {
      const token = randomBytes(32).toString("base64url");
      const now = new Date();
      const expires = new Date(now.getTime() + config.sessionDays * 86400000);
      insert.run(hashToken(token), now.toISOString(), expires.toISOString(), ip ?? null);
      sweep.run(now.toISOString()); // 顺手清理过期会话，不需要定时任务
      return { token, expiresAt: expires };
    },
    /** token 有效则返回 true */
    verify(token) {
      if (typeof token !== "string" || token.length < 20) return false;
      const row = find.get(hashToken(token));
      if (!row) return false;
      if (row.expires_at <= new Date().toISOString()) {
        remove.run(row.token);
        return false;
      }
      return true;
    },
    destroy(token) {
      if (typeof token === "string" && token) remove.run(hashToken(token));
    },
  };
}

/** 解析 Cookie 头，只取需要的那个键 */
export function readCookie(header, name) {
  if (typeof header !== "string" || !header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

export function buildSessionCookie(token, expiresAt) {
  const attrs = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (config.cookieSecure) attrs.push("Secure");
  return attrs.join("; ");
}

export function buildLogoutCookie() {
  const attrs = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (config.cookieSecure) attrs.push("Secure");
  return attrs.join("; ");
}

/**
 * 内存限速。刻意不入库、不引 Redis：单管理员场景下重启即清零完全可以接受。
 * 两种桶：登录失败（防爆破）与写操作（防误用/脚本失控）。
 */
export function createRateLimiter() {
  const buckets = new Map();

  function hit(key, limit, windowMs) {
    const now = Date.now();
    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
    }
    existing.count += 1;
    if (existing.count > limit) {
      return { allowed: false, remaining: 0, retryAfterMs: existing.resetAt - now };
    }
    return { allowed: true, remaining: limit - existing.count, retryAfterMs: 0 };
  }

  // 顺手做一次惰性清扫，避免长期运行时 Map 无界增长
  function sweep() {
    const now = Date.now();
    for (const [key, value] of buckets) if (value.resetAt <= now) buckets.delete(key);
  }

  return {
    hit,
    reset(key) {
      buckets.delete(key);
    },
    clear() {
      buckets.clear();
    },
    sweep,
    size: () => buckets.size,
  };
}

/**
 * 取客户端 IP。默认信任反向代理的 X-Forwarded-For 第一段——
 * 前提是部署上只有反代能访问该端口（HOST 默认 127.0.0.1 正是为此）。
 */
export function clientIp(c) {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  const real = c.req.header("x-real-ip");
  if (real) return real.trim();
  const info = c.env?.incoming?.socket?.remoteAddress;
  return typeof info === "string" && info ? info : "unknown";
}
