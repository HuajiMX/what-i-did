import { Hono } from "hono";
import { nowIso } from "../db.js";
import { isDateString, normalizeRange } from "../dates.js";
import { groupByDateTag } from "../stats.js";
import { parseIdList, readJsonBody, requireDate, requireInt, ValidationError } from "../validate.js";

/**
 * 活动记录。一行 = 一次。
 * 日历要的是"每天每个 Tag 几次"，因此区间查询直接返回 AggregatedByDate 结构，
 * 不把成千上万行原样丢给前端（十年数据也只是一天的几十个键）。
 */
export function activityRoutes({ db }) {
  const routes = new Hono();

  const insert = db.prepare("INSERT INTO activities (date, tag_id, logged_at) VALUES (?, ?, ?)");
  const tagExists = db.prepare("SELECT id, name FROM tags WHERE id = ?");
  const selectRange = db.prepare(
    "SELECT date, tag_id FROM activities WHERE date >= ? AND date <= ? ORDER BY date ASC, tag_id ASC",
  );
  const selectDay = db.prepare(`
    SELECT a.id, a.tag_id, t.name AS tag_name, t.icon, t.color, a.logged_at
    FROM activities a JOIN tags t ON t.id = a.tag_id
    WHERE a.date = ?
    ORDER BY a.logged_at DESC, a.id DESC
  `);
  const selectOne = db.prepare("SELECT id, date, tag_id FROM activities WHERE id = ?");
  const removeById = db.prepare("DELETE FROM activities WHERE id = ?");
  const removeLatest = db.prepare(`
    DELETE FROM activities
    WHERE id = (SELECT id FROM activities WHERE date = ? AND tag_id = ? ORDER BY logged_at DESC, id DESC LIMIT 1)
  `);

  /** 区间视图：{ "2026-05-12": { "3": 2, "5": 1 }, ... } */
  routes.get("/", (c) => {
    const from = c.req.query("from");
    const to = c.req.query("to");
    const tagsParam = c.req.query("tag_ids");
    if (!from || !to) throw new ValidationError("必须提供 from 与 to 参数");
    const range = normalizeRange({ from, to });
    const tagIds = parseIdList(tagsParam);

    const rows = selectRange.all(range.from, range.to);
    const filtered = tagIds ? rows.filter((r) => tagIds.includes(r.tag_id)) : rows;

    const byDate = {};
    for (const [date, perTag] of groupByDateTag(filtered)) {
      byDate[date] = Object.fromEntries(perTag);
    }
    return c.json({ from: range.from, to: range.to, dates: byDate, total: filtered.length });
  });

  /** 某天明细：给出每条记录的 id，前端才能做单条删除 */
  routes.get("/day", (c) => {
    const date = requireDate(c.req.query("date"), "date");
    return c.json({ date, activities: selectDay.all(date) });
  });

  routes.post("/", async (c) => {
    const body = await readJsonBody(c);
    const date = requireDate(body.date, "date");
    const tagId = requireInt(body.tag_id, "tag_id", { min: 1 });
    if (!tagExists.get(tagId)) throw new ValidationError("指定的 Tag 不存在");
    const info = insert.run(date, tagId, nowIso());
    return c.json({ activity: { id: Number(info.lastInsertRowid), date, tag_id: tagId } }, 201);
  });

  /** 连续记 n 次：点一次 +1 是最高频操作，避免前端循环发 n 个请求 */
  routes.post("/bulk", async (c) => {
    const body = await readJsonBody(c);
    const date = requireDate(body.date, "date");
    const tagId = requireInt(body.tag_id, "tag_id", { min: 1 });
    const times = body.times === undefined ? 1 : requireInt(body.times, "times", { min: 1, max: 100 });
    if (!tagExists.get(tagId)) throw new ValidationError("指定的 Tag 不存在");

    const insertMany = db.transaction((n) => {
      const ids = [];
      for (let i = 0; i < n; i += 1) ids.push(Number(insert.run(date, tagId, nowIso()).lastInsertRowid));
      return ids;
    });
    const ids = insertMany(times);
    return c.json({ created: ids.length, ids, date, tag_id: tagId }, 201);
  });

  /** 某天某 Tag 减一次（撤销误点），不要求前端知道具体是哪一条 */
  routes.delete("/latest", (c) => {
    const date = requireDate(c.req.query("date"), "date");
    const tagId = requireInt(Number(c.req.query("tag_id")), "tag_id", { min: 1 });
    const info = removeLatest.run(date, tagId);
    if (info.changes === 0) return c.json({ error: "没有可撤销的记录" }, 404);
    return c.json({ removed: 1, date, tag_id: tagId });
  });

  routes.delete("/:id", (c) => {
    const id = requireInt(Number(c.req.param("id")), "id", { min: 1 });
    const row = selectOne.get(id);
    if (!row) return c.json({ error: "记录不存在" }, 404);
    removeById.run(id);
    return c.json({ removed: { id } });
  });

  return routes;
}
