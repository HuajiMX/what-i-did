import { test } from "node:test";
import assert from "node:assert/strict";
import { dayPanelTags } from "../src/lib/dayPanel.ts";

interface Tag {
  id: number;
  name: string;
  sort_order: number;
}

const TAGS: Tag[] = [
  { id: 1, name: "编程", sort_order: 1 },
  { id: 2, name: "运动", sort_order: 2 },
  { id: 3, name: "学习", sort_order: 3 },
  { id: 4, name: "阅读", sort_order: 4 },
];

const counts = (pairs: Array<[number, number]>) => new Map<number, number>(pairs);
const ids = (list: Array<{ tag: Tag }>) => list.map((entry) => entry.tag.id);

test("访客只看到当天有记录的 Tag", () => {
  const listed = dayPanelTags(TAGS, counts([[1, 1], [3, 2]]), false);
  assert.deepEqual(ids(listed), [3, 1], "有记录的按次数降序，没记录的不出现");
  assert.ok(listed.every((entry) => entry.count > 0));
});

test("访客在这一天没有任何记录时返回空列表", () => {
  assert.deepEqual(dayPanelTags(TAGS, counts([]), false), []);
});

test("访客的列表不受 Tag 排序影响，只由当天次数决定", () => {
  // 阅读（sort 4）记了 3 次，应排在编程（sort 1，1 次）前面
  const listed = dayPanelTags(TAGS, counts([[1, 1], [4, 3]]), false);
  assert.deepEqual(ids(listed), [4, 1]);
});

test("管理员看到全部 Tag，有记录的优先且按次数降序", () => {
  const listed = dayPanelTags(TAGS, counts([[1, 1], [3, 2]]), true);
  assert.equal(listed.length, TAGS.length, "管理员必须能看到所有 Tag，否则无法记录新的");
  assert.deepEqual(ids(listed), [3, 1, 2, 4]);
  assert.deepEqual(
    listed.filter((entry) => entry.count === 0).map((entry) => entry.tag.id),
    [2, 4],
    "无记录的按原顺序跟在后面",
  );
});

test("管理员这一天没有记录时按原顺序列出全部 Tag", () => {
  const listed = dayPanelTags(TAGS, counts([]), true);
  assert.deepEqual(ids(listed), [1, 2, 3, 4]);
});

test("计数字段与传入的一致，撤销按钮才能正确禁用", () => {
  const listed = dayPanelTags(TAGS, counts([[2, 5]]), true);
  assert.equal(listed[0]?.tag.id, 2);
  assert.equal(listed[0]?.count, 5);
  assert.ok(listed.slice(1).every((entry) => entry.count === 0));
});
