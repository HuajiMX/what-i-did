import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { checkConfig, config } from "./config.js";
import { openDatabase } from "./db.js";

const errors = checkConfig();
if (errors.length > 0) {
  console.error("配置有误，拒绝启动：");
  for (const message of errors) console.error(`  - ${message}`);
  process.exit(1);
}

const db = openDatabase(config.dbPath);
const app = createApp({ db });

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`what-i-did 正在监听 http://${info.address}:${info.port}`);
  console.log(`数据库：${config.dbPath}`);
  if (!config.isProduction) console.log("模式：开发（缺配置也会启动；生产请设置 NODE_ENV=production 并补齐 .env）");
  if (!config.cookieSecure && config.host !== "127.0.0.1") {
    console.warn("警告：COOKIE_SECURE=false 且监听非本机地址，会话 cookie 会在明文 HTTP 上传输");
  }
});

function shutdown(signal) {
  console.log(`\n收到 ${signal}，正在关闭…`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  // 兜底：连接迟迟不释放时也要退出，避免容器僵住
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
