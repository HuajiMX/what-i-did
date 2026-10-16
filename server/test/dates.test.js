import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  addMonths,
  bucketKey,
  daysBetween,
  daysInMonth,
  eachDay,
  endOfMonth,
  formatDate,
  isDateString,
  normalizeRange,
  parseDate,
  startOfMonth,
  startOfWeek,
  weekOffset,
  weekdayOf,
} from "../src/dates.js";

test("isDateString 接受合法日期", () => {
  assert.equal(isDateString("2026-05-12"), true);
  assert.equal(isDateString("2024-02-29"), true); // 闰年
  assert.equal(isDateString("2026-01-01"), true);
});

test("isDateString 拒绝非法输入（含格式合法但不存在的日期）", () => {
  for (const bad of ["2026-2-1", "2026/05/12", "20260512", "", null, undefined, 20260512, "2026-13-01", "2026-00-10", "2026-05-00", "2026-05-32"]) {
    assert.equal(isDateString(bad), false, `应拒绝：${String(bad)}`);
  }
  // 非闰年的 2 月 29 日必须被拒绝
  assert.equal(isDateString("2026-02-29"), false);
  assert.equal(isDateString("2023-02-29"), false);
});

test("daysInMonth 覆盖闰年与各月长度", () => {
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2000, 2), 29); // 能被 400 整除
  assert.equal(daysInMonth(1900, 2), 28); // 能被 100 整除但不能被 400 整除
  assert.equal(daysInMonth(2026, 4), 30);
  assert.equal(daysInMonth(2026, 12), 31);
});

test("addDays 跨月、跨年、跨闰日", () => {
  assert.equal(addDays("2026-05-31", 1), "2026-06-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addDays("2024-02-29", 1), "2024-03-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("addMonths 在月末做钳制而不是溢出", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(addMonths("2026-03-31", -1), "2026-02-28");
  assert.equal(addMonths("2026-12-15", 1), "2027-01-15");
  assert.equal(addMonths("2026-01-15", -1), "2025-12-15");
});

test("weekOffset 以周一为一周之始", () => {
  // 2026-05-11 是周一，2026-05-17 是周日
  assert.equal(weekdayOf("2026-05-11"), 1);
  assert.equal(weekOffset("2026-05-11"), 0);
  assert.equal(weekOffset("2026-05-12"), 1);
  assert.equal(weekOffset("2026-05-17"), 6);
  assert.equal(weekOffset("2026-05-18"), 0);
});

test("startOfWeek 返回所在周的周一", () => {
  assert.equal(startOfWeek("2026-05-12"), "2026-05-11");
  assert.equal(startOfWeek("2026-05-11"), "2026-05-11");
  assert.equal(startOfWeek("2026-05-17"), "2026-05-11");
  // 跨年：2027-01-01 是周五，所在周的周一是 2026-12-28
  assert.equal(startOfWeek("2027-01-01"), "2026-12-28");
});

test("startOfMonth / endOfMonth", () => {
  assert.equal(startOfMonth("2026-05-12"), "2026-05-01");
  assert.equal(endOfMonth("2026-05-12"), "2026-05-31");
  assert.equal(endOfMonth("2024-02-10"), "2024-02-29");
});

test("eachDay 生成闭区间，非法区间返回空", () => {
  assert.deepEqual(eachDay("2026-05-01", "2026-05-03"), ["2026-05-01", "2026-05-02", "2026-05-03"]);
  assert.deepEqual(eachDay("2026-05-01", "2026-05-01"), ["2026-05-01"]);
  assert.deepEqual(eachDay("2026-05-03", "2026-05-01"), []);
  assert.deepEqual(eachDay("bad", "2026-05-01"), []);
  // 区间上限保护
  assert.equal(eachDay("1900-01-01", "2100-01-01", 10).length, 11);
});

test("daysBetween 与 bucketKey", () => {
  assert.equal(daysBetween("2026-05-01", "2026-05-31"), 30);
  assert.equal(bucketKey("2026-05-12", "day"), "2026-05-12");
  assert.equal(bucketKey("2026-05-12", "week"), "2026-05-11");
  assert.equal(bucketKey("2026-05-12", "month"), "2026-05-01");
});

test("normalizeRange 校验区间", () => {
  assert.deepEqual(normalizeRange({ from: "2026-05-01", to: "2026-05-31" }), { from: "2026-05-01", to: "2026-05-31" });
  assert.throws(() => normalizeRange({ from: "2026-05-31", to: "2026-05-01" }), /起始日期不能晚于结束日期/);
  assert.throws(() => normalizeRange({ from: "bad", to: "2026-05-01" }), /YYYY-MM-DD/);
  assert.throws(() => normalizeRange({ from: "1900-01-01", to: "2100-01-01", maxDays: 400 }), /过长/);
});

test("formatDate / parseDate 往返一致", () => {
  const date = "2026-05-12";
  assert.equal(formatDate(parseDate(date)), date);
  assert.deepEqual(parseDate(date), { y: 2026, m: 5, d: 12 });
});
