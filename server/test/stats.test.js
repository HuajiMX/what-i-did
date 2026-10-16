import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTrend,
  computeStreaks,
  countByDate,
  groupByDateTag,
  intensityLevels,
  summarizeByTag,
  summarizeOverall,
} from "../src/stats.js";

const rows = [
  { date: "2026-05-11", tag_id: 1 },
  { date: "2026-05-11", tag_id: 1 },
  { date: "2026-05-11", tag_id: 2 },
  { date: "2026-05-12", tag_id: 1 },
  { date: "2026-05-14", tag_id: 2 },
];

const tags = [
  { id: 1, name: "编程" },
  { id: 2, name: "运动" },
  { id: 3, name: "学习" },
];

test("groupByDateTag 按日聚合次数", () => {
  const grouped = groupByDateTag(rows);
  assert.equal(grouped.get("2026-05-11").get(1), 2);
  assert.equal(grouped.get("2026-05-11").get(2), 1);
  assert.equal(grouped.get("2026-05-12").get(1), 1);
  assert.equal(grouped.has("2026-05-13"), false);
});

test("countByDate 统计每日总量", () => {
  const counts = countByDate(rows);
  assert.equal(counts.get("2026-05-11"), 3);
  assert.equal(counts.get("2026-05-14"), 1);
  assert.equal(counts.get("2026-05-13"), undefined);
});

test("summarizeByTag 给出次数/天数/占比，并按次数降序", () => {
  const summary = summarizeByTag(rows, tags);
  assert.equal(summary.length, 3);
  const [first, second, third] = summary;
  assert.equal(first.tag_id, 1);
  assert.equal(first.count, 3);
  assert.equal(first.days, 2); // 5-11 和 5-12
  assert.equal(second.tag_id, 2);
  assert.equal(second.count, 2);
  assert.equal(second.days, 2);
  // 0 次的 tag 也要出现在结果里（筛选器需要显示完整列表）
  assert.equal(third.tag_id, 3);
  assert.equal(third.count, 0);
  assert.equal(third.share, 0);
  // 占比之和为 1
  const sum = summary.reduce((acc, t) => acc + t.share, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `占比之和应为 1，实际 ${sum}`);
});

test("summarizeByTag 空数据不产生 NaN", () => {
  const summary = summarizeByTag([], tags);
  assert.equal(summary.length, 3);
  for (const t of summary) {
    assert.equal(t.count, 0);
    assert.equal(t.days, 0);
    assert.equal(t.share, 0);
  }
});

test("computeStreaks：连续两天 + 中断", () => {
  // 5-11、5-12 连上，5-14 断开
  const streak = computeStreaks(rows, "2026-05-14");
  assert.equal(streak.longest, 2);
  assert.equal(streak.current, 1); // 今天(5-14)有记录，往前 5-13 没有 → 1
  assert.equal(streak.lastActive, "2026-05-14");
});

test("computeStreaks：今天还没记录时从昨天起算，不显示为 0", () => {
  const streak = computeStreaks(rows, "2026-05-13");
  assert.equal(streak.current, 2, "5-13 无记录，应回退到 5-12 起算连续 2 天");
  assert.equal(streak.longest, 2);
});

test("computeStreaks：今天和昨天都没有记录时为 0", () => {
  const streak = computeStreaks(rows, "2026-05-20");
  assert.equal(streak.current, 0);
  assert.equal(streak.longest, 2);
});

test("computeStreaks 跨月跨年连续", () => {
  const crossYear = [
    { date: "2026-12-30", tag_id: 1 },
    { date: "2026-12-31", tag_id: 1 },
    { date: "2027-01-01", tag_id: 1 },
    { date: "2027-01-02", tag_id: 1 },
  ];
  const streak = computeStreaks(crossYear, "2027-01-02");
  assert.equal(streak.current, 4);
  assert.equal(streak.longest, 4);
});

test("computeStreaks 空数据", () => {
  assert.deepEqual(computeStreaks([], "2026-05-12"), { current: 0, longest: 0, lastActive: null });
});

test("buildTrend 按天分桶并补零", () => {
  const points = buildTrend(rows, "2026-05-11", "2026-05-14", "day");
  assert.deepEqual(points, [
    { bucket: "2026-05-11", count: 3 },
    { bucket: "2026-05-12", count: 1 },
    { bucket: "2026-05-13", count: 0 }, // 空桶必须补 0，否则折线图会误导
    { bucket: "2026-05-14", count: 1 },
  ]);
});

test("buildTrend 按周与按月分桶", () => {
  const weekly = buildTrend(rows, "2026-05-11", "2026-05-14", "week");
  assert.deepEqual(weekly, [{ bucket: "2026-05-11", count: 5 }]);
  const monthly = buildTrend(rows, "2026-05-11", "2026-05-14", "month");
  assert.deepEqual(monthly, [{ bucket: "2026-05-01", count: 5 }]);
});

test("buildTrend 跨周时每个桶独立", () => {
  const data = [
    { date: "2026-05-17", tag_id: 1 }, // 周日
    { date: "2026-05-18", tag_id: 1 }, // 下周一
  ];
  const weekly = buildTrend(data, "2026-05-17", "2026-05-18", "week");
  assert.deepEqual(weekly, [
    { bucket: "2026-05-11", count: 1 },
    { bucket: "2026-05-18", count: 1 },
  ]);
});

test("summarizeOverall 统计总量、活跃天数与活跃率", () => {
  const overall = summarizeOverall(rows, "2026-05-11", "2026-05-14");
  assert.equal(overall.total, 5);
  assert.equal(overall.activeDays, 3);
  assert.equal(overall.rangeDays, 4);
  assert.ok(Math.abs(overall.activeRate - 0.75) < 1e-9);
});

test("intensityLevels 把计数分成 4 档", () => {
  const { levelOf, max } = intensityLevels([0, 1, 5, 10]);
  assert.equal(max, 10);
  assert.equal(levelOf(0), 0);
  assert.equal(levelOf(1), 1);
  assert.equal(levelOf(4), 2);
  assert.equal(levelOf(10), 3);
  // 全零不产生除零
  const zero = intensityLevels([0, 0]);
  assert.equal(zero.max, 0);
  assert.equal(zero.levelOf(0), 0);
});
