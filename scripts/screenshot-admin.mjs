/**
 * 以管理员身份截图：登录后会话 cookie 只存在于浏览器 profile 里，
 * 命令行 --screenshot 无法带 cookie，所以这里先打开登录页、填入密码、提交，
 * 再依次访问各页面截图。
 *
 * 之所以不直接用 Playwright：本环境能跑起来的浏览器形态只有 chrome-headless-shell
 * （完整 chrome.exe 会因崩溃上报服务启动失败而自终止），因此用 CDP 手动驱动。
 * 该脚本只在需要"看管理员视角界面"时运行，不是构建流程的一部分。
 *
 * 用法：node scripts/screenshot-admin.mjs [--password xxx]
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE ?? "http://127.0.0.1:8801";
const OUT = path.join(root, ".tmp", "shots-admin");
const TMP = path.join(root, ".tmp");

const passwordIndex = process.argv.indexOf("--password");
const PASSWORD = passwordIndex !== -1 ? process.argv[passwordIndex + 1] : process.env.ADMIN_PASSWORD;
if (!PASSWORD) {
  console.error("需要管理员密码：--password xxx 或环境变量 ADMIN_PASSWORD");
  process.exit(1);
}

const PAGES = { calendar: "/calendar", stats: "/stats", notes: "/notes", tags: "/tags" };
const DEVICES = [
  { name: "desktop", width: 1440, height: 1100, scale: 1 },
  { name: "mobile", width: 390, height: 900, scale: 2 },
];

const FLAGS = [
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--no-first-run",
  "--disable-extensions",
  "--disable-crash-reporter",
  "--disable-breakpad",
  "--disable-http-cache",
  "--disable-features=NetworkServiceSandbox,RendererCodeIntegrity,Crashpad",
  "--remote-debugging-port=0",
];

function findBrowser() {
  const base = path.join(os.homedir(), "AppData", "Local", "ms-playwright");
  if (!existsSync(base)) return null;
  for (const dir of readdirSync(base).sort().reverse()) {
    const candidate = path.join(base, dir, "chrome-headless-shell-win64", "chrome-headless-shell.exe");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** 极简 CDP 客户端：只实现命令调用与事件等待 */
function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  // Node 的 WebSocket 默认把文本帧给成 Blob，直接 toString() 会得到 "[object Blob]"
  socket.binaryType = "arraybuffer";
  let nextId = 1;
  const pending = new Map();
  const listeners = new Set();

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", (event) => reject(event));
  });

  socket.addEventListener("message", (event) => {
    const text =
      typeof event.data === "string" ? event.data : Buffer.from(event.data).toString("utf8");
    const message = JSON.parse(text);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    } else if (message.method) {
      for (const listener of listeners) listener(message);
    }
  });

  return {
    ready,
    send(method, params = {}) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    on(listener) {
      listeners.add(listener);
    },
    close() {
      socket.close();
    },
  };
}

/**
 * 等到页面级调试地址出现。
 *
 * 注意：不能用 Target.attachToTarget 的 flatten 会话——这个 headless shell 形态下
 * 带 sessionId 的命令会报 "'Page.enable' wasn't found"。页面自己的 webSocketDebuggerUrl
 * 是可靠的，因此直连页面端点。
 */
async function waitForPageSocket(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // 还没起来
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("等不到页面级 DevTools 端点");
}

const browser = findBrowser();
if (!browser) {
  console.error("找不到 chrome-headless-shell");
  process.exit(1);
}

const health = await fetch(`${BASE}/api/health`).catch(() => null);
if (!health?.ok) {
  console.error(`服务没有在 ${BASE} 上运行`);
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const profile = path.join(TMP, `admin-profile-${Date.now()}`);
mkdirSync(profile, { recursive: true });

const port = 9333;
const child = spawn(
  browser,
  [...FLAGS, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"],
  {
    stdio: "ignore",
    env: { ...process.env, TEMP: TMP, TMP: TMP },
  },
);

let failures = 0;

try {
  const wsUrl = await waitForPageSocket(port);
  const cdp = connect(wsUrl);
  await cdp.ready;
  const send = (method, params) => cdp.send(method, params);

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: DEVICES[0].width,
    height: DEVICES[0].height,
    deviceScaleFactor: 1,
    mobile: false,
  });

  /** 等页面把接口数据渲染完：轮询直到指定选择器出现或超时 */
  async function waitForSelector(selector, timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const { result } = await send("Runtime.evaluate", {
        expression: `!!document.querySelector(${JSON.stringify(selector)})`,
        returnByValue: true,
      });
      if (result.value) return true;
      await new Promise((r) => setTimeout(r, 150));
    }
    return false;
  }

  async function goto(url) {
    await send("Page.navigate", { url });
    await new Promise((r) => setTimeout(r, 900));
  }

  // ── 登录 ────────────────────────────────────────────────────────────
  await goto(`${BASE}/login`);
  await send("Runtime.evaluate", {
    expression: `
      const input = document.querySelector("#password");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, ${JSON.stringify(PASSWORD)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector("form").requestSubmit();
    `,
  });
  await new Promise((r) => setTimeout(r, 1800));

  const { result: loggedIn } = await send("Runtime.evaluate", {
    expression: `!!document.querySelector('a[href="/tags"]')`,
    returnByValue: true,
  });
  if (loggedIn.value) {
    console.log("✓ 登录成功（侧栏出现 Tag 管理入口）");
  } else {
    failures += 1;
    console.error("✗ 登录失败，后续截图可能是未登录视角");
  }

  // ── 逐页截图 ────────────────────────────────────────────────────────
  for (const [name, url] of Object.entries(PAGES)) {
    for (const device of DEVICES) {
      await send("Emulation.setDeviceMetricsOverride", {
        width: device.width,
        height: device.height,
        deviceScaleFactor: device.scale,
        mobile: device.name === "mobile",
      });
      await goto(BASE + url);
      await waitForSelector(".card");
      // 让图表动画/布局稳定
      await new Promise((r) => setTimeout(r, 400));
      const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
      const file = path.join(OUT, `${name}-${device.name}.png`);
      const { writeFileSync } = await import("node:fs");
      writeFileSync(file, Buffer.from(data, "base64"));
      console.log(`✓ ${path.relative(root, file)}  ${(statSync(file).size / 1024).toFixed(0)} KB`);
    }
  }
} catch (error) {
  failures += 1;
  console.error("✗ 出错：", error?.stack ?? error?.message ?? String(error) ?? "(未知)");
} finally {
  child.kill();
  setTimeout(() => {
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // 忽略清理失败
    }
    console.log(failures === 0 ? `\n全部已生成到 ${path.relative(root, OUT)}` : `\n${failures} 项异常`);
    process.exit(failures === 0 ? 0 : 1);
  }, 400);
}
