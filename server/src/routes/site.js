import { Hono } from "hono";
import { nowIso } from "../db.js";
import { readSiteSettings, SITE_KEYS, SITE_LIMITS } from "../site.js";
import { readJsonBody, requireOptionalString, requireString } from "../validate.js";

/**
 * 站点信息的读写。
 * 公开只读（访客需要它渲染标题与 meta 描述）；写操作由 app.js 的 /api/* 中间件统一要求管理员。
 */
export function siteRoutes({ db }) {
  const routes = new Hono();

  const upsert = db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  routes.get("/", (c) => c.json({ site: readSiteSettings(db) }));

  routes.patch("/", async (c) => {
    const body = await readJsonBody(c);
    const current = readSiteSettings(db);

    // 未提供的字段保持原值；title 不允许清空，副标题与描述允许留空。
    const title =
      body.title === undefined
        ? current.title
        : requireString(body.title, "title", { max: SITE_LIMITS.title });
    const subtitle =
      body.subtitle === undefined
        ? current.subtitle
        : requireOptionalString(body.subtitle, "subtitle", { max: SITE_LIMITS.subtitle });
    const description =
      body.description === undefined
        ? current.description
        : requireOptionalString(body.description, "description", { max: SITE_LIMITS.description });

    const at = nowIso();
    const write = db.transaction(() => {
      upsert.run(SITE_KEYS.title, title, at);
      upsert.run(SITE_KEYS.subtitle, subtitle, at);
      upsert.run(SITE_KEYS.description, description, at);
    });
    write();

    return c.json({ site: { title, subtitle, description } });
  });

  return routes;
}
