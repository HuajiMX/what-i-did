/**
 * 前端日期工具。与服务端 server/src/dates.js 保持同一口径：
 * 日期是 'YYYY-MM-DD' 字符串，内部用 UTC 构造仅含年月日的 Date 做日历算术。
 * 这里额外提供日历网格、月标签、贡献图对齐等纯展示用的函数。
 */

export const WEEKDAY_LABELS_MON = ["一", "二", "三", "四", "五", "六", "日"];
export const WEEKDAY_SHORT = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
export const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const parts = value.split("-").map(Number);
  const y = parts[0]!;
  const m = parts[1]!;
  const d = parts[2]!;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toUtc(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function fromUtc(dt: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatDate(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function addDays(value: string, days: number): string {
  const dt = toUtc(value);
  dt.setUTCDate(dt.getUTCDate() + days);
  return fromUtc(dt);
}

export function addMonths(value: string, months: number): string {
  const [y, m, d] = value.split("-").map(Number);
  const target = m! - 1 + months;
  const year = y! + Math.floor(target / 12);
  const month = ((target % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return formatDate(year, month + 1, Math.min(d!, lastDay));
}

/** 0=周日 … 6=周六 */
export function weekdayOf(value: string): number {
  return toUtc(value).getUTCDay();
}

/** 周一为 0 … 周日为 6 */
export function weekOffset(value: string): number {
  return (weekdayOf(value) + 6) % 7;
}

export function startOfWeek(value: string): string {
  return addDays(value, -weekOffset(value));
}

export function startOfMonth(value: string): string {
  const [y, m] = value.split("-").map(Number);
  return formatDate(y!, m!, 1);
}

export function endOfMonth(value: string): string {
  const [y, m] = value.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return formatDate(y!, m!, lastDay);
}

export function today(): string {
  const now = new Date();
  return formatDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function eachDay(from: string, to: string): string[] {
  if (from > to) return [];
  const out: string[] = [];
  for (let cur = from; cur <= to; cur = addDays(cur, 1)) out.push(cur);
  return out;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86400000);
}

export interface CalendarCell {
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
}

/**
 * 月视图网格：整周对齐（周一为始），固定 6 行 42 格，
 * 前后补上相邻月份的日期，避免月份切换时网格高度跳动。
 */
export function monthGrid(month: string): CalendarCell[] {
  const first = startOfMonth(month);
  const gridStart = startOfWeek(first);
  const now = today();
  const [y, m] = month.split("-").map(Number);
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    const dt = toUtc(date);
    const wd = dt.getUTCDay();
    return {
      date,
      day: dt.getUTCDate(),
      inMonth: dt.getUTCFullYear() === y && dt.getUTCMonth() + 1 === m,
      isToday: date === now,
      isWeekend: wd === 0 || wd === 6,
    };
  });
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${y}年${m}月`;
}

/** '2026-05-12' → '5月12日 周二' */
export function humanDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${y}年${m}月${d}日 ${WEEKDAY_SHORT[weekOffset(date)]}`;
}

export function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}月${d}日`;
}

/** 趋势图横轴标签：按天显示 M/D，按周显示 M/D，按月显示 Y年M月 */
export function bucketLabel(bucket: string, bucketType: "day" | "week" | "month"): string {
  const [y, m, d] = bucket.split("-").map(Number);
  if (bucketType === "month") return `${y}/${m}`;
  return `${m}/${d}`;
}

export type RangePreset = "month" | "year" | "custom";

/** 预设时段 → 具体区间。year 用自然年，month 用自然月。 */
export function presetRange(preset: Exclude<RangePreset, "custom">, anchor = today()): { from: string; to: string } {
  if (preset === "year") {
    const [y] = anchor.split("-").map(Number);
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
}

export interface ContributionWeek {
  /** 该周第一天（周一） */
  start: string;
  /** 7 天，可能含区间外的日期（会被渲染为空白格） */
  days: { date: string; inRange: boolean }[];
}

/**
 * GitHub 风格贡献图：从区间起点所在周的周一开始，到终点所在周的周日结束，
 * 按列（周）返回。只生成区间内的真实数据，界外的格子标记 inRange=false 用于占位。
 */
export function contributionWeeks(from: string, to: string): ContributionWeek[] {
  const weeks: ContributionWeek[] = [];
  const lastWeekStart = startOfWeek(to);
  let cursor = startOfWeek(from);
  // 上限保护：避免异常区间生成巨量节点
  for (let i = 0; cursor <= lastWeekStart && i < 200; i += 1) {
    const days = Array.from({ length: 7 }, (_, offset) => {
      const date = addDays(cursor, offset);
      return { date, inRange: date >= from && date <= to };
    });
    weeks.push({ start: cursor, days });
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

/** 取最近 n 周的区间（默认 53 周 ≈ 一年） */
export function lastWeeksRange(weeks = 53, anchor = today()): { from: string; to: string } {
  const to = addDays(startOfWeek(anchor), 6);
  const from = addDays(to, -(weeks * 7 - 1));
  return { from, to };
}

/**
 * 贡献图用的区间：向外扩到完整周（周一起、周日止）。
 * 这样区间两端都不会出现"半个空列"，网格宽度只由周数决定。
 */
export function contributionRange(from: string, to: string): { from: string; to: string } {
  return { from: startOfWeek(from), to: addDays(startOfWeek(to), 6) };
}

/** 自然年区间：1 月 1 日 ~ 12 月 31 日 */
export function yearRange(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/**
 * 每个月的第一周在周列表中的下标与标签，用于给热力图顶端画月份。
 *
 * 标签用「1月」这种短格式，而不是「1月13日」：后者约 45px 宽，在 15.8px 的列距下
 * 必须空出 3 列才不重叠，很容易叠字（实测开头几个月的标签糊成一团）。
 *
 * minGap 是"与上一个标签至少相隔几列"。按列数判断是因为列宽随设备变化：
 * 移动端只有 12px，同样宽度需要更多列才放得下。
 */
export function monthMarkers(weeks: ContributionWeek[], minGap = 4): { index: number; label: string }[] {
  const out: { index: number; label: string }[] = [];
  let lastMonth = "";
  let lastIndex = -Infinity;
  weeks.forEach((week, index) => {
    const month = week.days[0]!.date.slice(0, 7);
    if (month === lastMonth) return;
    lastMonth = month;
    if (index - lastIndex < minGap) return; // 太近就不标，避免叠字
    lastIndex = index;
    // 该周第一天可能还在上个月（补位），用周内第一个属于本月的那天来取月份
    const firstOfMonth = week.days.find((day) => day.date.slice(0, 7) === month);
    const date = firstOfMonth?.date ?? week.days[0]!.date;
    out.push({ index, label: `${Number.parseInt(date.slice(5, 7), 10)}月` });
  });
  return out;
}
