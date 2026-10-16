/**
 * 构建期生成图标名白名单。
 *
 * 为什么要生成而不是手写：图标全集有 6000+ 个名字，手写必然写错（实测凭印象列的 270 个里错了 16 个），
 * 而服务端需要一个可信白名单来拒绝乱传的 icon 值。让包自己当唯一真源。
 *
 * 产物：server/src/icon-names.json（提交进版本库，运行期不依赖 node_modules）
 * 触发：npm install 的 postinstall，以及 npm run icons
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "node_modules", "@tabler", "icons-react", "dist", "esm", "icons-list.mjs");
const target = path.join(root, "server", "src", "icon-names.json");

let names;
try {
  const mod = await import(`file://${source.replace(/\\/g, "/")}`);
  names = mod.default;
} catch (err) {
  console.error(`无法读取图标清单：${source}`);
  console.error("请先安装依赖：npm install --ignore-scripts && npm run icons");
  console.error(String(err));
  process.exit(1);
}

if (!Array.isArray(names) || names.length < 100) {
  console.error(`图标清单异常（期望数组且数量可观，实际 ${Array.isArray(names) ? names.length : typeof names}）`);
  process.exit(1);
}

mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(
  target,
  `${JSON.stringify(
    {
      _comment: "由 scripts/gen-icon-catalog.mjs 生成，请勿手工编辑。来源：@tabler/icons-react",
      count: names.length,
      names,
    },
    null,
    0,
  )}\n`,
);
console.log(`已写入 ${path.relative(root, target)}：${names.length} 个图标名`);
