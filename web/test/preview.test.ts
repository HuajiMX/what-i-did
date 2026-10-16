import { test } from "node:test";
import assert from "node:assert/strict";
import { pickPreviewSlots } from "../src/lib/preview.ts";

/** 造 n 个占位条目，便于断言"显示了几个、还剩几个没显示" */
const items = (n: number) => Array.from({ length: n }, (_, i) => `tag${i}`);

/** 移动端格子里最多放 4 个（两列 × 两行） */
const MAX = 4;

/** 组件里的渲染条件：只有超过 1 个未显示时才画「+n」 */
const showsMoreBadge = (hidden: number) => hidden > 1;

test("不超出上限时全部显示", () => {
  for (const n of [0, 1, 2, 3, 4]) {
    const result = pickPreviewSlots(items(n), MAX);
    assert.equal(result.visible.length, n, `${n} 个应全部显示`);
    assert.equal(result.hidden, 0, `${n} 个不应有未显示项`);
    assert.equal(showsMoreBadge(result.hidden), false);
  }
});

test("正好多 1 个时直接显示它，不出现「+1」", () => {
  const result = pickPreviewSlots(items(5), MAX);
  assert.equal(result.visible.length, 4, "5 个时应显示 4 个（把多出的那个也显示出来）");
  assert.equal(result.hidden, 1, "确实还剩 1 个没显示");
  assert.equal(showsMoreBadge(result.hidden), false, "但不应渲染「+1」");
  assert.deepEqual(result.visible, ["tag0", "tag1", "tag2", "tag3"]);
});

test("多 2 个以上时省略，并给「+n」留出一格", () => {
  const six = pickPreviewSlots(items(6), MAX);
  assert.equal(six.visible.length, 3, "6 个时应显示 3 个，第 4 格留给省略标记");
  assert.equal(six.hidden, 3);
  assert.equal(showsMoreBadge(six.hidden), true, "应渲染「+3」");

  const ten = pickPreviewSlots(items(10), MAX);
  assert.equal(ten.visible.length, 3);
  assert.equal(ten.hidden, 7, "应渲染「+7」");
});

test("hidden 恒等于 总数 − 显示数（任何数量都不丢条目）", () => {
  for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 9, 12]) {
    const result = pickPreviewSlots(items(n), MAX);
    assert.equal(result.visible.length + result.hidden, n, `${n} 个条目总数应守恒`);
    assert.ok(result.visible.length <= MAX, `${n} 个时显示数不应超过上限`);
    assert.ok(result.visible.length >= 1 || n === 0, `${n} 个时不应一个都不显示`);
    // 关键规则：省略标记只会覆盖 2 个以上
    if (showsMoreBadge(result.hidden)) {
      assert.ok(result.hidden >= 2);
      // 有省略标记时，显示数 + 标记覆盖数 必须等于总数
      assert.equal(result.visible.length + result.hidden, n);
    }
  }
});

test("顺序保持不变（调用方按次数降序传入）", () => {
  const result = pickPreviewSlots(["a", "b", "c", "d", "e", "f"], MAX);
  assert.deepEqual(result.visible, ["a", "b", "c"]);
});

test("格子只能放 1 个时不会显示成 0 个", () => {
  // maxSlots 为 1 时"只省 1 个"的例外无法成立（显示 2 个放不下），
  // 必须退化成"显示 1 个 + 省略 2 个"，不能把显示数算成 0
  const result = pickPreviewSlots(items(3), 1);
  assert.equal(result.visible.length, 1, "至少要显示 1 个");
  assert.equal(result.hidden, 2);
  assert.equal(result.visible.length + result.hidden, 3);
});

test("放 2 个的边界：多 1 个时显示 2 个", () => {
  const result = pickPreviewSlots(items(3), 2);
  assert.equal(result.visible.length, 2);
  assert.equal(result.hidden, 1);
  assert.equal(showsMoreBadge(result.hidden), false);
});
