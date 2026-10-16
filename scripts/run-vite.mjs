/**
 * 构建入口包装。
 *
 * 解决两个只在受限环境下出现、且都在 esbuild（Vite 的构建引擎）内部的问题——
 * Vite 没有暴露对应配置，所以只能在启动前改环境：
 *
 * 1. esbuild 默认 spawn 一个子进程来做转译。受限的沙箱/受管终端会拒绝这种
 *    "带通信管道的子进程"，报 `Error: spawn EPERM`，构建在加载 vite.config.ts 时就失败。
 *    → 设置 ESBUILD_WORKER_THREADS=1，让它改用 worker 线程（同进程内），不再 spawn。
 *
 * 2. esbuild 会把中间文件写到系统临时目录、完成后再删除。若删除被拒，报
 *    `[vite:esbuild-transpile] remove C:\Users\...\Temp\esbuild-xxxx: Access is denied.`
 *    → 把 TMPDIR/TEMP/TMP 指向项目内的 .tmp 目录（在 .gitignore 里）。
 *
 * 正常环境下这一项没有副作用（只是换个临时目录），好处是消除"换台机器就构建失败"的环境差异。
 * 已验证：wrapper 下 os.tmpdir() = <项目>/.tmp，而默认环境是 C:\Users\...\Temp\dsh-xxxx。
 *
 * 但**已有的 TMPDIR 会优先保留**：某些环境（容器、CI）已经把 TMPDIR 指到合适的位置，
 * 覆盖它反而会在项目目录里凭空建出一个 .tmp（镜像里也会多一层无用目录）。
 * 只有 TMPDIR 未设置时才回落到项目内的 .tmp。
 *
 * 用法：node scripts/run-vite.mjs build   /   node scripts/run-vite.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// 尊重环境里已有的 TMPDIR/TEMP/TMP，只在都没有时才落到项目内的 .tmp
const presetTemp = process.env.TMPDIR || process.env.TEMP || process.env.TMP;
const tempDir = presetTemp || path.join(root, ".tmp");
if (!presetTemp) mkdirSync(tempDir, { recursive: true });

const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
const args = [viteBin, ...process.argv.slice(2)];

const child = spawn(process.execPath, args, {
  cwd: path.join(root, "web"),
  stdio: "inherit",
  env: {
    ...process.env,
    ESBUILD_WORKER_THREADS: "1",
    TMPDIR: tempDir,
    TEMP: tempDir,
    TMP: tempDir,
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`vite 被信号 ${signal} 终止`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error("无法启动 vite：", error);
  process.exit(1);
});
