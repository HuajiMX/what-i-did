/**
 * 构建产物体积断言。
 *
 * 为什么需要它：把 `import * as Icons from "@tabler/icons-react"` 或
 * `Icons["Icon" + name]` 这类写法带进来时，6238 个图标（约 5 MB）会**静默**进入
 * 公开页面的主包——构建照样成功，只是访客要多下载几 MB。这类错误不会以报错的形式出现，
 * 所以必须用断言把它变成构建失败。
 *
 * 阈值依据（首次构建后实测，原始数据见 docs/probe-node24.md）：
 *   入口包（React 19 + react-dom + react-router + 常用图标 + 应用代码）＝ 316.8 KB / gzip 100.1 KB
 *   全库图标懒加载 chunk ＝ 2390.5 KB / gzip 454.3 KB / brotli 338.5 KB
 * 若整体引入图标库，入口包会涨到 2.7 MB 量级，因此 400 KB 上限足以把这类错误变成构建失败。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = path.join(root, "web", "dist", "assets");

const LIMITS_KB = {
  /** 公开页面首屏必须加载的入口包 */
  main: 400,
  /** 任何单个懒加载 chunk（当前最大的是全库图标 chunk，约 2.4 MB） */
  chunk: 2700,
};

let entries;
try {
  entries = readdirSync(assetsDir);
} catch {
  console.error(`找不到构建产物目录：${assetsDir}。请先执行 vite build。`);
  process.exit(1);
}

const files = entries
  .filter((name) => name.endsWith(".js"))
  .map((name) => ({ name, kb: statSync(path.join(assetsDir, name)).size / 1024 }));

// Vite 的入口 chunk 名形如 index-<hash>.js
const main = files.find((file) => file.name.startsWith("index-"));
const failures = [];

if (!main) {
  failures.push("没有找到入口 chunk（index-*.js），构建产物结构可能变了");
} else if (main.kb > LIMITS_KB.main) {
  failures.push(
    `入口包 ${main.name} 为 ${main.kb.toFixed(1)} KB，超过 ${LIMITS_KB.main} KB 上限。` +
      `\n  最可能的原因：图标库被整体引入。请检查是否出现 import * as ... from "@tabler/icons-react"` +
      `\n  或 Icons["Icon" + name] 这类动态索引写法（见 web/src/icons/common.ts 的注释）。`,
  );
}

for (const file of files) {
  if (file === main) continue;
  if (file.kb > LIMITS_KB.chunk) {
    failures.push(`chunk ${file.name} 为 ${file.kb.toFixed(1)} KB，超过 ${LIMITS_KB.chunk} KB 上限`);
  }
}

const total = files.reduce((sum, file) => sum + file.kb, 0);
const biggest = [...files].sort((a, b) => b.kb - a.kb).slice(0, 3);

if (failures.length > 0) {
  console.error("✗ 体积断言失败：\n");
  for (const message of failures) console.error(`  - ${message}`);
  console.error("");
  process.exit(1);
}

console.log(`✓ 体积断言通过：${files.length} 个 JS chunk，合计 ${(total / 1024).toFixed(2)} MB`);
console.log(`  入口包 ${main.name} = ${main.kb.toFixed(1)} KB（上限 ${LIMITS_KB.main} KB）`);
for (const file of biggest) {
  console.log(`  最大 chunk 之一：${file.name} = ${file.kb.toFixed(1)} KB`);
}

// 第二道防线：入口包里不应出现"只有全库图标才有"的特征字符串。
// 体积阈值可能被将来的依赖膨胀掩盖，这个检查直接针对"整体引入"这个具体错误。
const entrySource = readFileSync(path.join(assetsDir, main.name), "utf8");
const suspicious = ["icons-tabler-outline", "IconLaurelWreath", "IconAB2"].filter((needle) =>
  entrySource.includes(needle),
);
if (suspicious.length > 0) {
  console.error(`✗ 入口包里出现图标库特征字符串：${suspicious.join(", ")}。图标库很可能被整体引入了。`);
  process.exit(1);
}
