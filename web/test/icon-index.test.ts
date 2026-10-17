import { test } from "node:test";
import assert from "node:assert/strict";
import { findIcon, makeIconIndex, normalizeIconKey } from "../src/icons/index-build.ts";
import type { IconComponent } from "../src/icons/common.ts";

/**
 * 造一个可判等的"假图标组件"。
 * 索引只负责保存和取出组件引用，测试也就不需要真的 React 组件。
 */
function fakeIcon(label: string): IconComponent {
  const component = (() => label) as unknown as IconComponent;
  return component;
}

test("归一化键忽略大小写、连字符与数字边界写法", () => {
  assert.equal(normalizeIconKey("device-gamepad-2"), "devicegamepad2");
  assert.equal(normalizeIconKey("DeviceGamepad2"), "devicegamepad2");
  assert.equal(normalizeIconKey("a-b-2"), "ab2");
  assert.equal(normalizeIconKey("IconAB2"), "iconab2");
});

test("同一个图标用 kebab / Pascal / 全小写 三种写法都能查到", () => {
  const component = fakeIcon("gamepad");
  const index = makeIconIndex([["device-gamepad-2", component]]);

  for (const spelling of ["device-gamepad-2", "DeviceGamepad2", "devicegamepad2", "DEVICE-GAMEPAD-2"]) {
    assert.equal(findIcon(index, spelling), component, `${spelling} 应解析到同一个组件`);
  }
});

test("查不到的名字返回 null，而不是抛错或返回 undefined", () => {
  const index = makeIconIndex([["star", fakeIcon("star")]]);
  assert.equal(findIcon(index, "no-such-icon"), null);
  assert.equal(findIcon(index, ""), null);
  // 索引还没加载完（首屏、公开访客）时也不能抛
  assert.equal(findIcon(null, "star"), null);
});

test("索引只包含传入的配对，绝不凭空多出键", () => {
  // 上一版的缺陷正是"多出来的键"：它遍历 forwardRef 组件对象的属性，
  // 于是索引里出现 key=render、值是一个裸 render 函数；选择器把它当图标名
  // 塞进 setState，React 把函数当函数式更新调用 → 整棵树崩溃白屏。
  const icons = [["star", fakeIcon("star")], ["abacus", fakeIcon("abacus")]] as const;
  const index = makeIconIndex(icons);

  assert.equal(index.byKey.size, 2);
  assert.deepEqual(index.names, ["star", "abacus"]);
  for (const stray of ["render", "displayname", "$$typeof", "default"]) {
    assert.equal(index.byKey.has(stray), false, `索引里不应出现 ${stray}`);
  }
  // 里边的值必须是传进来的组件引用本身，没有被调用、也没有被替换
  assert.equal(findIcon(index, "star"), icons[0][1]);
});

test("名字列表保持官方清单顺序，且不重复", () => {
  const index = makeIconIndex([
    ["zoom", fakeIcon("zoom")],
    ["abacus", fakeIcon("abacus")],
    ["star", fakeIcon("star")],
  ]);
  assert.deepEqual(index.names, ["zoom", "abacus", "star"]);
});

test("归一化后重名的条目只保留第一个，避免选择器出现重复格子", () => {
  const first = fakeIcon("first");
  const second = fakeIcon("second");
  const index = makeIconIndex([
    ["device-gamepad-2", first],
    ["DeviceGamepad2", second],
  ]);

  assert.deepEqual(index.names, ["device-gamepad-2"]);
  assert.equal(index.byKey.size, 1);
  assert.equal(findIcon(index, "devicegamepad2"), first);
});

test("官方名都是 kebab 写法（索引不做任何名字改写）", () => {
  const index = makeIconIndex([
    ["crop-1-1", fakeIcon("crop")],
    ["a-b-2", fakeIcon("ab")],
  ]);
  for (const name of index.names) {
    assert.equal(name, name.toLowerCase(), `${name} 应是小写`);
    assert.equal(name.includes(" "), false);
  }
});
