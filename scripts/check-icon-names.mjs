/**
 * 静态一致性检查：前端手写的常用图标名必须真实存在于图标库清单中。
 *
 * 为什么需要：common.ts 里的图标名是手写的，而图标名不能凭记忆写——
 * 实测凭印象列的 270 个候选里错了 16 个（见 docs/probe-node24.md）。
 * 拼错的后果不是报错，而是页面上出现一个灰色占位方块。
 *
 * 同时检查 categories.ts 里的分类引用的名字也在常用集合内，避免漏配。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = new Set(JSON.parse(readFileSync(path.join(root, "server", "src", "icon-names.json"), "utf8")).names);
const commonSource = readFileSync(path.join(root, "web", "src", "icons", "common.ts"), "utf8");
const categoriesSource = readFileSync(path.join(root, "web", "src", "icons", "categories.ts"), "utf8");

/** 从 COMMON_ICONS 对象字面量里取键名：形如 `"run": IconRun,` 或 `code: IconCode,` */
const commonNames = [];
for (const match of commonSource.matchAll(/^\s{2}"?([a-z0-9-]+)"?:\s*Icon[A-Za-z0-9]+,\s*$/gm)) {
  commonNames.push(match[1]);
}

const failures = [];

if (commonNames.length < 30) {
  failures.push(`只解析出 ${commonNames.length} 个常用图标名，解析规则可能失效了`);
}

for (const name of commonNames) {
  if (!catalog.has(name)) failures.push(`common.ts 里的图标名不存在于图标库：${name}`);
}

/** categories.ts 里引用的名字 */
const categoryNames = new Set();
for (const match of categoriesSource.matchAll(/"([a-z0-9-]+)"/g)) categoryNames.add(match[1]);

for (const name of categoryNames) {
  if (!catalog.has(name)) failures.push(`categories.ts 里的图标名不存在于图标库：${name}`);
  else if (!commonNames.includes(name)) failures.push(`categories.ts 引用了不在常用集合里的图标：${name}（会导致分类里少一个图标）`);
}

if (failures.length > 0) {
  console.error("✗ 图标名一致性检查失败：\n");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log(`✓ 图标名一致性检查通过：常用 ${commonNames.length} 个，分类引用 ${categoryNames.size} 个，均存在于图标库`);
