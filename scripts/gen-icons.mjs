/**
 * 生成 web/src/icons/generated/all-icons.ts。
 *
 * 生成 6238 行显式 import 的原因：`@tabler/icons-react` 没有提供
 * "一次动态 import 整个目录"的官方入口，而 `import.meta.glob` 需要静态可分析的路径模式。
 * 由脚本生成而不是手写，保证与安装的图标库版本严格一致。
 *
 * 触发：npm run icons（已挂在 postinstall 上）
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const namesFile = path.join(root, "server", "src", "icon-names.json");
const target = path.join(root, "web", "src", "icons", "generated", "all-icons.ts");

const { names, count } = JSON.parse(readFileSync(namesFile, "utf8"));

const pascal = (name) => `Icon${name.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join("")}`;

const lines = names.map((name) => `export { ${pascal(name)} } from "@tabler/icons-react";`);

const content = `/**
 * 自动生成，请勿手工编辑。由 scripts/gen-icons.mjs 生成。
 * 来源：@tabler/icons-react，共 ${count} 个图标。
 *
 * 这个文件只被 web/src/icons/lazy.ts 通过动态 import 引用，
 * 因此会被 Rollup 打成独立 chunk，不会进入公开页面的主包。
 */

${lines.join("\n")}
`;

mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(target, content);
console.log(`已写入 ${path.relative(root, target)}：${names.length} 个图标`);
