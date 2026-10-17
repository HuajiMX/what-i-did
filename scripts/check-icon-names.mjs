/**
 * 静态一致性检查：
 *  1. 前端手写的常用图标名必须真实存在于图标库清单中。
 *  2. 生成物 web/src/icons/generated/all-icons.ts 里的配对表必须与清单一一对应。
 *
 * 为什么需要 1：common.ts 里的图标名是手写的，而图标名不能凭记忆写——
 * 实测凭印象列的 270 个候选里错了 16 个（见 docs/probe-node24.md）。
 * 拼错的后果不是报错，而是页面上出现一个灰色占位方块。
 *
 * 为什么需要 2：这份配对表是"图标名"的唯一来源，一旦它和官方清单脱节
 * （名字拼错、数量对不上、混进 `render` 这种非图标键），图标选择器就会出现
 * 查不到的图标、重复格子，甚至把非组件值塞进 setState 导致整页白屏。
 *
 * 同时也检查 categories.ts 里的分类引用的名字都在常用集合内，避免漏配。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogFile = JSON.parse(readFileSync(path.join(root, "server", "src", "icon-names.json"), "utf8"));
const catalog = new Set(catalogFile.names);
const commonSource = readFileSync(path.join(root, "web", "src", "icons", "common.ts"), "utf8");
const categoriesSource = readFileSync(path.join(root, "web", "src", "icons", "categories.ts"), "utf8");
const generatedSource = readFileSync(path.join(root, "web", "src", "icons", "generated", "all-icons.ts"), "utf8");

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

/** 生成物里的配对表：`["name", IconComponent],` */
const pairs = [...generatedSource.matchAll(/^\s{2}\["([^"]+)", (Icon[A-Za-z0-9]+)\],$/gm)].map((match) => ({
  name: match[1],
  component: match[2],
}));

if (pairs.length !== catalogFile.count) {
  failures.push(`all-icons.ts 的配对表有 ${pairs.length} 项，官方清单是 ${catalogFile.count} 项（请执行 npm run icons）`);
}

const generatedNames = new Set();
for (const { name } of pairs) {
  if (generatedNames.has(name)) failures.push(`all-icons.ts 里出现重复图标名：${name}`);
  generatedNames.add(name);
  if (!catalog.has(name)) failures.push(`all-icons.ts 里的图标名不存在于官方清单：${name}`);
}

for (const name of catalogFile.names) {
  if (!generatedNames.has(name)) {
    failures.push(`官方清单里的图标没有出现在 all-icons.ts：${name}`);
    break;
  }
}

if (failures.length > 0) {
  console.error("✗ 图标名一致性检查失败：\n");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log(
  `✓ 图标名一致性检查通过：常用 ${commonNames.length} 个，分类引用 ${categoryNames.size} 个，` +
    `全库配对 ${pairs.length} 个，均存在于图标库`,
);
