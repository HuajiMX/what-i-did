/**
 * 生成 web/public/favicon.ico。
 *
 * 为什么需要它：SVG favicon 在老浏览器（以及部分抓取/收藏场景）里不被支持，
 * 浏览器会退回到站点根目录的 /favicon.ico。只声明 SVG 时，这些环境会显示默认图标。
 *
 * 图形与 web/public/favicon.svg / components/BrandMark.tsx 保持一致：
 * 圆角方块 + 3×3 格点，其中对角线三个格子被点亮。三处坐标必须一起改。
 *
 * 实现只用 Node 内置模块，不引图像库：
 *  - 以 8×8 超采样在 32×32 的逻辑坐标系里绘制，再按 16/32/48 输出；
 *  - ICO 内层用 32 位 BGRA DIB（而不是 PNG 内嵌），兼容性最好；
 *  - 同时写 AND mask，老环境即使忽略 alpha 通道也能正确透明。
 *
 * 触发：npm run favicon。产物已提交，正常构建不需要重新生成。
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outFile = path.join(root, "web", "public", "favicon.ico");

const VIEW = 32;
const SIZES = [16, 32, 48];
const SUPERSAMPLE = 8;

const BG = [0x4f, 0x46, 0xe5];
const WHITE = [255, 255, 255];
const MUTED_ALPHA = 0.26;

const OUTER = { x: 0, y: 0, w: 32, h: 32, r: 7 };
const CELLS = [];
for (const y of [8, 14, 20]) {
  for (const x of [8, 14, 20]) CELLS.push({ x, y, w: 4, h: 4, r: 1, lit: x === y });
}

/** 点是否落在圆角矩形内（按 SVG 的 rx 语义：四角是半径为 r 的 1/4 圆） */
function inRoundedRect(px, py, { x, y, w, h, r }) {
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r + 1e-9;
}

/** 一个子采样点的颜色（直通道 + alpha）。图层顺序与 SVG 一致：底色 → 半透明格点 → 点亮格点。 */
function sampleColor(px, py) {
  if (!inRoundedRect(px, py, OUTER)) return { r: 0, g: 0, b: 0, a: 0 };

  let r = BG[0];
  let g = BG[1];
  let b = BG[2];
  let muted = false;
  let lit = false;

  for (const cell of CELLS) {
    if (!inRoundedRect(px, py, cell)) continue;
    if (cell.lit) lit = true;
    else muted = true;
  }

  if (muted) {
    r = r * (1 - MUTED_ALPHA) + WHITE[0] * MUTED_ALPHA;
    g = g * (1 - MUTED_ALPHA) + WHITE[1] * MUTED_ALPHA;
    b = b * (1 - MUTED_ALPHA) + WHITE[2] * MUTED_ALPHA;
  }
  if (lit) {
    r = WHITE[0];
    g = WHITE[1];
    b = WHITE[2];
  }

  return { r, g, b, a: 1 };
}

/** 返回自上而下的 RGBA 像素。边缘用超采样得到抗锯齿后的 alpha。 */
function render(size) {
  const pixels = new Uint8Array(size * size * 4);
  const step = VIEW / size;
  const samples = SUPERSAMPLE * SUPERSAMPLE;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const color = sampleColor(
            (x + (sx + 0.5) / SUPERSAMPLE) * step,
            (y + (sy + 0.5) / SUPERSAMPLE) * step,
          );
          rSum += color.r * color.a;
          gSum += color.g * color.a;
          bSum += color.b * color.a;
          aSum += color.a;
        }
      }

      const offset = (y * size + x) * 4;
      if (aSum > 0) {
        // 反预乘：透明边缘保留底色/白色，而不是被透明黑拉暗
        pixels[offset] = Math.round(rSum / aSum);
        pixels[offset + 1] = Math.round(gSum / aSum);
        pixels[offset + 2] = Math.round(bSum / aSum);
      }
      pixels[offset + 3] = Math.round((aSum / samples) * 255);
    }
  }

  return pixels;
}

/** 编码为 ICO 内层使用的 32 位 BMP（BITMAPINFOHEADER + 自下而上的 BGRA + AND mask）。 */
function encodeBmp(size, rgba) {
  const xorRow = size * 4;
  const andRow = Math.ceil(size / 32) * 4;
  const header = Buffer.alloc(40);

  header.writeUInt32LE(40, 0); // biSize
  header.writeInt32LE(size, 4); // biWidth
  header.writeInt32LE(size * 2, 8); // biHeight：XOR 图 + AND 掩码
  header.writeUInt16LE(1, 12); // biPlanes
  header.writeUInt16LE(32, 14); // biBitCount
  header.writeUInt32LE(0, 16); // biCompression = BI_RGB
  header.writeUInt32LE(xorRow * size + andRow * size, 20); // biSizeImage
  header.writeInt32LE(0, 24);
  header.writeInt32LE(0, 28);
  header.writeUInt32LE(0, 32);
  header.writeUInt32LE(0, 36);

  const body = Buffer.alloc(xorRow * size + andRow * size);
  const maskOffset = xorRow * size;

  for (let y = 0; y < size; y += 1) {
    const srcY = size - 1 - y;
    for (let x = 0; x < size; x += 1) {
      const src = (srcY * size + x) * 4;
      const dst = y * xorRow + x * 4;
      body[dst] = rgba[src + 2]; // B
      body[dst + 1] = rgba[src + 1]; // G
      body[dst + 2] = rgba[src]; // R
      body[dst + 3] = rgba[src + 3]; // A

      // AND mask 的 1 表示透明，只在完全透明/接近透明的像素上置位。
      // 32 位图标通常忽略它，但老环境可能只认 mask。
      if (rgba[src + 3] < 128) {
        const maskByte = maskOffset + y * andRow + (x >> 3);
        body[maskByte] |= 0x80 >> (x & 7);
      }
    }
  }

  return Buffer.concat([header, body]);
}

const images = SIZES.map((size) => ({ size, data: encodeBmp(size, render(size)) }));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type = icon
header.writeUInt16LE(images.length, 4);

const directory = Buffer.alloc(images.length * 16);
let offset = header.length + directory.length;
for (const [index, image] of images.entries()) {
  const base = index * 16;
  directory.writeUInt8(image.size >= 256 ? 0 : image.size, base);
  directory.writeUInt8(image.size >= 256 ? 0 : image.size, base + 1);
  directory.writeUInt8(0, base + 2); // 调色板颜色数
  directory.writeUInt8(0, base + 3); // reserved
  directory.writeUInt16LE(1, base + 4); // color planes
  directory.writeUInt16LE(32, base + 6); // bits per pixel
  directory.writeUInt32LE(image.data.length, base + 8);
  directory.writeUInt32LE(offset, base + 12);
  offset += image.data.length;
}

writeFileSync(outFile, Buffer.concat([header, directory, ...images.map((image) => image.data)]));

console.log(
  `已写入 ${path.relative(root, outFile)}：${SIZES.join("/")} px，` +
    `${images.reduce((sum, image) => sum + image.data.length, 0)} 字节图像数据`,
);
