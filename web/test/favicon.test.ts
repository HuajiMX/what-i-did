import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ico = readFileSync(new URL("../public/favicon.ico", import.meta.url));

test("favicon.ico 是包含 16/32/48 三种尺寸的合法 ICO", () => {
  assert.equal(ico.readUInt16LE(0), 0, "ICONDIR.reserved 必须为 0");
  assert.equal(ico.readUInt16LE(2), 1, "ICONDIR.type 必须为 1（icon）");

  const count = ico.readUInt16LE(4);
  assert.equal(count, 3, "应包含 3 个尺寸");

  const sizes: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const base = 6 + index * 16;
    const width = ico.readUInt8(base) || 256;
    const height = ico.readUInt8(base + 1) || 256;
    const bytes = ico.readUInt32LE(base + 8);
    const offset = ico.readUInt32LE(base + 12);

    assert.equal(width, height, "favicon 必须是正方形");
    assert.equal(ico.readUInt16LE(base + 4), 1, "必须是 1 个 color plane");
    assert.equal(ico.readUInt16LE(base + 6), 32, "必须是 32 位图像");
    assert.ok(offset + bytes <= ico.length, "图像数据不能越界");
    assert.deepEqual([...ico.subarray(offset, offset + 4)], [0x28, 0, 0, 0], "内层应是 40 字节的 BITMAPINFOHEADER");

    sizes.push(width);
  }

  assert.deepEqual(sizes, [16, 32, 48], "尺寸顺序应与生成脚本一致");
});

test("index.html 同时声明 ICO 与 SVG favicon", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const icoIndex = html.indexOf('href="/favicon.ico"');
  const svgIndex = html.indexOf('href="/favicon.svg"');

  assert.ok(icoIndex !== -1, "应声明 /favicon.ico 作为不支持 SVG 的浏览器的回退");
  assert.ok(svgIndex !== -1, "应保留 /favicon.svg");
  assert.ok(icoIndex < svgIndex, "ICO 应排在 SVG 之前，便于旧浏览器优先命中回退方案");
});
