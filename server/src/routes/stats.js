import { Hono } from "hono";
import { normalizeRange } from "../dates.js";
import { buildTrend, computeStreaks, countByDate, summarizeByTag, summarizeOverall } from "../stats.js";
import { parseIdList, ValidationError } from "../validate.js";

/**
 * 统计接口。所有口径都由一次区间查询 + 纯函数计算得出，
 * 因此"月度/年度/自定义时段"只是 from/to 的不同取值，不需要三套代码。
 */
export function statsRoutes({ db, clock = () => new Date() }) {
  const routes = new Hono();

  const selectTags = db.prepare("SELECT id, name, icon, color, sort_order FROM tags ORDER BY sort_order ASC, id ASC");
  const selectActivities = db.prepare("SELECT date, tag_id FROM activities WHERE date >= ? AND date <= ?");
  const selectNoteCounts = db.prepare("SELECT date, COUNT(*) AS c FROM notes WHERE date >= ? AND date <= ? GROUP BY date");

  /** 解析公共查询参数：from/to 必填，tag_ids 可选 */
  function parseQuery(c) {
    const from = c.req.query("from");
    const to = c.req.query("to");
    if (!from || !to) throw new ValidationError("必须提供 from 与 to 参数");
    const range = normalizeRange({ from, to });
    const tagIds = parseIdList(c.req.query("tag_ids"));
    const rows = selectActivities.all(range.from, range.to);
    return { range, tagIds, rows: tagIds ? rows.filter((r) => tagIds.includes(r.tag_id)) : rows };
  }

  /** 汇总：总体 + 每个 Tag 的次数/天数/占比 + 连续天数 */
  routes.get("/summary", (c) => {
    const { range, rows, tagIds } = parseQuery(c);
    const tags = selectTags.all();
    const visibleTags = tagIds ? tags.filter((t) => tagIds.includes(t.id)) : tags;
    return c.json({
      from: range.from,
      to: range.to,
      overall: summarizeOverall(rows, range.from, range.to),
      tags: summarizeByTag(rows, visibleTags),
      streak: computeStreaks(rows, localToday(clock())),
    });
  });

  /** 单独取连续天数：卡片可能只刷新这一项 */
  routes.get("/streak", (c) => {
    const { range, rows } = parseQuery(c);
    return c.json({ ...computeStreaks(rows, localToday(clock())), from: range.from, to: range.to });
  });

  /** 趋势：按天/周/月分桶，空桶补 0 */
  routes.get("/trend", (c) => {
    const { range, rows } = parseQuery(c);
    const bucket = c.req.query("bucket") ?? "day";
    if (!["day", "week", "month"].includes(bucket)) {
      throw new ValidationError("bucket 只能是 day / week / month");
    }
    return c.json({ from: range.from, to: range.to, bucket, points: buildTrend(rows, range.from, range.to, bucket) });
  });

  /** 分布：环形图数据 + 每日总量（前端画叠加柱状时用得上） */
  routes.get("/distribution", (c) => {
    const { range, rows } = parseQuery(c);
    const tags = selectTags.all();
    const summary = summarizeByTag(rows, tags).filter((t) => t.count > 0);
    return c.json({ from: range.from, to: range.to, total: rows.length, tags: summary });
  });

  /** 随手记计数：贡献图 */
  routes.get("/notes", (c) => {
    const from = c.req.query("from");
    const to = c.req.query("to");
    if (!from || !to) throw new ValidationError("必须提供 from 与 to 参数");
    const range = normalizeRange({ from, to });
    const counts = {};
    for (const row of selectNoteCounts.all(range.from, range.to)) counts[row.date] = row.c;
    return c.json({ from: range.from, to: range.to, counts });
  });

  /** 活动每日总量，供日历之外的迷你图使用 */
  routes.get("/daily", (c) => {
    const { range, rows } = parseQuery(c);
    return c.json({ from: range.from, to: range.to, counts: Object.fromEntries(countByDate(rows)) });
  });

  return routes;
}

/** 服务器本地的今天（与 dates.today 同口径，这里避免额外 import 造成循环依赖） */
function localToday(clock) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${clock.getFullYear()}-${pad(clock.getMonth() + 1)}-${pad(clock.getDate())}`;
}
