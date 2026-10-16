/**
 * 用无头 Chromium 给所有页面截图（桌面端 + 移动端），用于人工核对界面。
 *
 * 为什么需要放宽权限：Chromium 的多进程架构必须用操作系统命名管道做进程间通信，
 * 而受限沙箱禁止创建命名管道，浏览器会直接以 `mojo platform_channel: 拒绝访问` 启动失败。
 * 同理，Vite 构建需要 esbuild 启动带管道的子进程/worker 线程。
 * 这类限制无法通过改代码绕过。
 *
 * 用法：
 *   node scripts/screenshot.mjs                      # 拍全部页面
 *   node scripts/screenshot.mjs calendar stats       # 只拍指定页面
 * 前提：服务已在 BASE 上运行（默认 http://127.0.0.1:8787）。
 *
 * 输出：.tmp/shots/<页面>-<设备>.png
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE ?? "http://127.0.0.1:8787";
const OUT = path.join(root, ".tmp", "shots");
const TMP = path.join(root, ".tmp");

/** 设备预设：窗口尺寸与移动端缩放比 */
const DEVICES = [
  { name: "desktop", width: 1440, height: 1000, scale: 1 },
  { name: "mobile", width: 390, height: 844, scale: 2 },
];

const PAGES = {
  calendar: "/calendar",
  stats: "/stats",
  notes: "/notes",
  tags: "/tags",
  login: "/login",
};

/** 找到可用的 Chromium：优先 ms-playwright 的 headless shell，其次是系统 Chrome/Edge */
function findBrowser() {
  const candidates = [];

  const playwrightRoot = path.join(os.homedir(), "AppData", "Local", "ms-playwright");
  if (existsSync(playwrightRoot)) {
    for (const dir of readdirSync(playwrightRoot).sort().reverse()) {
      // 必须优先 chrome-headless-shell：完整 chrome.exe 会启动崩溃上报服务(crashpad)，
      // 而 crashpad 在受限环境下无法启动，会让浏览器直接 self-terminating（连 --version 都跑不了）。
      // headless shell 不带 crashpad，是唯一能在这种环境里跑起来的形态。
      for (const rel of [
        "chrome-headless-shell-win64/chrome-headless-shell.exe",
        "chrome-win64/chrome.exe",
      ]) {
        candidates.push(path.join(playwrightRoot, dir, rel));
      }
    }
  }

  candidates.push(
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  );

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

/**
 * 截图必需的启动参数。这几项缺一不可，都是在受限环境下实测出来的：
 *  - 关掉 NetworkServiceSandbox：否则浏览器往 profile 目录授权时被拒（拒绝访问 0x5）后不出图；
 *  - 关掉 crashpad/breakpad：headless shell 不带，显式关掉更保险；
 *  - 不使用 --single-process：它和 --screenshot 一起会挂住不退出。
 */
const CHROME_FLAGS = [
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-extensions",
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-sync",
  "--disable-crash-reporter",
  "--disable-breakpad",
  "--disable-setuid-sandbox",
  "--disable-features=NetworkServiceSandbox,RendererCodeIntegrity,Crashpad",
];

async function serverUp() {
  try {
    const response = await fetch(`${BASE}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

function shoot(browser, url, outFile, device) {
  return new Promise((resolve) => {
    const profile = path.join(TMP, `profile-${device.name}-${Date.now()}`);
    mkdirSync(profile, { recursive: true });

    const args = [
      ...CHROME_FLAGS,
      "--hide-scrollbars",
      `--user-data-dir=${profile}`,
      `--crash-dumps-dir=${TMP}`,
      `--window-size=${device.width},${device.height}`,
      `--force-device-scale-factor=${device.scale}`,
      // 给前端留出"取接口数据 + 渲染"的时间，然后立刻出图
      "--virtual-time-budget=6000",
      `--screenshot=${outFile}`,
      url,
    ];

    const child = spawn(browser, args, {
      stdio: "ignore",
      env: { ...process.env, TEMP: TMP, TMP: TMP },
    });

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(hardTimer);
      // 浏览器刚退出时 profile 里的文件可能仍被占用，清理失败不能影响截图结果
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        // 交给系统临时目录清理即可，不影响交付
      }
      resolve(result);
    };

    // 这个版本的 headless shell 出图后不一定立即退出（曾观察到挂住），
    // 因此不依赖进程退出：轮询产物文件，出现即算成功并杀掉进程。
    const poll = setInterval(() => {
      if (existsSync(outFile)) {
        try {
          child.kill();
        } catch {
          // 已经退出了
        }
        finish({ ok: true, size: statSync(outFile).size });
      }
    }, 250);

    const hardTimer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // 已经退出了
      }
      finish({ ok: existsSync(outFile), size: existsSync(outFile) ? statSync(outFile).size : 0 });
    }, 25000);

    child.on("exit", () => {
      // 进程退出时再给一秒，让最后一张图落盘
      setTimeout(() => {
        const ok = existsSync(outFile);
        finish({ ok, size: ok ? statSync(outFile).size : 0 });
      }, 300);
    });

    child.on("error", () => finish({ ok: false, size: 0 }));
  });
}

const requested = process.argv.slice(2);
const pages = requested.length > 0 ? requested.filter((name) => name in PAGES) : Object.keys(PAGES);
if (pages.length === 0) {
  console.error(`没有匹配的页面。可选：${Object.keys(PAGES).join(", ")}`);
  process.exit(1);
}

const browser = findBrowser();
if (!browser) {
  console.error("找不到可用的浏览器可执行文件。");
  process.exit(1);
}

if (!(await serverUp())) {
  console.error(`服务没有在 ${BASE} 上运行。先执行 npm run build && npm start。`);
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log(`浏览器：${browser}`);
console.log(`站点：${BASE}\n`);

let failures = 0;
for (const page of pages) {
  for (const device of DEVICES) {
    const outFile = path.join(OUT, `${page}-${device.name}.png`);
    const result = await shoot(browser, BASE + PAGES[page], outFile, device);
    if (result.ok) {
      console.log(`✓ ${path.relative(root, outFile)}  ${(result.size / 1024).toFixed(0)} KB`);
    } else {
      failures += 1;
      console.error(`✗ ${page} / ${device.name} 截图失败`);
    }
  }
}

console.log(
  failures === 0
    ? `\n全部截图已生成到 ${path.relative(root, OUT)}`
    : `\n${failures} 张失败。若报 “mojo platform_channel: 拒绝访问”，说明当前环境禁止命名管道，需要放宽权限后重试。`,
);
process.exit(failures === 0 ? 0 : 1);
