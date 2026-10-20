/**
 * "当天活动"面板要列哪些 Tag。
 *
 * 抽成纯函数是为了能用单测锁住"访客只看到有记录的 Tag"这条规则，
 * 而不是靠在页面上点一天点一天地目测。管理员要能记录任意 Tag，
 * 所以这里按身份分叉，两种视角的取舍在下面写清楚了。
 */
export interface DayPanelTag<T> {
  tag: T;
  /** 这一天该 Tag 的记录次数 */
  count: number;
}

/**
 * @param tags 全部 Tag（已按 sort_order 排好）
 * @param counts tag id → 当天次数
 * @param admin 是否管理员
 *
 * - 访客（公开只读）：只列出当天有记录的 Tag，按次数降序。没记录的不展示——
 *   对方没有任何交互，一整列 0 只会稀释真正的信息。
 * - 管理员：列出全部 Tag，**有记录的在前**（按次数降序），没记录的按 sort_order 跟在后面。
 *   如果只留有记录的，管理员就永远无法记录新 Tag，这个页面也就废了。
 */
export function dayPanelTags<T extends { id: number }>(
  tags: T[],
  counts: Map<number, number>,
  admin: boolean,
): DayPanelTag<T>[] {
  const withCount = tags.map((tag) => ({ tag, count: counts.get(tag.id) ?? 0 }));

  if (!admin) {
    return withCount
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count || a.tag.id - b.tag.id);
  }

  return withCount.sort((a, b) => {
    const aHas = a.count > 0;
    const bHas = b.count > 0;
    if (aHas !== bHas) return aHas ? -1 : 1;
    return b.count - a.count || a.tag.id - b.tag.id;
  });
}
