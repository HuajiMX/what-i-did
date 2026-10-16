import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(here, "..");
export const PROJECT_ROOT = path.resolve(SERVER_ROOT, "..");

/**
 * 读取 .env（极简实现：只支持 KEY=VALUE、# 注释、可选的成对引号）。
 * 刻意不引 dotenv：格式固定，二十行足够，且解析不了的行会明确报错而不是被静默忽略。
 * 已由真实环境变量提供的键不会被文件覆盖（容器里用环境变量注入时这一点很重要）。
 */
function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) throw new Error(`.env 格式错误（缺少 =）：${rawLine}`);
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const quoted =
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")));
    if (quoted) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(PROJECT_ROOT, ".env"));

function bool(value, fallback) {
  if (value === undefined || value === "") return fallback;
  return !["0", "false", "no", "off"].includes(String(value).toLowerCase());
}

function int(value, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

const isProduction = process.env.NODE_ENV === "production";
const sessionSecret = process.env.SESSION_SECRET ?? "";

export const config = {
  isProduction,
  port: int(process.env.PORT, 8787),
  host: process.env.HOST || "127.0.0.1",
  dbPath: path.resolve(PROJECT_ROOT, process.env.DB_PATH || "./data/what-i-did.db"),
  sessionSecret,
  sessionDays: int(process.env.SESSION_DAYS, 30),
  cookieSecure: bool(process.env.COOKIE_SECURE, true),
  webDist: path.join(PROJECT_ROOT, "web", "dist"),
  /**
   * 密码哈希用 getter 读环境变量，而不是启动时快照一次：
   * ① 测试里可以按用例更换密码；② 线上轮换密码只需改 .env，不必重启进程。
   */
  get adminPasswordHash() {
    return process.env.ADMIN_PASSWORD_HASH ?? "";
  },
};

/** 启动前的配置自检。返回错误信息数组，空数组表示可以启动。 */
export function checkConfig({ requireSecrets = isProduction } = {}) {
  const errors = [];
  if (requireSecrets) {
    if (!sessionSecret || sessionSecret.length < 32) {
      errors.push("SESSION_SECRET 缺失或过短（至少 32 字符）。见 .env.example");
    }
    if (!adminPasswordHash()) {
      errors.push("ADMIN_PASSWORD_HASH 为空，无法登录后台。用 npm run hash-password 生成");
    }
  }
  return errors;
}

const adminPasswordHash = () => process.env.ADMIN_PASSWORD_HASH ?? "";
