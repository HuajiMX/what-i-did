/**
 * 生成 web/src/icons/generated/all-icons.ts：一张「官方 kebab 名 → 图标组件」的配对表。
 *
 * 为什么配对表必须在构建期生成：
 *  - `@tabler/icons-react` 没有"一次动态 import 整个目录"的官方入口，
 *    而 `import.meta.glob` 又需要静态可分析的路径模式，所以只能手写/生成一份显式 import。
 *  - 图标名**不能**用 PascalCase 反推。官方名是 kebab（`crop-1-1`、`a-b-2`、`grid-3x3`），
 *    Pascal 名是 `IconCrop11`、`IconAB2`、`IconGrid3x3`——数字边界有歧义。
 *    实测 6238 个官方名里，用常见的正则反推有 104 个会推错（且 47 个官方名推不回来）。
 *    运行时"猜"名字既会猜错，也曾经把 `render` 这种非图标键混进索引（白屏事故）。
 *  - 唯一真源是 `server/src/icon-names.json`（由 scripts/gen-icon-catalog.mjs 从
 *    `@tabler/icons-react` 的 icons-list 生成），这里按它的顺序逐个算出 Pascal 组件名。
 *
 * 触发：npm run icons（已挂在 postinstall 上）
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const namesFile = path.join(root, "server", "src", "icon-names.json");
const target = path.join(root, "web", "src", "icons", "generated", "all-icons.ts");

const { names, count } = JSON.parse(readFileSync(namesFile, "utf8"));

/** kebab 名 → Pascal 组件名。这条正向映射与图标库自己的构建脚本一致（构建成功即验证过） */
const pascal = (name) => `Icon${name.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join("")}`;

const entries = names.map((name) => ({ name, component: pascal(name) }));

// 断言：名字唯一、映射后的组件名也唯一，否则生成的 import 里会出现重复标识符
const uniqueNames = new Set(entries.map((entry) => entry.name));
const uniqueComponents = new Set(entries.map((entry) => entry.component));
if (uniqueNames.size !== entries.length || uniqueComponents.size !== entries.length) {
  console.error(
    `图标清单异常：${entries.length} 个名字，去重后 ${uniqueNames.size} 个名字 / ${uniqueComponents.size} 个组件名。` +
      "\\n  两者必须一一对应，否则无法生成无歧义的配对表。",
  );
  process.exit(1);
}

const importLines = entries.map((entry) => `  ${entry.component},`).join("\n");
const pairLines = entries.map((entry) => `  ["${entry.name}", ${entry.component}],`).join("\n");

const content = `/**
 * 自动生成，请勿手工编辑。由 scripts/gen-icons.mjs 生成。
 * 来源：@tabler/icons-react，共 ${count} 个图标。
 *
 * 配对表的顺序与图标库官方清单一致；名字一律是官方 kebab 名。
 * 这个文件只被 web/src/icons/lazy.ts 通过动态 import 引用，
 * 因此会被 Rollup 打成独立 chunk，不会进入公开页面的主包。
 */
import {
${importLines}
} from "@tabler/icons-react";
import type { IconComponent } from "../common";

export const ALL_ICONS: ReadonlyArray<readonly [string, IconComponent]> = [
${pairLines}
];
`;

mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(target, content);
console.log(`已写入 ${path.relative(root, target)}：${entries.length} 个图标（kebab 名 + 组件配对）`);
