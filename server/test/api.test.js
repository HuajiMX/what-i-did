import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "./_setup.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.js";
import { hashPassword, SESSION_COOKIE } from "../src/auth.js";
import { createDatabase } from "../src/db.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const iconNames = JSON.parse(readFileSync(path.join(here, "..", "src", "icon-names.json"), "utf8")).names;

const PASSWORD = "correct-horse-battery";
const TODAY = "2026-05-12";

let db;
let app;

beforeEach(() => {
  // 每个用例一个全新的内存库，互不干扰
  db = createDatabase(":memory:");
  app = createApp({ db: db.db, clock: () => new Date(`${TODAY}T10:00:00`) });
  process.env.ADMIN_PASSWORD_HASH = hashPassword(PASSWORD);
});

/** 轻量请求客户端：自动带上会话 cookie（服务端只通过 cookie 判断身份） */
function client() {
  let cookie = null;
  return {
    async fetch(method, url, body) {
      const headers = { "content-type": "application/json" };
      if (cookie) headers.cookie = cookie;
      const res = await app.fetch(
        new Request(`http://localhost${url}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      );
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0];
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
    },
    get(url) {
      return this.fetch("GET", url);
    },
    /** 供需要直接构造 Request 的用例复用会话 */
    cookieHeader() {
      return cookie ?? "";
    },
    async login(password = PASSWORD) {
      return this.fetch("POST", "/api/auth/login", { password });
    },
  };
}

async function adminClient() {
  const c = client();
  const res = await c.login();
  assert.equal(res.status, 200, `登录失败：${JSON.stringify(res.body)}`);
  return c;
}

async function createTag(c, name, icon = "run", color = "#30a46c") {
  const res = await c.fetch("POST", "/api/tags", { name, icon, color });
  assert.equal(res.status, 201, `建 Tag 失败：${JSON.stringify(res.body)}`);
  return res.body.tag;
}

// ── 图标白名单 ───────────────────────────────────────────────────────────

test("生成的图标清单带有实际存在的名字", () => {
  assert.ok(iconNames.length > 5000, `图标数量异常：${iconNames.length}`);
  for (const name of ["run", "bike", "book", "code", "yoga", "heart"]) {
    assert.ok(iconNames.includes(name), `清单应包含 ${name}`);
  }
});

// ── 公开读 ───────────────────────────────────────────────────────────────

test("未登录可以读取全部公开数据", async () => {
  const c = client();
  for (const url of [
    "/api/health",
    "/api/site",
    "/api/tags",
    "/api/activities?from=2026-05-01&to=2026-05-31",
    "/api/activities/day?date=2026-05-12",
    "/api/notes?from=2026-05-01&to=2026-05-31",
    "/api/notes/day?date=2026-05-12",
    "/api/notes/recent",
    "/api/stats/summary?from=2026-05-01&to=2026-05-31",
    "/api/stats/trend?from=2026-05-01&to=2026-05-31&bucket=day",
    "/api/stats/distribution?from=2026-05-01&to=2026-05-31",
    "/api/stats/daily?from=2026-05-01&to=2026-05-31",
    "/api/stats/streak?from=2026-05-01&to=2026-05-31",
  ]) {
    const res = await c.get(url);
    assert.equal(res.status, 200, `${url} 应对公众开放，实际 ${res.status}`);
  }
});

test("/api/me 对匿名用户返回 admin=false", async () => {
  const res = await client().get("/api/me");
  assert.equal(res.status, 200);
  assert.equal(res.body.admin, false);
});

test("站点信息默认值可公开读取，且只有管理员能修改", async () => {
  const anonymous = client();
  const initial = await anonymous.get("/api/site");
  assert.equal(initial.status, 200);
  assert.deepEqual(initial.body.site, {
    title: "我做了什么",
    subtitle: "生活记录与统计",
    description: "个人生活记录与统计：日历活动、随手记与时段统计",
  });

  const admin = await adminClient();
  const updated = await admin.fetch("PATCH", "/api/site", {
    title: "每日记录",
    subtitle: "生活切片",
    description: "记录每天做过的事",
  });
  assert.equal(updated.status, 200);
  assert.deepEqual(updated.body.site, {
    title: "每日记录",
    subtitle: "生活切片",
    description: "记录每天做过的事",
  });

  // 公开读端立刻读到新值，不需要重启或刷新服务
  assert.deepEqual((await anonymous.get("/api/site")).body.site, updated.body.site);
});

test("站点信息允许留空副标题与描述，但不允许空标题或超长字段", async () => {
  const admin = await adminClient();

  const cleared = await admin.fetch("PATCH", "/api/site", { subtitle: "", description: "" });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.site.subtitle, "");
  assert.equal(cleared.body.site.description, "");
  // 未提供的字段保持原值
  assert.equal(cleared.body.site.title, "我做了什么");

  assert.equal((await admin.fetch("PATCH", "/api/site", { title: "   " })).status, 400);
  assert.equal((await admin.fetch("PATCH", "/api/site", { title: "x".repeat(41) })).status, 400);
  assert.equal((await admin.fetch("PATCH", "/api/site", { subtitle: "x".repeat(61) })).status, 400);
  assert.equal((await admin.fetch("PATCH", "/api/site", { description: "x".repeat(201) })).status, 400);
  assert.equal((await admin.fetch("PATCH", "/api/site", { title: 123 })).status, 400);
});

// ── 未授权写入必须被拒 ───────────────────────────────────────────────────

test("未登录的任何写操作都返回 401", async () => {
  const c = client();
  const attempts = [
    ["PATCH", "/api/site", { title: "偷改站点" }],
    ["POST", "/api/tags", { name: "编程", icon: "code", color: "#0091ff" }],
    ["PATCH", "/api/tags/1", { name: "改名" }],
    ["DELETE", "/api/tags/1", undefined],
    ["POST", "/api/activities", { date: TODAY, tag_id: 1 }],
    ["POST", "/api/activities/bulk", { date: TODAY, tag_id: 1, times: 3 }],
    ["DELETE", "/api/activities/1", undefined],
    ["DELETE", "/api/activities/latest?date=2026-05-12&tag_id=1", undefined],
    ["POST", "/api/notes", { date: TODAY, content: "偷写" }],
    ["PATCH", "/api/notes/1", { content: "偷改" }],
    ["DELETE", "/api/notes/1", undefined],
  ];
  for (const [method, url, body] of attempts) {
    const res = await c.fetch(method, url, body);
    assert.equal(res.status, 401, `${method} ${url} 应被拒绝，实际 ${res.status}`);
  }
});

// ── 标签管理 ─────────────────────────────────────────────────────────────

test("Tag 的增改删（含排序与使用次数）", async () => {
  const c = await adminClient();
  const coding = await createTag(c, "编程", "code", "#0091ff");
  const sport = await createTag(c, "运动", "run", "#30a46c");
  assert.equal(coding.name, "编程");
  assert.equal(coding.icon, "code");

  let list = await c.get("/api/tags");
  assert.equal(list.body.tags.length, 2);

  await c.fetch("POST", "/api/activities", { date: TODAY, tag_id: coding.id });
  list = await c.get("/api/tags");
  const withCount = list.body.tags.find((t) => t.id === coding.id);
  assert.equal(withCount.usage_count, 1, "使用次数应随活动记录增长");

  const patched = await c.fetch("PATCH", `/api/tags/${sport.id}`, { name: "健身", icon: "barbell", color: "#e5484d" });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.tag.name, "健身");
  assert.equal(patched.body.tag.icon, "barbell");

  const deleted = await c.fetch("DELETE", `/api/tags/${sport.id}`);
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.deleted.activities, 0);
  assert.equal((await c.get("/api/tags")).body.tags.length, 1);
});

test("Tag 参数校验：重名、非法图标、非法颜色、超长名称", async () => {
  const c = await adminClient();
  await createTag(c, "编程", "code");

  assert.equal((await c.fetch("POST", "/api/tags", { name: "编程", icon: "code", color: "#0091ff" })).status, 409);
  assert.equal((await c.fetch("POST", "/api/tags", { name: "学习", icon: "not-a-real-icon", color: "#0091ff" })).status, 400);
  assert.equal((await c.fetch("POST", "/api/tags", { name: "学习", icon: "book", color: "#123456" })).status, 400);
  assert.equal((await c.fetch("POST", "/api/tags", { name: "", icon: "book", color: "#0091ff" })).status, 400);
  assert.equal((await c.fetch("POST", "/api/tags", { name: "x".repeat(25), icon: "book", color: "#0091ff" })).status, 400);
});

test("删除 Tag 会级联删除其活动，并回报影响条数", async () => {
  const c = await adminClient();
  const tag = await createTag(c, "运动", "run");
  await c.fetch("POST", "/api/activities/bulk", { date: TODAY, tag_id: tag.id, times: 5 });

  const impact = await c.get(`/api/tags/${tag.id}/impact`);
  assert.equal(impact.body.activities, 5);

  const deleted = await c.fetch("DELETE", `/api/tags/${tag.id}`);
  assert.equal(deleted.body.deleted.activities, 5);

  const day = await c.get(`/api/activities/day?date=${TODAY}`);
  assert.deepEqual(day.body.activities, [], "级联删除后不应残留活动记录");
});

// ── 活动记录 ─────────────────────────────────────────────────────────────

test("同一天同一 Tag 记多次 = 多行，次数统计正确", async () => {
  const c = await adminClient();
  const sport = await createTag(c, "运动", "run");

  await c.fetch("POST", "/api/activities", { date: TODAY, tag_id: sport.id });
  await c.fetch("POST", "/api/activities/bulk", { date: TODAY, tag_id: sport.id, times: 2 });

  const range = await c.get(`/api/activities?from=2026-05-01&to=2026-05-31`);
  assert.equal(range.body.dates[TODAY][String(sport.id)], 3);
  assert.equal(range.body.total, 3);

  const day = await c.get(`/api/activities/day?date=${TODAY}`);
  assert.equal(day.body.activities.length, 3);
  assert.ok(day.body.activities.every((a) => a.tag_id === sport.id));
  assert.equal(day.body.activities[0].tag_name, "运动", "日明细要带上 Tag 信息，前端才能直接画");
});

test("撤销一次（DELETE /latest）只删一条", async () => {
  const c = await adminClient();
  const sport = await createTag(c, "运动", "run");
  await c.fetch("POST", "/api/activities/bulk", { date: TODAY, tag_id: sport.id, times: 3 });

  const undone = await c.fetch("DELETE", `/api/activities/latest?date=${TODAY}&tag_id=${sport.id}`);
  assert.equal(undone.status, 200);
  assert.equal((await c.get(`/api/activities/day?date=${TODAY}`)).body.activities.length, 2);

  // 撤到没有为止
  await c.fetch("DELETE", `/api/activities/latest?date=${TODAY}&tag_id=${sport.id}`);
  await c.fetch("DELETE", `/api/activities/latest?date=${TODAY}&tag_id=${sport.id}`);
  assert.equal((await c.fetch("DELETE", `/api/activities/latest?date=${TODAY}&tag_id=${sport.id}`)).status, 404);
});

test("活动记录参数校验与跨 Tag 过滤", async () => {
  const c = await adminClient();
  const a = await createTag(c, "编程", "code");
  const b = await createTag(c, "运动", "run");
  await c.fetch("POST", "/api/activities", { date: TODAY, tag_id: a.id });
  await c.fetch("POST", "/api/activities/bulk", { date: TODAY, tag_id: b.id, times: 2 });

  assert.equal((await c.fetch("POST", "/api/activities", { date: "2026-02-30", tag_id: a.id })).status, 400);
  assert.equal((await c.fetch("POST", "/api/activities", { date: TODAY, tag_id: 9999 })).status, 400);

  const filtered = await c.get(`/api/activities?from=2026-05-01&to=2026-05-31&tag_ids=${a.id}`);
  assert.equal(filtered.body.total, 1);
  const both = await c.get(`/api/activities?from=2026-05-01&to=2026-05-31&tag_ids=${a.id},${b.id}`);
  assert.equal(both.body.total, 3);
});

// ── 统计 ─────────────────────────────────────────────────────────────────

test("统计按 Tag 筛选后计数与占比一致", async () => {
  const c = await adminClient();
  const coding = await createTag(c, "编程", "code");
  const sport = await createTag(c, "运动", "run");
  await c.fetch("POST", "/api/activities/bulk", { date: "2026-05-11", tag_id: coding.id, times: 3 });
  await c.fetch("POST", "/api/activities/bulk", { date: "2026-05-12", tag_id: sport.id, times: 1 });

  const all = await c.get("/api/stats/summary?from=2026-05-01&to=2026-05-31");
  assert.equal(all.body.overall.total, 4);
  assert.equal(all.body.overall.activeDays, 2);
  const codingStat = all.body.tags.find((t) => t.tag_id === coding.id);
  assert.equal(codingStat.count, 3);
  assert.equal(codingStat.days, 1);
  assert.ok(Math.abs(codingStat.share - 0.75) < 1e-9);

  const onlySport = await c.get(`/api/stats/summary?from=2026-05-01&to=2026-05-31&tag_ids=${sport.id}`);
  assert.equal(onlySport.body.overall.total, 1, "筛选后总数只含被选中的 Tag");
  assert.equal(onlySport.body.tags.length, 1);
});

test("统计支持月/年/自定义时段，且非法区间被拒", async () => {
  const c = await adminClient();
  const tag = await createTag(c, "编程", "code");
  await c.fetch("POST", "/api/activities", { date: "2025-12-31", tag_id: tag.id });
  await c.fetch("POST", "/api/activities", { date: "2026-01-01", tag_id: tag.id });
  await c.fetch("POST", "/api/activities", { date: "2026-05-12", tag_id: tag.id });

  const month = await c.get("/api/stats/summary?from=2026-05-01&to=2026-05-31");
  assert.equal(month.body.overall.total, 1);

  const year = await c.get("/api/stats/summary?from=2026-01-01&to=2026-12-31");
  assert.equal(year.body.overall.total, 2);

  const custom = await c.get("/api/stats/summary?from=2025-12-31&to=2026-01-01");
  assert.equal(custom.body.overall.total, 2);

  assert.equal((await c.get("/api/stats/summary?from=2026-05-31&to=2026-05-01")).status, 400);
  assert.equal((await c.get("/api/stats/summary?from=2026-05-01")).status, 400);
  assert.equal((await c.get("/api/stats/trend?from=2026-05-01&to=2026-05-31&bucket=hour")).status, 400);
});

test("连续天数与趋势按真实数据计算", async () => {
  const c = await adminClient();
  const tag = await createTag(c, "编程", "code");
  // 5-10、5-11、5-12 连续三天（today = 5-12）
  for (const date of ["2026-05-10", "2026-05-11", "2026-05-12"]) {
    await c.fetch("POST", "/api/activities", { date, tag_id: tag.id });
  }
  const streak = await c.get("/api/stats/streak?from=2026-05-01&to=2026-05-31");
  assert.equal(streak.body.current, 3);
  assert.equal(streak.body.longest, 3);

  const trend = await c.get("/api/stats/trend?from=2026-05-10&to=2026-05-12&bucket=day");
  assert.deepEqual(trend.body.points.map((p) => p.count), [1, 1, 1]);
});

// ── 随手记 ───────────────────────────────────────────────────────────────

test("随手记的增改删与按日筛选", async () => {
  const c = await adminClient();
  const first = await c.fetch("POST", "/api/notes", { date: TODAY, content: "今天写了第一版日历" });
  assert.equal(first.status, 201);
  await c.fetch("POST", "/api/notes", { date: TODAY, content: "顺手修了连续天数的边界" });
  await c.fetch("POST", "/api/notes", { date: "2026-05-11", content: "昨天" });

  const day = await c.get(`/api/notes/day?date=${TODAY}`);
  assert.equal(day.body.notes.length, 2);

  const counts = await c.get("/api/notes?from=2026-05-01&to=2026-05-31");
  assert.equal(counts.body.counts[TODAY], 2);
  assert.equal(counts.body.counts["2026-05-11"], 1);
  assert.equal(counts.body.total, 3);

  const edited = await c.fetch("PATCH", `/api/notes/${first.body.note.id}`, { content: "改过了" });
  assert.equal(edited.body.note.content, "改过了");
  assert.notEqual(edited.body.note.updated_at, undefined);

  assert.equal((await c.fetch("DELETE", `/api/notes/${first.body.note.id}`)).status, 200);
  assert.equal((await c.get(`/api/notes/day?date=${TODAY}`)).body.notes.length, 1);

  assert.equal((await c.fetch("POST", "/api/notes", { date: TODAY, content: "   " })).status, 400);
  assert.equal((await c.fetch("POST", "/api/notes", { date: "bad", content: "x" })).status, 400);
});

test("年份筛选只返回有记录的年份（降序、去重）", async () => {
  const c = client();
  const empty = await c.get("/api/notes/years");
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.years, [], "没有随手记时不应列出任何年份");

  const admin = await adminClient();
  for (const [date, content] of [
    ["2024-03-05", "前年的记录"],
    ["2024-11-20", "同年前的另一条"],
    ["2025-01-02", "去年的记录"],
    ["2026-05-12", "今年的记录"],
  ]) {
    assert.equal((await admin.fetch("POST", "/api/notes", { date, content })).status, 201);
  }
  // 空档年份（2023）不该出现
  const result = await c.get("/api/notes/years");
  assert.deepEqual(result.body.years, [2026, 2025, 2024]);
});

test("请求体不是合法 JSON 时返回 400 而不是 500", async () => {
  const c = await adminClient();
  // 直接发原始字符串，绕过 JSON.stringify（模拟手工拼错 / 客户端 bug）
  const broken = await app.fetch(
    new Request("http://localhost/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: c.cookieHeader() },
      body: `{"date":"2026-05-12", "content":}`,
    }),
  );
  assert.equal(broken.status, 400, "格式错误的 JSON 属于客户端错误");
});

// ── 登录 ─────────────────────────────────────────────────────────────────

test("密码错误返回 401，正确后 /api/me 变为 admin", async () => {
  const c = client();
  assert.equal((await c.login("wrong-password")).status, 401);
  assert.equal((await c.get("/api/me")).body.admin, false);

  assert.equal((await c.login()).status, 200);
  assert.equal((await c.get("/api/me")).body.admin, true);
});

test("连续输错密码会触发限速（429）", async () => {
  const c = client();
  for (let i = 0; i < 5; i += 1) {
    assert.equal((await c.login("wrong")).status, 401, `第 ${i + 1} 次应是 401`);
  }
  const blocked = await c.login("wrong");
  assert.equal(blocked.status, 429, "第 6 次应被限速");
  // 即使密码正确，锁定期内也不能登录，否则限速形同虚设
  assert.equal((await c.login()).status, 429);
});

test("退出登录后写操作重新被拒", async () => {
  const c = await adminClient();
  await createTag(c, "编程", "code");
  assert.equal((await c.fetch("POST", "/api/auth/logout")).status, 200);
  assert.equal((await c.fetch("POST", "/api/tags", { name: "学习", icon: "book", color: "#0091ff" })).status, 401);
});

test("伪造的会话 cookie 不被接受", async () => {
  const res = await app.fetch(
    new Request("http://localhost/api/me", { headers: { cookie: `${SESSION_COOKIE}=forged-token-value-that-is-long-enough` } }),
  );
  assert.equal((await res.json()).admin, false);
});

test("安全响应头已附加", async () => {
  const res = await app.fetch(new Request("http://localhost/api/health"));
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.match(res.headers.get("content-security-policy") ?? "", /default-src 'self'/);
});
