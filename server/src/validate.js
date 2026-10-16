/**
 * 入参校验。刻意不引 zod：这里的规则只有"是日期吗/字符串多长/整数范围/颜色在调色板里吗"，
 * 一个 40 行的模块就够，且错误信息可以直接面向用户。
 */

import { isDateString } from "./dates.js";

/** Tag 配色调色板。限定取值而非任意 hex：保证任意组合下文字与图表仍可读。 */
export const TAG_COLORS = [
  "#e5484d", // 红
  "#f76b15", // 橙
  "#f5a524", // 黄
  "#30a46c", // 绿
  "#12a594", // 青
  "#0091ff", // 蓝
  "#6e56cf", // 紫
  "#e93d82", // 玫红
];

export const MAX_TAG_NAME = 24;
export const MAX_NOTE_LENGTH = 5000;

export class ValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "ValidationError";
    this.status = status;
  }
}

export function requireDate(value, field = "date") {
  if (!isDateString(value)) throw new ValidationError(`${field} 必须是 YYYY-MM-DD 格式的合法日期`);
  return value;
}

export function requireString(value, field, { min = 1, max = 200 } = {}) {
  if (typeof value !== "string") throw new ValidationError(`${field} 必须是字符串`);
  const trimmed = value.trim();
  if (trimmed.length < min) throw new ValidationError(`${field} 不能为空`);
  if (trimmed.length > max) throw new ValidationError(`${field} 长度不能超过 ${max} 个字符`);
  return trimmed;
}

export function requireInt(value, field, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ValidationError(`${field} 必须是整数`);
  }
  if (value < min || value > max) throw new ValidationError(`${field} 必须在 ${min}~${max} 之间`);
  return value;
}

export function requireColor(value) {
  if (typeof value !== "string" || !TAG_COLORS.includes(value)) {
    throw new ValidationError(`color 必须是调色板中的颜色之一：${TAG_COLORS.join(", ")}`);
  }
  return value;
}

/** 图标名：必须存在于 Tabler 图标全集中（白名单由构建期生成的清单提供） */
export function requireIconName(value, iconNames) {
  if (typeof value !== "string") throw new ValidationError("icon 必须是字符串");
  const name = value.trim();
  if (!iconNames.has(name)) throw new ValidationError(`icon "${name}" 不在图标库中`);
  return name;
}

/** 可选的整型入参（用于 tag_ids 之类的筛选） */
export function parseIdList(value) {
  if (value === undefined || value === null || value === "") return null;
  const raw = Array.isArray(value) ? value : String(value).split(",");
  const ids = [];
  for (const item of raw) {
    const n = Number.parseInt(String(item).trim(), 10);
    if (!Number.isInteger(n) || n <= 0) throw new ValidationError("tag_ids 必须是正整数列表");
    ids.push(n);
  }
  return ids.length ? [...new Set(ids)] : null;
}

/** 请求体必须是对象 */
export function requireBody(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("请求体必须是 JSON 对象");
  }
  return body;
}
