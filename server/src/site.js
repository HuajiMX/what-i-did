/**
 * 站点信息（title / subtitle / description）。
 *
 * 存在 settings 表的 key-value 里，而不是环境变量：
 *  ① 后台表单改完立即生效，不必重启进程；
 *  ② 站点文案属于数据，和 Tag、随手记一样应该进数据库备份。
 *
 * 默认值同时是"表里还没有记录"时的读取结果，所以 schema.sql 不需要 seed。
 * 前端 web/src/state/site.tsx 里有一份仅供加载失败时兜底的同样默认值，改动时两边同步。
 */

export const DEFAULT_SITE = Object.freeze({
  title: "我做了什么",
  subtitle: "生活记录与统计",
  description: "个人生活记录与统计：日历活动、随手记与时段统计",
});

export const SITE_LIMITS = Object.freeze({
  title: 40,
  subtitle: 60,
  description: 200,
});

export const SITE_KEYS = Object.freeze({
  title: "site.title",
  subtitle: "site.subtitle",
  description: "site.description",
});

/** 读取站点信息；缺失的键逐项回落到默认值（部分写入也不会让接口返回 undefined）。 */
export function readSiteSettings(db) {
  const rows = db
    .prepare("SELECT key, value FROM settings WHERE key IN (?, ?, ?)")
    .all(SITE_KEYS.title, SITE_KEYS.subtitle, SITE_KEYS.description);
  const values = new Map(rows.map((row) => [row.key, row.value]));

  return {
    title: values.get(SITE_KEYS.title) ?? DEFAULT_SITE.title,
    subtitle: values.get(SITE_KEYS.subtitle) ?? DEFAULT_SITE.subtitle,
    description: values.get(SITE_KEYS.description) ?? DEFAULT_SITE.description,
  };
}

/**
 * 页面名映射。与 web/src/App.tsx 的 pageLabel 保持一致：
 * 服务端注入首屏标题，前端接管后续 SPA 导航，两边算出的标题必须相同，否则刷新会闪一下。
 */
export function pageLabel(pathname) {
  if (pathname.startsWith("/stats")) return "统计";
  if (pathname.startsWith("/notes")) return "随手记";
  if (pathname.startsWith("/tags")) return "管理";
  if (pathname.startsWith("/login")) return "登录";
  return "日历";
}

const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** 站点文案来自后台输入，注入 HTML 前必须转义。 */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/**
 * 把数据库里的站点信息写进 index.html 的 <title> 与 meta description。
 *
 * 这一步在服务端完成，而不是只靠前端 useEffect：搜索引擎和其他不执行 JS 的抓取器
 * 看到的是首屏 HTML，必须在这里就已经是配置后的标题与描述。
 */
export function renderIndexHtml(html, site, pathname = "/") {
  const page = pageLabel(pathname);
  const documentTitle = site.title ? (page ? `${page} · ${site.title}` : site.title) : page;
  const titleTag = `<title>${escapeHtml(documentTitle)}</title>`;
  const description = escapeHtml(site.description ?? "");

  let output = html;
  if (/<title>[\s\S]*?<\/title>/i.test(output)) {
    output = output.replace(/<title>[\s\S]*?<\/title>/i, () => titleTag);
  } else {
    output = output.replace(/<\/head>/i, () => `  ${titleTag}\n</head>`);
  }

  const descriptionPattern = /<meta\s+name=["']description["'][^>]*>/i;
  if (description) {
    const descriptionTag = `<meta name="description" content="${description}" />`;
    if (descriptionPattern.test(output)) {
      output = output.replace(descriptionPattern, () => descriptionTag);
    } else {
      output = output.replace(/<\/head>/i, () => `  ${descriptionTag}\n</head>`);
    }
  } else {
    output = output.replace(descriptionPattern, "");
  }

  return output;
}
