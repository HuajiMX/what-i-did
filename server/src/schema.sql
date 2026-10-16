-- what-i-did 数据库结构
-- 所有语句都是幂等的：启动时执行一次即可，不需要迁移引擎。
-- 日期一律存 'YYYY-MM-DD' 本地日期字符串，不存时间戳：避免时区把"今天"挪到昨天。

CREATE TABLE IF NOT EXISTS tags (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  icon       TEXT    NOT NULL,
  color      TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL
);

-- 一行 = 一次活动。同一天同一 tag 记两次 = 两行。
-- 不存 count 字段：次数由 COUNT(*) 天然得出，不必维护。
CREATE TABLE IF NOT EXISTS activities (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  date      TEXT    NOT NULL,
  tag_id    INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  logged_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(date);
CREATE INDEX IF NOT EXISTS idx_activities_tag_date ON activities(tag_id, date);

CREATE TABLE IF NOT EXISTS notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_date ON notes(date);

-- 唯一的会话状态。token 主键存 sha256(token)，库文件泄露不等于会话可被冒用。
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip         TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
