/**
 * 后端接口封装。
 * 所有写操作都依赖会话 cookie，因此 credentials 固定为 same-origin，
 * 前端不保存任何 token —— 身份只有一个来源，就是服务端下发的 HttpOnly cookie。
 */

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      // 非 JSON 响应（例如反代返回的 HTML 错误页）：不要伪装成成功
      throw new ApiError(`服务器返回了非预期的响应（HTTP ${response.status}）`, response.status);
    }
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `请求失败（HTTP ${response.status}）`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

export const api = {
  get: <T,>(url: string) => request<T>("GET", url),
  post: <T,>(url: string, body?: unknown) => request<T>("POST", url, body),
  patch: <T,>(url: string, body?: unknown) => request<T>("PATCH", url, body),
  del: <T,>(url: string) => request<T>("DELETE", url),
};

// ── 类型 ────────────────────────────────────────────────────────────────────

export interface Tag {
  id: number;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
}

/** 带使用次数的 Tag（管理界面用） */
export interface TagWithUsage extends Tag {
  usage_count: number;
}

/** 可在后台修改的站点信息。subtitle / description 允许为空。 */
export interface SiteSettings {
  title: string;
  subtitle: string;
  description: string;
}

export interface Activity {
  id: number;
  tag_id: number;
  tag_name: string;
  icon: string;
  color: string;
  logged_at: string;
}

export interface Note {
  id: number;
  date: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface TagStat {
  tag_id: number;
  count: number;
  days: number;
  share: number;
}

export interface Overall {
  total: number;
  activeDays: number;
  rangeDays: number;
  activeRate: number;
}

export interface Streak {
  current: number;
  longest: number;
  lastActive: string | null;
}

export interface TrendPoint {
  bucket: string;
  count: number;
}

// ── 端点 ────────────────────────────────────────────────────────────────────

export const endpoints = {
  me: () => api.get<{ admin: boolean; configured: boolean }>("/api/me"),
  login: (password: string) => api.post<{ admin: boolean }>("/api/auth/login", { password }),
  logout: () => api.post<{ admin: boolean }>("/api/auth/logout"),

  site: () => api.get<{ site: SiteSettings }>("/api/site"),
  updateSite: (input: Partial<SiteSettings>) => api.patch<{ site: SiteSettings }>("/api/site", input),

  tags: () => api.get<{ tags: TagWithUsage[] }>("/api/tags"),
  createTag: (input: { name: string; icon: string; color: string }) => api.post<{ tag: Tag }>("/api/tags", input),
  updateTag: (id: number, input: Partial<Pick<Tag, "name" | "icon" | "color" | "sort_order">>) =>
    api.patch<{ tag: Tag }>(`/api/tags/${id}`, input),
  tagImpact: (id: number) => api.get<{ id: number; name: string; activities: number }>(`/api/tags/${id}/impact`),
  deleteTag: (id: number) => api.del<{ deleted: { id: number; name: string; activities: number } }>(`/api/tags/${id}`),

  /** 区间视图：{ "2026-05-12": { "3": 2 } } */
  activities: (from: string, to: string, tagIds: number[] = []) => {
    const query = new URLSearchParams({ from, to });
    if (tagIds.length) query.set("tag_ids", tagIds.join(","));
    return api.get<{ from: string; to: string; dates: Record<string, Record<string, number>>; total: number }>(
      `/api/activities?${query}`,
    );
  },
  activitiesOfDay: (date: string) => api.get<{ date: string; activities: Activity[] }>(`/api/activities/day?date=${date}`),
  logActivity: (date: string, tagId: number) => api.post<{ activity: { id: number } }>("/api/activities", { date, tag_id: tagId }),
  logActivityBulk: (date: string, tagId: number, times: number) =>
    api.post<{ created: number }>("/api/activities/bulk", { date, tag_id: tagId, times }),
  undoLatest: (date: string, tagId: number) =>
    api.del<{ removed: number }>(`/api/activities/latest?date=${date}&tag_id=${tagId}`),
  deleteActivity: (id: number) => api.del<{ removed: { id: number } }>(`/api/activities/${id}`),

  notesRange: (from: string, to: string) =>
    api.get<{ from: string; to: string; counts: Record<string, number>; total: number }>(
      `/api/notes?from=${from}&to=${to}`,
    ),
  notesOfDay: (date: string) => api.get<{ date: string; notes: Note[] }>(`/api/notes/day?date=${date}`),
  noteYears: () => api.get<{ years: number[] }>("/api/notes/years"),
  createNote: (date: string, content: string) => api.post<{ note: Note }>("/api/notes", { date, content }),
  updateNote: (id: number, content: string) => api.patch<{ note: Note }>(`/api/notes/${id}`, { content }),
  deleteNote: (id: number) => api.del<{ removed: { id: number } }>(`/api/notes/${id}`),

  summary: (from: string, to: string, tagIds: number[] = []) => {
    const query = statsQuery(from, to, tagIds);
    return api.get<{ from: string; to: string; overall: Overall; tags: TagStat[]; streak: Streak }>(
      `/api/stats/summary?${query}`,
    );
  },
  trend: (from: string, to: string, tagIds: number[] = [], bucket: "day" | "week" | "month" = "day") => {
    const query = statsQuery(from, to, tagIds);
    query.set("bucket", bucket);
    return api.get<{ from: string; to: string; bucket: string; points: TrendPoint[] }>(`/api/stats/trend?${query}`);
  },
  distribution: (from: string, to: string, tagIds: number[] = []) => {
    const query = statsQuery(from, to, tagIds);
    return api.get<{ from: string; to: string; total: number; tags: TagStat[] }>(`/api/stats/distribution?${query}`);
  },
};

function statsQuery(from: string, to: string, tagIds: number[]): URLSearchParams {
  const query = new URLSearchParams({ from, to });
  if (tagIds.length) query.set("tag_ids", tagIds.join(","));
  return query;
}
