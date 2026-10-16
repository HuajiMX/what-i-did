import { Hono } from "hono";
import { nowIso } from "../db.js";
import { normalizeRange } from "../dates.js";
import { readJsonBody, requireDate, requireInt, requireString, ValidationError, MAX_NOTE_LENGTH } from "../validate.js";

/** 随手记：一天可写多条，纯文本。 */
export function noteRoutes({ db }) {
  const routes = new Hono();

  const selectRange = db.prepare("SELECT date, id FROM notes WHERE date >= ? AND date <= ? ORDER BY date ASC, id ASC");
  const selectDay = db.prepare("SELECT id, date, content, created_at, updated_at FROM notes WHERE date = ? ORDER BY created_at ASC, id ASC");
  const selectRecent = db.prepare("SELECT id, date, content, created_at, updated_at FROM notes ORDER BY date DESC, created_at DESC LIMIT ?");
  const selectOne = db.prepare("SELECT id, date, content, created_at, updated_at FROM notes WHERE id = ?");
  const insert = db.prepare("INSERT INTO notes (date, content, created_at, updated_at) VALUES (?, ?, ?, ?)");
  const remove = db.prepare("DELETE FROM notes WHERE id = ?");
  const countRange = db.prepare("SELECT COUNT(*) AS c FROM notes WHERE date >= ? AND date <= ?");
  /** 有记录的年份：年份筛选只列出这些，避免出现一堆永远空着的年份 */
  const selectYears = db.prepare("SELECT DISTINCT substr(date, 1, 4) AS year FROM notes ORDER BY year DESC");

  /** 贡献图数据：区间内按天计数 + 总数。前端按周对齐补空格子。 */
  routes.get("/", (c) => {
    const from = c.req.query("from");
    const to = c.req.query("to");
    if (!from || !to) throw new ValidationError("必须提供 from 与 to 参数");
    const range = normalizeRange({ from, to });
    const counts = {};
    for (const row of selectRange.all(range.from, range.to)) {
      counts[row.date] = (counts[row.date] ?? 0) + 1;
    }
    return c.json({
      from: range.from,
      to: range.to,
      counts,
      total: countRange.get(range.from, range.to).c,
    });
  });

  routes.get("/day", (c) => {
    const date = requireDate(c.req.query("date"), "date");
    return c.json({ date, notes: selectDay.all(date) });
  });

  /** 有记录的年份（降序）。年份筛选只列这些，避免出现一排点进去空空的年份 */
  routes.get("/years", (c) =>
    c.json({ years: selectYears.all().map((row) => Number.parseInt(row.year, 10)) }),
  );

  routes.get("/recent", (c) => {
    const limit = Math.min(Math.max(Number.parseInt(c.req.query("limit") ?? "20", 10) || 20, 1), 100);
    return c.json({ notes: selectRecent.all(limit) });
  });

  routes.post("/", async (c) => {
    const body = await readJsonBody(c);
    const date = requireDate(body.date, "date");
    const content = requireString(body.content, "content", { max: MAX_NOTE_LENGTH });
    const stamp = nowIso();
    const info = insert.run(date, content, stamp, stamp);
    return c.json({ note: selectOne.get(info.lastInsertRowid) }, 201);
  });

  routes.patch("/:id", async (c) => {
    const id = requireInt(Number(c.req.param("id")), "id", { min: 1 });
    const current = selectOne.get(id);
    if (!current) return c.json({ error: "随手记不存在" }, 404);
    const body = await readJsonBody(c);
    const content = body.content === undefined ? current.content : requireString(body.content, "content", { max: MAX_NOTE_LENGTH });
    const date = body.date === undefined ? current.date : requireDate(body.date, "date");
    db.prepare("UPDATE notes SET content = ?, date = ?, updated_at = ? WHERE id = ?").run(content, date, nowIso(), id);
    return c.json({ note: selectOne.get(id) });
  });

  routes.delete("/:id", (c) => {
    const id = requireInt(Number(c.req.param("id")), "id", { min: 1 });
    if (!selectOne.get(id)) return c.json({ error: "随手记不存在" }, 404);
    remove.run(id);
    return c.json({ removed: { id } });
  });

  return routes;
}
