/**
 * 日期工具。全部按"本地日期字符串 YYYY-MM-DD"处理，不引入时区概念。
 *
 * 为什么不用时间戳：用户心智里的"今天"是本地的今天。存 ISO 时间戳再按 UTC 切分会把
 * 深夜和清晨的记录挪到相邻的日期上，这是这类应用最常见的错误来源。
 * 因此内部一律用 UTC 构造仅含年月日的 Date，只为做日历算术，不参与时刻比较。
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const WEEK_START = 1; // 周一为一周之始（中国大陆习惯）

export function isDateString(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  // 反向校验：拒绝 2 月 30 日这类"格式合法但日期不存在"的输入
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** 'YYYY-MM-DD' → { y, m, d } */
export function parseDate(value) {
  if (!isDateString(value)) throw new Error(`非法日期：${value}`);
  const [y, m, d] = value.split("-").map(Number);
  return { y, m, d };
}

/** { y, m, d } → 'YYYY-MM-DD' */
export function formatDate({ y, m, d }) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${String(y).padStart(4, "0")}-${pad(m)}-${pad(d)}`;
}

function toUtc(value) {
  const { y, m, d } = parseDate(value);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(dt) {
  return formatDate({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() });
}

export function addDays(value, days) {
  const dt = toUtc(value);
  dt.setUTCDate(dt.getUTCDate() + days);
  return fromUtc(dt);
}

export function addMonths(value, months) {
  const { y, m, d } = parseDate(value);
  const targetMonthIndex = m - 1 + months;
  const year = y + Math.floor(targetMonthIndex / 12);
  const month = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = daysInMonth(year, month + 1);
  return formatDate({ y: year, m: month + 1, d: Math.min(d, lastDay) });
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 0=周日 … 6=周六（与 Date.getUTCDay 一致） */
export function weekdayOf(value) {
  return toUtc(value).getUTCDay();
}

/** 距本周起始日（周一）的天数偏移：周一=0 … 周日=6 */
export function weekOffset(value) {
  return (weekdayOf(value) - WEEK_START + 7) % 7;
}

export function startOfWeek(value) {
  return addDays(value, -weekOffset(value));
}

/** 该日期所在月的首日 / 末日 */
export function startOfMonth(value) {
  const { y, m } = parseDate(value);
  return formatDate({ y, m, d: 1 });
}

export function endOfMonth(value) {
  const { y, m } = parseDate(value);
  return formatDate({ y, m, d: daysInMonth(y, m) });
}

/** 服务器本地的"今天"。刻意用本地时间：用户与服务器同处一个时区假设下，这才符合"今天"的直觉。 */
export function today(clock = new Date()) {
  return formatDate({ y: clock.getFullYear(), m: clock.getMonth() + 1, d: clock.getDate() });
}

/** [from, to] 闭区间内的所有日期字符串。区间过大时返回空数组以免意外分配巨大内存。 */
export function eachDay(from, to, maxDays = 4000) {
  if (!isDateString(from) || !isDateString(to) || from > to) return [];
  const out = [];
  for (let cur = from; cur <= to; cur = addDays(cur, 1)) {
    out.push(cur);
    if (out.length > maxDays) return out;
  }
  return out;
}

export function daysBetween(from, to) {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86400000);
}

/** 用于趋势图的桶键：按天 = 日期本身，按周 = 该周周一，按月 = 该月 1 日 */
export function bucketKey(date, bucket) {
  if (bucket === "week") return startOfWeek(date);
  if (bucket === "month") return startOfMonth(date);
  return date;
}

/**
 * 校验并规范化一个时间区间参数。
 * 抛出的错误带 status=400：错误处理中间件据此返回"客户端参数有误"而不是 500。
 */
export function normalizeRange({ from, to, maxDays = 3700 }) {
  const invalid = (message) => Object.assign(new Error(message), { status: 400 });
  if (!isDateString(from) || !isDateString(to)) {
    throw invalid("from / to 必须是 YYYY-MM-DD 格式的日期");
  }
  if (from > to) throw invalid("起始日期不能晚于结束日期");
  if (daysBetween(from, to) + 1 > maxDays) {
    throw invalid(`时间区间过长（上限 ${maxDays} 天）`);
  }
  return { from, to };
}
