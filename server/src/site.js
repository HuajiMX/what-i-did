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
