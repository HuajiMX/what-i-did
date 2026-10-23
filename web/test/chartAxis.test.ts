import { test } from "node:test";
import assert from "node:assert/strict";
import { niceChartAxis } from "../src/lib/chartAxis.ts";

test("max=3 时纵轴是 0/1/2/3，标签 2 不再落在 1.5 的位置", () => {
  const axis = niceChartAxis(3);
  assert.equal(axis.step, 1);
  assert.equal(axis.max, 3);
  assert.deepEqual(axis.values, [0, 1, 2, 3]);
});

test("刻度等距、从 0 开始、包含纵轴顶端且不为小数", () => {
  for (const dataMax of [1, 2, 3, 4, 5, 6, 7, 10, 13, 99, 100, 1234]) {
    const axis = niceChartAxis(dataMax);
    assert.ok(axis.max >= dataMax, `${dataMax} 的纵轴顶端不能小于数据最大值`);
    assert.equal(axis.values[0], 0);
    assert.equal(axis.values[axis.values.length - 1], axis.max);
    assert.ok(axis.values.length <= 7, `${dataMax} 的刻度太多：${axis.values.length}`);
    assert.ok(axis.values.every(Number.isInteger), `${dataMax} 出现了小数刻度：${axis.values.join(",")}`);

    for (let index = 1; index < axis.values.length; index += 1) {
      assert.equal(
        axis.values[index]! - axis.values[index - 1]!,
        axis.step,
        `${dataMax} 的刻度不是等距的：${axis.values.join(",")}`,
      );
    }
  }
});

test("0 按 1 处理，避免除以 0", () => {
  const axis = niceChartAxis(0);
  assert.equal(axis.max, 1);
  assert.deepEqual(axis.values, [0, 1]);
});
