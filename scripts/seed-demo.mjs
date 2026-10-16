/**
 * 生成演示数据，用于截图核对界面。
 *
 * 设计要点：**先写入活动与随手记，最后才登录**。
 * 这样如果服务端哪天漏了鉴权，脚本会在第一步就失败（写接口返回 401），
 * 而不是悄悄写进去——等于顺带验证了"公开只读、仅管理员可写"。
 *
 * 用法：
 *   npm start                                    # 另开一个终端
 *   ADMIN_PASSWORD='你的密码' node scripts/seed-demo.mjs
 *   ADMIN_PASSWORD='你的密码' node scripts/seed-demo.mjs --reset   # 先删掉同名 Tag 再重建
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:8787";
const PASSWORD = process.env.ADMIN_PASSWORD;

if (!PASSWORD) {
  console.error("请提供管理员密码：ADMIN_PASSWORD='...' node scripts/seed-demo.mjs");
  process.exit(1);
}

let cookie = "";
let failures = 0;
let throttledRetries = 0;

/**
 * 发请求。写操作遇到 429（写限速：默认每 IP 每分钟 120 次）时退避重试并计数。
 *
 * 为什么要显式处理：这个脚本会在几秒内发出两百多次写请求，必然撞上限速。
 * 如果像以前那样不看状态码，被限速丢弃的写入不会报错，却会让"演示数据"少一大截，
 * 而且每次跑出来的数据量都不一样——这种"静默丢数据"正是最该避免的失败模式。
 */
