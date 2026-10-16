/**
 * 日历格子里 Tag 预览的取舍规则。
 *
 * 单独抽出来是因为这段规则有明确的边界情况（正好多 1 个 / 多 2 个以上），
 * 值得用单元测试锁住；写在组件里就只能靠肉眼在日历上找样本。
 */
export interface PreviewSlot<T> {
  /** 要显示的 Tag 条目（按原顺序） */
  visible: T[];
  /**
   * 未显示的条目数，恒等于「总数 − visible.length」。
   * 注意：为 1 时**不要**渲染「+1」——那种情况已改为把第 5 个直接显示出来，
   * 因此调用方只在 hidden > 1 时画省略标记。见 pickPreviewSlots 的规则说明。
   */
  hidden: number;
}

/**
 * 决定格子里显示哪些 Tag。
 *
 * 规则：
 *  - 正好多出 1 个时，直接把它显示出来，不写「+1」——显示真实 Tag 比一个数字有信息量
 *  - 多出 2 个以上才省略成「+n」，此时 n 个位置里要留 1 格给这个标记
 *
 * @param entries 当天的 Tag 条目（已按次数降序）
 * @param maxSlots 格子里最多放几个（移动端两列两行 = 4，桌面端一行更长）
 */
export function pickPreviewSlots<T>(entries: T[], maxSlots: number): PreviewSlot<T> {
  // 不截断就放得下，全部显示
  if (entries.length <= maxSlots) return { visible: entries, hidden: 0 };

  // 只多 1 个：按满额显示，把它算进去（调用方看到 hidden===1 时不会画「+1」）
  if (entries.length <= maxSlots + 1) {
    const visible = entries.slice(0, maxSlots);
    return { visible, hidden: entries.length - visible.length };
  }

  // 多 2 个以上：省略，并留一格给「+n」。
  // 用 Math.max(1, …) 兜底：maxSlots 为 1 时 maxSlots-1 = 0 会把格子显示成空的。
  const visible = entries.slice(0, Math.max(1, maxSlots - 1));
  return { visible, hidden: entries.length - visible.length };
}
