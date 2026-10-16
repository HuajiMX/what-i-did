import { useEffect, useMemo, useRef, useState } from "react";
import type { TrendPoint } from "../api";
import { bucketLabel } from "../lib/date";

interface Props {
  points: TrendPoint[];
  bucketType: "day" | "week" | "month";
}

/** 画布的最小宽度：只有比这更窄时才横向滚动（移动端），桌面端一律铺满不滚动 */
const MIN_CANVAS = 360;
/** 固定高度：不随容器宽度变化，避免折线被纵向压扁 */
const HEIGHT = 200;
const PAD_TOP = 12;
const PAD_RIGHT = 12;
const PAD_BOTTOM = 24;
const PAD_LEFT = 34;

/**
 * 趋势图。自绘 SVG 而不是引图表库：只需要一条折线 + 面积 + 稀疏的横轴标签，
 * 图表库会带来 200 KB+ 依赖和一整套需要被覆盖的默认样式，而这里 100 行就够。
 * 纵轴从 0 开始（不截断），否则会夸大波动。
 *
 * 尺寸策略（两个方向分开处理）：
 *   高度固定 200px，**不使用** preserveAspectRatio="none"——
 *   那会让宽度与高度各自独立缩放，折线被压扁、圆点变成椭圆（之前就是这个毛病）。
 *
 *   宽度的取值顺序（关键是不要让桌面端出现"放得下却还有滚动条"）：
 *     1. 容器可用宽 ≥ 理想宽（点数 × 28px）→ 用容器宽，铺满、不滚动
 *     2. 容器介于 MIN_CANVAS 与理想宽之间 → 仍用容器宽，把点排紧一点、**不滚动**
 *     3. 容器 < MIN_CANVAS（窄屏）→ 用 MIN_CANVAS，横向滚动
 *   早期版本让"理想宽"直接做下限，于是窄一点的桌面窗口（<1100px）装不下 914px
 *   就冒出一条横向滚动条——内容明明是全的，看着像 bug。
 *
 *   纵轴刻度画在 SVG 左侧、横轴标签与画布同宽，因此滚动时坐标轴保持不动。
 */
export default function TrendChart({ points, bucketType }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);

  /*
   * 量的是**外层 .chart-wrap** 而不是滚动容器自身：
   * 滚动容器一旦出现横向滚动条，它的 clientWidth 就会变小，用它反推画布宽会形成反馈环
   * （画布变宽 → 出滚动条 → 可用宽变小 → 画布变窄 → 滚动条消失 → 循环）。
   * 外层宽度与滚动条无关，稳定。
   */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setAvailable(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { canvasWidth, chart, padding } = useMemo(() => {
    const pad = { top: PAD_TOP, right: PAD_RIGHT, bottom: PAD_BOTTOM, left: PAD_LEFT };
    /*
     * 宽度的取舍：
     *   容器 ≥ MIN_CANVAS → 铺满容器（桌面端不滚动；点密一点也无妨）
     *   容器 < MIN_CANVAS → 用 MIN_CANVAS，横向滚动（手机）
     * 不再按"点数 × 28px"设下限——那会让窄一点的桌面窗口（<1100px）装不下而冒出滚动条，
     * 内容明明是全的，看着像 bug。每点的间距交给宽度自动分配。
     */
    const canvas = Math.max(available > 0 ? available : MIN_CANVAS, MIN_CANVAS);
    const max = Math.max(1, ...points.map((point) => point.count));
    const innerW = canvas - pad.left - pad.right;
    const innerH = HEIGHT - pad.top - pad.bottom;
    const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;

    const coords = points.map((point, index) => ({
      x: pad.left + (points.length > 1 ? index * stepX : innerW / 2),
      y: pad.top + innerH - (point.count / max) * innerH,
      point,
    }));

    const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
    const first = coords[0];
    const last = coords[coords.length - 1];
    const area =
      first && last
        ? `${line} L${last.x.toFixed(1)},${(pad.top + innerH).toFixed(1)} L${first.x.toFixed(1)},${(pad.top + innerH).toFixed(1)} Z`
        : "";

    // 横轴标签最多 8 个，避免密集重叠
    const labelStride = Math.max(1, Math.ceil(points.length / 8));
    const gridValues = [0, 0.5, 1].map((ratio) => ({
      y: pad.top + innerH - ratio * innerH,
      value: Math.round(max * ratio),
    }));

    return { canvasWidth: canvas, chart: { max, coords, line, area, labelStride, gridValues }, padding: pad };
  }, [points, available]);

  if (points.length === 0) {
    return <p className="empty">这个时段没有数据。</p>;
  }

  return (
    <div className="chart-wrap" ref={wrapRef}>
      {/* 只有这块横向滚动；纵轴刻度画在 SVG 内左侧，横轴标签与画布同宽，滚动时都保持不动 */}
      <div className="chart-scroll">
        <svg
          className="chart"
          width={canvasWidth}
          height={HEIGHT}
          viewBox={`0 0 ${canvasWidth} ${HEIGHT}`}
          role="img"
          aria-label={`趋势图，共 ${points.length} 个数据点，最高 ${chart.max}`}
        >
          {chart.gridValues.map((grid) => (
            <g key={grid.y}>
              <line x1={padding.left} x2={canvasWidth - padding.right} y1={grid.y} y2={grid.y} className="chart-grid" />
              <text x={padding.left - 6} y={grid.y + 3} className="chart-axis" textAnchor="end">
                {grid.value}
              </text>
            </g>
          ))}

          {chart.area ? <path d={chart.area} className="chart-area" /> : null}
          {chart.line ? <path d={chart.line} className="chart-line" /> : null}

          {chart.coords.map((coord) =>
            // 点太密时只画数据点里的峰值，避免一片圆点糊住折线
            points.length <= 40 || coord.point.count === chart.max ? (
              <circle key={coord.point.bucket} cx={coord.x} cy={coord.y} r={3} className="chart-dot">
                <title>
                  {coord.point.bucket}：{coord.point.count}
                </title>
              </circle>
            ) : null,
          )}
        </svg>

        {/* 横轴标签与画布等宽并放在同一个滚动容器里，因此与折线的列严格对齐 */}
        <div className="chart-x-labels" style={{ width: canvasWidth, paddingLeft: padding.left, paddingRight: padding.right }}>
          {points.map((point, index) =>
            index % chart.labelStride === 0 ? (
              <span key={point.bucket} className="faint tiny">
                {bucketLabel(point.bucket, bucketType)}
              </span>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}