async function call(method, url, body, { retries = 6 } = {}) {
  for (let attempt = 0; ; attempt += 1) {
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

    if (response.status === 429 && attempt < retries) {
      throttledRetries += 1;
      const text = await response.text();
      const waitMatch = /(\d+)\s*分钟/.exec(text);
      // 服务端只回报"还有几分钟"，这里按分钟粒度退避；上限 65 秒避免脚本卡太久
      const waitMs = waitMatch ? Math.min(Number(waitMatch[1]) * 60_000, 65_000) : 5_000;
      console.log(`· 触发写限速，等待 ${Math.round(waitMs / 1000)} 秒后重试 ${method} ${url}`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }
}

function check(label, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? `  ${detail}` : ""}`);
}

const TAGS = [
  { name: "编程", icon: "code", color: "#0091ff" },
  { name: "学习", icon: "book", color: "#f5a524" },
  { name: "运动", icon: "run", color: "#30a46c" },
  { name: "阅读", icon: "books", color: "#12a594" },
  { name: "音乐", icon: "music", color: "#6e56cf" },
  { name: "做饭", icon: "chef-hat", color: "#f76b15" },
];

/** 星期几（0=周日），用于让"运动"集中在周末，数据分布更像真人 */
function weekday(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function isoDate(daysAgo) {
  const now = new Date();
  const dt = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo));
  return dt.toISOString().slice(0, 10);
}

// ── 第一步：验证公开只读（此时尚未登录）────────────────────────────────
console.log("--- 先确认未登录时写不进去（公开只读）---");
const beforeLogin = await call("POST", "/api/activities", { date: isoDate(0), tag_id: 1 });
check("未登录写活动被拒绝", beforeLogin.status === 401, `status=${beforeLogin.status}`);
if (beforeLogin.status !== 401) {
  console.error("\n鉴权没有生效，中止。");
  process.exit(1);
}

// ── 第二步：登录 ──────────────────────────────────────────────────────
console.log("\n--- 登录 ---");
const login = await call("POST", "/api/auth/login", { password: PASSWORD });
check("登录成功", login.status === 200, JSON.stringify(login.body));
if (login.status !== 200) process.exit(1);

// ── 第三步：建 Tag ───────────────────────────────────────────────────
console.log("\n--- Tag ---");
const existing = await call("GET", "/api/tags");
const existingByName = new Map((existing.body.tags ?? []).map((tag) => [tag.name, tag]));
const tagIds = {};

for (const tag of TAGS) {
  const found = existingByName.get(tag.name);
  if (found) {
    tagIds[tag.name] = found.id;
    console.log(`· 已存在，复用：${tag.name} (id=${found.id})`);
    continue;
  }
  const created = await call("POST", "/api/tags", tag);
  check(`新建 Tag ${tag.name}`, created.status === 201, created.body?.tag ? `id=${created.body.tag.id}` : JSON.stringify(created.body));
  if (created.body?.tag) tagIds[tag.name] = created.body.tag.id;
}

// ── 第四步：活动记录（覆盖 75 天，含跨月）──────────────────────────────
console.log("\n--- 活动记录 ---");
// 分开统计：combos 是 (日期,Tag) 组合数，rows 是活动记录行数（同一 Tag 记多次就是多行）
let combos = 0;
let rows = 0;
let noteCount = 0;
let writeErrors = 0;

/** 记录一次活动的写结果，写失败必须计数（否则就是静默丢数据） */
async function addActivity(date, tagId, times = 1) {
  const res = await call("POST", times > 1 ? "/api/activities/bulk" : "/api/activities",
    times > 1 ? { date, tag_id: tagId, times } : { date, tag_id: tagId });
  if (res.status !== 201) {
    writeErrors += 1;
    console.error(`✗ 写入活动失败 ${date} tag=${tagId} times=${times} → ${res.status} ${JSON.stringify(res.body)}`);
    return;
  }
  combos += 1;
  rows += times;
}

async function addNote(date, content) {
  const res = await call("POST", "/api/notes", { date, content });
  if (res.status !== 201) {
    writeErrors += 1;
    console.error(`✗ 写入随手记失败 ${date} → ${res.status} ${JSON.stringify(res.body)}`);
    return;
  }
  noteCount += 1;
}

const NARRATIVES = [
  "把日历的月网格改成固定 6 行，切换月份时高度不再跳动。",
  "统计口径想清楚了：连续天数在这一天还没记录时，从昨天起算，否则每天凌晨都会看到归零。",
  "给贡献图加了横向滚动，手机上终于能看全年了。",
  "删除 Tag 前先查一次影响范围，弹窗里把条数写清楚。",
  "把日期全部改回 YYYY-MM-DD 字符串，之前那版时间戳在夜里会算到前一天。",
  "配色调色板从任意 hex 收成固定 8 色，保证任意组合下文字还是可读的。",
  "读了《设计中的设计》，关于「空」的那一节印象最深。",
  "跑了 5 公里，配速比上周快了一点。",
  "试着做了番茄牛腩，火候还是没掌握好。",
  "把图标选择器从全库改成常用+按需，公开页面的包一下子小了。",
  "重听了去年的专辑，还是第一首最好。",
  "整理了这周的笔记，发现记下来的问题有一半自己就想通了。",
];

for (let daysAgo = 74; daysAgo >= 0; daysAgo -= 1) {
  const date = isoDate(daysAgo);
  const wd = weekday(date);
  const isWeekend = wd === 0 || wd === 6;

  if (isWeekend) {
    // 周末以运动和做饭为主
    if (Math.random() < 0.75) await addActivity(date, tagIds["运动"], Math.random() < 0.35 ? 2 : 1);
    if (Math.random() < 0.5) await addActivity(date, tagIds["做饭"]);
    if (Math.random() < 0.4) await addActivity(date, tagIds["阅读"]);
    if (Math.random() < 0.35) await addActivity(date, tagIds["音乐"]);
  } else {
    // 工作日以编程和学习为主
    if (Math.random() < 0.85) await addActivity(date, tagIds["编程"], 1 + Math.floor(Math.random() * 3));
    if (Math.random() < 0.55) await addActivity(date, tagIds["学习"]);
    if (Math.random() < 0.3) await addActivity(date, tagIds["阅读"]);
    if (Math.random() < 0.2) await addActivity(date, tagIds["运动"]);
  }

  // 随手记：约一半的日子写 1~3 条，制造深浅不一的贡献图
  const noteRoll = Math.random();
  const notesToday = noteRoll < 0.45 ? 0 : noteRoll < 0.8 ? 1 : noteRoll < 0.95 ? 2 : 3;
  for (let i = 0; i < notesToday; i += 1) {
    await addNote(date, NARRATIVES[Math.floor(Math.random() * NARRATIVES.length)]);
  }
}

// 注意：限速重试不算失败（那是服务端在保护自己，脚本已正确退避）；
// 只有真正返回非 201 的写入才计入 writeErrors。
check("活动记录写入完成", writeErrors === 0 && rows > 0, `${combos} 个 (日期,Tag) 组合，共 ${rows} 行记录`);
check("随手记写入完成", writeErrors === 0 && noteCount > 0, `${noteCount} 条`);
if (throttledRetries > 0) {
  console.log(`· 期间触发写限速 ${throttledRetries} 次，已退避等待后重试，全部落库`);
}

// ── 第五步：核对统计接口能读到刚写的数据 ────────────────────────────────
console.log("\n--- 核对 ---");
const from = isoDate(74);
const to = isoDate(0);
const summary = await call("GET", `/api/stats/summary?from=${from}&to=${to}`);
check(
  "统计总次数与写入行数一致",
  summary.body?.overall?.total === rows,
  `区间 ${from} ~ ${to}，写入 ${rows} 行，接口返回 ${summary.body?.overall?.total}，活跃 ${summary.body?.overall?.activeDays} 天`,
);
// 当前连续天数取决于"今天/昨天是否有记录"，随机数据下可能为 0，只要在合理范围内即可
const streak = summary.body?.streak?.current ?? -1;
check("连续天数在合理范围内", streak >= 0 && streak <= 75, `current=${streak}, longest=${summary.body?.streak?.longest}`);

console.log(`\n${failures === 0 ? "✓ 演示数据就绪" : `✗ 有 ${failures} 项异常`}`);
console.log("现在可以执行：node scripts/screenshot.mjs");
process.exit(failures === 0 ? 0 : 1);
