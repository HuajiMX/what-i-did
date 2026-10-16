import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * 打开数据库并把 schema.sql 执行一遍（全部语句幂等，无需迁移引擎）。
 * WAL 模式：读不阻塞写，适合"公开读多、管理员偶尔写"的形态。
 * 传入 ':memory:' 时用于测试，不建目录。
 */
export function openDatabase(file = ":memory:") {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(readFileSync(path.join(here, "schema.sql"), "utf8"));
  return db;
}

/** 统一的时间戳格式：UTC ISO 字符串。存的是"记录发生时刻"，不参与日期分组，因此用 UTC 无害。 */
export const nowIso = () => new Date().toISOString();

/** 返回 { db, close } —— 测试里用它拿到一个独立的内存库。 */
export function createDatabase(file = ":memory:") {
  const db = openDatabase(file);
  return {
    db,
    close() {
      db.close();
    },
  };
}
