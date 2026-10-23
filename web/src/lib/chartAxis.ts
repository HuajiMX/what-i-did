/**
 * 趋势图纵轴刻度。
 *
 * 之前直接取 max 的 0 / 50% / 100% 三个位置，再把刻度值四舍五入：
 * max=3 时得到 0 / 1.5 / 3，标签却写成 0 / 2 / 3——"2" 被画在 1.5 的高度上，
 * 看起来就是纵坐标不对。这里改成先生成等距的"好读"刻度，再按刻度值定位。
 *
 * 统计的是次数，刻度值必须是整数；数据量再大也不截断纵轴（从 0 开始）。
 */
export interface ChartAxis {
  /** 刻度间隔（整数） */
  step: number;
  /** 纵轴顶端值，>= 数据最大值；用于把数据映射到像素高度 */
  max: number;
  /** 从 0 到 max 的刻度值，等距且都是整数 */
  values: number[];
}

/**
 * @param dataMax 数据里的最大次数（0 会按 1 处理，避免除以 0）
 * @param targetTicks 期望的刻度数量级；实际刻度数不超过 targetTicks + 1
 */
export function niceChartAxis(dataMax: number, targetTicks = 5): ChartAxis {
  const max = Math.max(1, Math.ceil(dataMax));
  const rough = max / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;

  // 次数只能是整数：1 / 2 / 5 / 10 的放大序列之外，最小间隔也取 1
  const step = Math.max(1, nice * magnitude);
  const axisMax = Math.ceil(max / step) * step;

  const values: number[] = [];
  for (let value = 0; value <= axisMax; value += step) values.push(value);

  return { step, max: axisMax, values };
}
