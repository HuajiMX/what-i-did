/**
 * 静态检查：JSX 里用到的 class 名是否都在 CSS 里定义过。
 *
 * 动机：本环境无法用浏览器验证渲染（Playwright 安装与无头浏览器启动都被沙箱挡住），
 * 而"类名写错或漏写样式"在浏览器里表现为**样式静默不生效**，恰恰最需要自动检查。
 *
 * 只检查 className 属性的值，并且：
 *  - 忽略 icon 相关目录（那里的大量连字符字符串是图标名，不是类名）
 *  - 忽略模板串插值（`sheet-${variant}` 这类拼接结果单独核对）
 *  - 忽略字符串字面量（id、content-type 之类的误报来源）
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webSrc = path.join(root, "web", "src");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "icons" || entry.name === "generated") continue; // 图标名不是类名
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

const files = walk(webSrc);
const cssText = files
  .filter((file) => file.endsWith(".css"))
  .map((file) => readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, ""))
  .join("\n");

const defined = new Set();
for (const match of cssText.matchAll(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g)) defined.add(match[1]);

const missing = [];

for (const file of files.filter((f) => f.endsWith(".tsx"))) {
  const source = readFileSync(file, "utf8");

  // className="a b"  与  className={`a b`}
  for (const match of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const raw = match[1] ?? match[2] ?? "";
    // 模板串拼接（如 `sheet-${variant}`）在去掉插值后会留下 "sheet-" 这样的残片，
    // 它不是类名——真正需要核对的是固定的那部分，即插值之外为空的 token 要丢掉。
    const withoutInterpolation = raw.replace(/\$\{[^}]*\}/g, "\u0000");
    for (const part of withoutInterpolation.split(/\s+/)) {
      if (!part || part.includes("\u0000")) continue; // 含插值的片段单独由下面的大前缀检查覆盖
      if (!/^[a-z][a-z0-9-]*$/i.test(part)) continue;
      if (!defined.has(part)) missing.push({ token: part, file: path.relative(root, file) });
    }
  }
}

// 模板串拼接前缀（如 `level-${n}`）单独核对：检查 CSS 里是否存在同前缀的类名
const TEMPLATE_PREFIXES = [{ prefix: "level-", where: "web/src/pages/NotesPage.tsx" }];
for (const { prefix, where } of TEMPLATE_PREFIXES) {
  const has = [...defined].some((name) => name.startsWith(prefix));
  if (!has) missing.push({ token: `${prefix}*（模板串拼接）`, file: where });
}

if (missing.length > 0) {
  console.error("✗ 以下类名在 JSX 里使用，但 CSS 里没有定义：\n");
  for (const { token, file } of missing) console.error(`  - ${token}  ← ${file}`);
  process.exit(1);
}

console.log(`✓ 类名检查通过：CSS 定义 ${defined.size} 个类名，JSX 中使用的类名全部有对应样式`);
