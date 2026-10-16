/**
 * 统计。全部是纯函数：输入活动行数组，输出统计结果。
 *
 * 为什么在 JS 里聚合而不是写复杂 SQL：数据集只有"个人 × 每天几条"，十年也就几万行；
 * 一次取出后在纯函数里算，换来的是每个统计口径都能被单测直接覆盖（尤其是连续天数这类
 * 边界密集的逻辑），而 SQL 里的窗口函数很难测。这是明确的可测试性收益，不是随手决定。
 */

import { bucketKey, eachDay } from "./dates.js";

/**
 * @param {Array<{ date: string, tag_id: number }>} rows 区间内的活动行
 * @returns {Map<string, Map<number, number>>} date → tagId → 次数
 */
export function groupByDateTag(rows) {
  const byDate = new Map();
  for (const row of rows) {
    let perTag = byDate.get(row.date);
    if (!perTag) byDate.set(row.date, (perTag = new Map()));
    perTag.set(row.tag_id, (perTag.get(row.tag_id) ?? 0) + 1);
  }
  return byDate;
}

/** date → 当天的活动总次数 */
export function countByDate(rows) {
  const out = new Map();
  for (const row of rows) out.set(row.date, (out.get(row.date) ?? 0) + 1);
  return out;
}

/**
 * 每个 Tag 的次数 / 活跃天数 / 占比。
 * @param {Array} rows 活动行
 * @param {Array} tags 全部 tag（用于把 0 次的 tag 也列出来，便于筛选器显示完整）
 */
export function summarizeByTag(rows, tags) {
  const stats = new Map();
  for (const tag of tags) stats.set(tag.id, { tag_id: tag.id, count: 0, days: 0, _dates: new Set() });
  for (const row of rows) {
    const entry = stats.get(row.tag_id);
    if (!entry) continue; // 已删除 tag 的残留行（理论上被级联删除，这里做防御）
    entry.count += 1;
    entry._dates.add(row.date);
  }
  const total = rows.length;
  return [...stats.values()]
    .map(({ _dates, ...entry }) => ({
      ...entry,
      days: _dates.size,
      share: total === 0 ? 0 : entry.count / total,
    }))
    .sort((a, b) => b.count - a.count || a.tag_id - b.tag_id);
}

/**
 * 连续天数。有活动的日子算"连上"。
 * current：从今天（或最后一天）往回数。若今天还没有记录，允许从昨天开始数——
 * 否则每天凌晨打开页面都会看到连续天数归零，那是错误的体感。
 */
export function computeStreaks(rows, today) {
  const active = [...new Set(rows.map((r) => r.date))].sort();
  if (active.length === 0) return { current: 0, longest: 0, lastActive: null };

  let longest = 1;
  let run = 1;
  for (let i = 1; i < active.length; i += 1) {
    const prev = Date.parse(`${active[i - 1]}T00:00:00Z`);
    const cur = Date.parse(`${active[i]}T00:00:00Z`);
    if (cur - prev === 86400000) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
  }

  const lastActive = active[active.length - 1];
  const activeSet = new Set(active);
  const anchor = activeSet.has(today) ? today : shiftBack(today, 1);
  let current = 0;
  if (activeSet.has(anchor)) {
    for (let day = anchor; activeSet.has(day); day = shiftBack(day, 1)) current += 1;
  }

  return { current, longest, lastActive };
}

function shiftBack(date, days) {
  const dt = new Date(`${date}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

/**
 * 时间序列。按 bucket 分桶，空桶补 0（否则折线图会把稀疏数据画成误导性的直线）。
 * @param {'day'|'week'|'month'} bucket
 */
export function buildTrend(rows, from, to, bucket = "day") {
  const counts = new Map();
  for (const row of rows) {
    const key = bucketKey(row.date, bucket);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const keys = new Set();
  for (const day of eachDay(from, to)) keys.add(bucketKey(day, bucket));
  return [...keys]
    .sort()
    .map((key) => ({ bucket: key, count: counts.get(key) ?? 0 }));
}

/** 贡献图需要的"每天若干条"计数，含日期填充由前端决定（前端要按周对齐） */
export function noteCountsByDate(rows) {
  const out = new Map();
  for (const row of rows) out.set(row.date, (out.get(row.date) ?? 0) + 1);
  return out;
}

/** 按活动总量把一组计数分成 4 档（0..3），用于热力图/贡献图着色 */
export function intensityLevels(values) {
  const max = Math.max(0, ...values);
  if (max <= 0) return { max: 0, levelOf: () => 0 };
  return {
    max,
    levelOf(value) {
      if (value <= 0) return 0;
      return Math.min(3, Math.ceil((value / max) * 3));
    },
  };
}

/**
 * 汇总块：总数、活跃天数、区间天数。
 */
export function summarizeOverall(rows, from, to) {
  const activeDays = new Set(rows.map((r) => r.date)).size;
  const rangeDays = eachDay(from, to).length;
  return {
    total: rows.length,
    activeDays,
    rangeDays,
    // 活跃率：有活动的天数占区间天数比例
    activeRate: rangeDays === 0 ? 0 : activeDays / rangeDays,
  };
}
