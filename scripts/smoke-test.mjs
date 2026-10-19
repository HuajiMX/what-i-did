/**
 * 端到端冒烟测试：用真实 HTTP 请求打一个真实监听端口的服务实例。
 * 覆盖跨年 streak、趋势分桶、分布、贡献图计数、未授权写入拒绝、静态资源头等。
 * 与 server/test/*.test.js 的区别：这里真的走网络栈（真 socket、真 cookie、真静态文件），
 * 验证的是"能部署起来的那个东西"。
 *
 * 服务在**本进程内**启动，不 spawn 子进程：受限沙箱禁止带管道的子进程启动，
 * 而且进程内启动同样能验证网络栈，还更简单。
 */
import { serve } from "@hono/node-server";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../server/src/app.js";
import { openDatabase } from "../server/src/db.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8791;
const BASE = `http://127.0.0.1:${PORT}`;
const DB = path.join(root, ".tmp", "e2e.db");
const PASSWORD = "local-dev-password-123";

for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });

let cookie = "";
let failures = 0;

async function call(method, url, body) {
  const response = await fetch(BASE + url, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

function check(label, condition, detail = "") {
  const mark = condition ? "✓" : "✗";
  if (!condition) failures += 1;
  console.log(`${mark} ${label}${detail ? `  ${detail}` : ""}`);
}

const db = openDatabase(DB);
const app = createApp({ db });

/** 等服务真正开始监听（避免竞态） */
async function waitForServer() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return true;
    } catch {
      // 还没起来
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

const server = serve({ fetch: app.fetch, port: PORT, hostname: "127.0.0.1" }, () => {});

try {
  if (!(await waitForServer())) throw new Error("服务在 5 秒内没有就绪");

  console.log("\n--- 鉴权 ---");
  check("未登录读健康检查", (await call("GET", "/api/health")).status === 200);
  check("未登录写活动被拒 401", (await call("POST", "/api/activities", { date: "2026-05-12", tag_id: 1 })).status === 401);
  check("未登录建 Tag 被拒 401", (await call("POST", "/api/tags", { name: "x", icon: "run", color: "#0091ff" })).status === 401);
  check("未登录改站点信息被拒 401", (await call("PATCH", "/api/site", { title: "偷改" })).status === 401);
  check("站点信息默认值公开可读", (await call("GET", "/api/site")).body.site.title === "我做了什么");
  check("错误密码 401", (await call("POST", "/api/auth/login", { password: "wrong" })).status === 401);
  check("正确密码登录成功", (await call("POST", "/api/auth/login", { password: PASSWORD })).status === 200);
  check("/api/me 变成 admin", (await call("GET", "/api/me")).body.admin === true);

  console.log("\n--- 站点信息 ---");
  const siteUpdated = await call("PATCH", "/api/site", {
    title: "E2E 站点",
    subtitle: "E2E 副标题",
    description: "E2E 描述",
  });
  check("管理员可更新站点信息", siteUpdated.status === 200 && siteUpdated.body.site.title === "E2E 站点");
  const sitePublic = await call("GET", "/api/site");
  check(
    "公开端立刻读到新站点信息",
    sitePublic.body.site.subtitle === "E2E 副标题" && sitePublic.body.site.description === "E2E 描述",
  );

  console.log("\n--- Tag 管理 ---");
  const coding = await call("POST", "/api/tags", { name: "编程", icon: "code", color: "#0091ff" });
  const sport = await call("POST", "/api/tags", { name: "运动", icon: "run", color: "#30a46c" });
  const study = await call("POST", "/api/tags", { name: "学习", icon: "book", color: "#f5a524" });
  check("建 3 个 Tag", [coding, sport, study].every((r) => r.status === 201));
  check("重名 Tag 冲突 409", (await call("POST", "/api/tags", { name: "编程", icon: "code", color: "#0091ff" })).status === 409);
  check("非法图标名 400", (await call("POST", "/api/tags", { name: "别的", icon: "not-real", color: "#0091ff" })).status === 400);
  const patched = await call("PATCH", `/api/tags/${study.body.tag.id}`, { name: "阅读", icon: "books", color: "#12a594" });
  check("改名/换图标生效", patched.body?.tag?.name === "阅读" && patched.body?.tag?.icon === "books");

  console.log("\n--- 活动记录（跨年）---");
  for (const date of ["2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02"]) {
    await call("POST", "/api/activities/bulk", { date, tag_id: coding.body.tag.id, times: 2 });
  }
  await call("POST", "/api/activities", { date: "2026-01-02", tag_id: sport.body.tag.id });
  const day = await call("GET", "/api/activities/day?date=2026-01-02");
  check("单日明细含两条 Tag 共 3 次", day.body.activities.length === 3, JSON.stringify(day.body.activities.map((a) => [a.tag_name, a.icon])));
  const range = await call("GET", "/api/activities?from=2025-12-28&to=2026-01-03");
  check("区间聚合按天按 Tag", range.body.total === 9 && range.body.dates["2026-01-02"][String(coding.body.tag.id)] === 2, JSON.stringify(range.body.dates));
  check("撤销一次只删一条", (await call("DELETE", `/api/activities/latest?date=2026-01-02&tag_id=${sport.body.tag.id}`)).status === 200);
  check("撤到空返回 404", (await call("DELETE", `/api/activities/latest?date=2026-01-02&tag_id=${sport.body.tag.id}`)).status === 404);

  console.log("\n--- 统计边界 ---");
  const summary = await call("GET", "/api/stats/summary?from=2025-12-28&to=2026-01-03");
  check("跨年连续 4 天", summary.body.streak.longest === 4, JSON.stringify(summary.body.streak));
  check("区间天数 7 天", summary.body.overall.rangeDays === 7);
  check("活跃天数 4 天", summary.body.overall.activeDays === 4);
  const weekly = await call("GET", "/api/stats/trend?from=2025-12-28&to=2026-01-03&bucket=week");
  check("按周分桶为 2 个桶", weekly.body.points.length === 2, JSON.stringify(weekly.body.points));
  check("周桶计数正确", weekly.body.points[0].count + weekly.body.points[1].count === 8, JSON.stringify(weekly.body.points));
  const monthly = await call("GET", "/api/stats/trend?from=2025-12-28&to=2026-01-03&bucket=month");
  check("按月分桶为 2 个桶（跨年）", monthly.body.points.length === 2, JSON.stringify(monthly.body.points));
  const dist = await call("GET", `/api/stats/distribution?from=2025-12-28&to=2026-01-03&tag_ids=${coding.body.tag.id}`);
  check("分布按 Tag 筛选后只剩 1 个", dist.body.tags.length === 1 && dist.body.total === 8);
  check("非法区间 400", (await call("GET", "/api/stats/summary?from=2026-01-03&to=2026-01-01")).status === 400);
  check("非法 bucket 400", (await call("GET", "/api/stats/trend?from=2026-01-01&to=2026-01-02&bucket=hour")).status === 400);

  console.log("\n--- 随手记 ---");
  await call("POST", "/api/notes", { date: "2026-01-02", content: "跨年也在记" });
  await call("POST", "/api/notes", { date: "2026-01-02", content: "第二条" });
  const notes = await call("GET", "/api/notes?from=2025-12-01&to=2026-01-31");
  check("贡献图按天计数为 2", notes.body.counts["2026-01-02"] === 2, JSON.stringify(notes.body.counts));
  const notesDay = await call("GET", "/api/notes/day?date=2026-01-02");
  const edited = await call("PATCH", `/api/notes/${notesDay.body.notes[0].id}`, { content: "改过" });
  check("编辑随手记生效", edited.body.note.content === "改过");
  check("删除随手记", (await call("DELETE", `/api/notes/${notesDay.body.notes[0].id}`)).status === 200);

  console.log("\n--- 级联删除与静态资源 ---");
  const impact = await call("GET", `/api/tags/${coding.body.tag.id}/impact`);
  check("删除前影响范围 = 8 条", impact.body.activities === 8, JSON.stringify(impact.body));
  const removed = await call("DELETE", `/api/tags/${coding.body.tag.id}`);
  check("级联删除回报条数", removed.body.deleted.activities === 8);
  check("级联后当天明细为空", (await call("GET", "/api/activities/day?date=2026-01-02")).body.activities.length === 0);
  const page = await fetch(`${BASE}/stats`);
  check("深层路由返回 index.html", page.status === 200 && (await page.text()).includes('id="root"'));
  const indexHtml = await (await fetch(`${BASE}/`)).text();
  const assetName = indexHtml.match(/assets\/(index-[^"]+\.js)/)?.[1];
  const asset = await fetch(`${BASE}/assets/${assetName}`);
  check("静态资源长缓存头", (asset.headers.get("cache-control") ?? "").includes("immutable"), asset.headers.get("cache-control") ?? "");
  check("静态资源带 CSP", (asset.headers.get("content-security-policy") ?? "").includes("default-src 'self'"));
  const favicon = await fetch(`${BASE}/favicon.ico`);
  check(
    "favicon.ico 可访问且 MIME 正确",
    favicon.status === 200 && (favicon.headers.get("content-type") ?? "").includes("icon"),
    favicon.headers.get("content-type") ?? "",
  );
  check(
    "index.html 同时声明 ico 与 svg favicon",
    indexHtml.includes('href="/favicon.ico"') && indexHtml.includes('href="/favicon.svg"'),
  );

  console.log("\n--- 退出登录 ---");
  await call("POST", "/api/auth/logout");
  check("退出后写操作重新被拒", (await call("POST", "/api/tags", { name: "再建", icon: "run", color: "#0091ff" })).status === 401);
} catch (error) {
  failures += 1;
  console.error("\n✗ 测试过程出错：", error);
} finally {
  server.close();
  db.close();
  await new Promise((resolve) => setTimeout(resolve, 200));
}

console.log(`\n${failures === 0 ? "✓ 端到端冒烟测试全部通过" : `✗ 有 ${failures} 项未通过`}`);
process.exit(failures === 0 ? 0 : 1);
