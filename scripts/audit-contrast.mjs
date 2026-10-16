/**
 * 可访问性审计：检查设计令牌里各"文字/背景"组合的对比度是否达到 WCAG AA。
 *
 * 为什么值得自动化：颜色是全站共享的令牌，改一处会影响所有页面；
 * 而"浅灰小字看不清""主色按钮上的白字发虚"这类问题靠肉眼看图很容易漏。
 * 这里直接算 WCAG 相对亮度与对比度，阈值按 AA：正文 4.5:1，大字/非文本 3:1。
 *
 * 用法：node scripts/audit-contrast.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tokens = readFileSync(path.join(root, "web", "src", "styles", "tokens.css"), "utf8");

/** 从 tokens.css 的 :root 与深色分支里取变量 */
function readTokens(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start === -1) return {};
  const end = endMarker ? source.indexOf(endMarker, start) : source.length;
  const block = source.slice(start, end === -1 ? source.length : end);
  const out = {};
  for (const match of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    out[match[1]] = match[2];
  }
  return out;
}

function toRgb(hex) {
  let value = hex.replace("#", "");
  if (value.length === 3) value = [...value].map((c) => c + c).join("");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

/** WCAG 相对亮度 */
function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** 需要检查的组合：[前景, 背景, 说明, 最低要求] */
const PAIRS = [
  ["text", "bg", "正文 / 页面底色", 4.5],
  ["text", "surface", "正文 / 卡片", 4.5],
  ["text", "surface-2", "正文 / 次级块", 4.5],
  ["text-dim", "surface", "次要文字 / 卡片", 4.5],
  ["text-dim", "bg", "次要文字 / 页面底色", 4.5],
  ["text-faint", "surface", "弱化文字 / 卡片", 4.5],
  ["text-faint", "bg", "弱化文字 / 页面底色", 4.5],
  ["accent", "surface", "主色文字 / 卡片", 4.5],
  ["accent", "accent-soft", "主色文字 / 主色浅底", 4.5],
  ["danger", "surface", "危险文字 / 卡片", 4.5],
  ["danger", "danger-soft", "危险文字 / 危险浅底", 4.5],
  ["text", "surface-3", "正文 / 三级块", 4.5],
];

/** 白字放在主色/危险色实心按钮上：只需要 3:1（大字或 UI 元素） */
const ON_SOLID = [
  ["#ffffff", "accent", "按钮白字 / 主色底", 3],
  ["#ffffff", "accent-hover", "按钮白字 / 主色悬停底", 3],
  ["#ffffff", "danger", "按钮白字 / 危险色底", 3],
];

const light = readTokens(tokens, ":root {", "@media (prefers-color-scheme: dark)");
const dark = readTokens(tokens, "@media (prefers-color-scheme: dark) {", null);

let failures = 0;

function run(label, palette, pairs) {
  console.log(`\n── ${label} ──`);
  for (const [fg, bg, note, min] of pairs) {
    const fgHex = fg.startsWith("#") ? fg : palette[fg];
    const bgHex = bg.startsWith("#") ? bg : palette[bg];
    if (!fgHex || !bgHex) {
      console.log(`  ? 跳过（缺变量）：${note} (${fg} / ${bg})`);
      continue;
    }
    const ratio = contrast(fgHex, bgHex);
    const ok = ratio >= min;
    if (!ok) failures += 1;
    console.log(
      `  ${ok ? "✓" : "✗"} ${note.padEnd(22)} ${ratio.toFixed(2)}:1  (要求 ${min}:1)  ${fgHex} / ${bgHex}`,
    );
  }
}

run("浅色主题", light, PAIRS);
run("深色主题", dark, PAIRS);
run("实心按钮上的文字", { ...light, ...dark }, ON_SOLID);

console.log(
  failures === 0
    ? "\n✓ 对比度全部达标"
    : `\n✗ 有 ${failures} 项未达到 WCAG AA，请调整 tokens.css 里对应的颜色`,
);
process.exit(failures === 0 ? 0 : 1);
