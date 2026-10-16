import { Hono } from "hono";
import { nowIso } from "../db.js";
import { readJsonBody, requireColor, requireIconName, requireInt, requireString, ValidationError, MAX_TAG_NAME } from "../validate.js";

/**
 * Tag 的增删改查。
 * 公开只有读；写操作由 index.js 统一挂 requireAdmin 中间件。
 */
export function tagRoutes({ db, iconNames }) {
  const routes = new Hono();

  const listWithCounts = db.prepare(`
    SELECT t.id, t.name, t.icon, t.color, t.sort_order,
           (SELECT COUNT(*) FROM activities a WHERE a.tag_id = t.id) AS usage_count
    FROM tags t
    ORDER BY t.sort_order ASC, t.id ASC
  `);
  const selectById = db.prepare("SELECT id, name, icon, color, sort_order FROM tags WHERE id = ?");
  const insert = db.prepare(
    "INSERT INTO tags (name, icon, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const nameTaken = db.prepare("SELECT id FROM tags WHERE name = ? AND id <> ?");
  const maxSort = db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM tags");
  const remove = db.prepare("DELETE FROM tags WHERE id = ?");
  const countActivities = db.prepare("SELECT COUNT(*) AS c FROM activities WHERE tag_id = ?");

  routes.get("/", (c) => c.json({ tags: listWithCounts.all() }));

  routes.post("/", async (c) => {
    const body = await readJsonBody(c);
    const name = requireString(body.name, "name", { max: MAX_TAG_NAME });
    const icon = requireIconName(body.icon, iconNames);
    const color = requireColor(body.color);
    if (nameTaken.get(name, -1)) throw new ValidationError(`已存在同名 Tag：${name}`, 409);
    const sortOrder = Number.isInteger(body.sort_order) ? body.sort_order : maxSort.get().m + 1;
    const info = insert.run(name, icon, color, sortOrder, nowIso());
    return c.json({ tag: selectById.get(info.lastInsertRowid) }, 201);
  });

  routes.patch("/:id", async (c) => {
    const id = requireInt(Number(c.req.param("id")), "id", { min: 1 });
    const current = selectById.get(id);
    if (!current) return c.json({ error: "Tag 不存在" }, 404);

    const body = await readJsonBody(c);
    const name = body.name === undefined ? current.name : requireString(body.name, "name", { max: MAX_TAG_NAME });
    const icon = body.icon === undefined ? current.icon : requireIconName(body.icon, iconNames);
    const color = body.color === undefined ? current.color : requireColor(body.color);
    const sortOrder =
      body.sort_order === undefined ? current.sort_order : requireInt(body.sort_order, "sort_order");

    if (name !== current.name && nameTaken.get(name, id)) {
      throw new ValidationError(`已存在同名 Tag：${name}`, 409);
    }
    db.prepare("UPDATE tags SET name = ?, icon = ?, color = ?, sort_order = ? WHERE id = ?").run(
      name,
      icon,
      color,
      sortOrder,
      id,
    );
    return c.json({ tag: selectById.get(id) });
  });

  /**
   * 删除 Tag 会级联删除它的全部活动记录。这是不可逆的，
   * 因此响应里明确回报被删掉的记录数，前端在确认弹窗里也要先显示这个数。
   */
  routes.delete("/:id", (c) => {
    const id = requireInt(Number(c.req.param("id")), "id", { min: 1 });
    const current = selectById.get(id);
    if (!current) return c.json({ error: "Tag 不存在" }, 404);
    const affected = countActivities.get(id).c;
    remove.run(id);
    return c.json({ deleted: { id, name: current.name, activities: affected } });
  });

  /** 前端删除前用来提示影响范围，不产生副作用 */
  routes.get("/:id/impact", (c) => {
    const id = requireInt(Number(c.req.param("id")), "id", { min: 1 });
    const current = selectById.get(id);
    if (!current) return c.json({ error: "Tag 不存在" }, 404);
    return c.json({ id, name: current.name, activities: countActivities.get(id).c });
  });

  return routes;
}
