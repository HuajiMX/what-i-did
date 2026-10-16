import { useEffect, useMemo, useRef, useState } from "react";
import type { TrendPoint } from "../api";
import { bucketLabel } from "../lib/date";

interface Props {
  points: TrendPoint[];
  bucketType: "day" | "week" | "month";
}

/** 逻辑坐标系的基准宽度（容器更宽时再撑满） */
const WIDTH = 720;
/** 固定高度：不随容器宽度变化，避免折线被纵向压扁 */
const HEIGHT = 200;
const PAD_TOP = 12;
const PAD_RIGHT = 12;
const PAD_BOTTOM = 24;
const PAD_LEFT = 34;
/** 每个数据点至少占这么多像素：点多了就让画布变宽、横向滚动，而不是把点挤在一起 */
const MIN_POINT_PITCH = 28;

/**
 * 趋势图。自绘 SVG 而不是引图表库：只需要一条折线 + 面积 + 稀疏的横轴标签，
 * 图表库会带来 200 KB+ 依赖和一整套需要被覆盖的默认样式，而这里 100 行就够。
 * 纵轴从 0 开始（不截断），否则会夸大波动。
 *
 * 尺寸策略（两个方向分开处理）：
 *   高度固定 200px，**不使用** preserveAspectRatio="none"——
 *   那会让宽度与高度各自独立缩放，折线被压扁、圆点变成椭圆（之前就是这个毛病）。
 *   宽度取 max(容器可用宽, 数据点所需宽)：容器更宽就铺满，放不下就由
 *   .chart-scroll 横向滚动。纵轴刻度画在 SVG 左侧、横轴标签与画布同宽，
 *   因此滚动时坐标轴保持不动。
 */
export default function TrendChart({ points, bucketType }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);

  // 量出滚动容器的可用宽度：撑满它就能避免"放得下却留白"
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setAvailable(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { canvasWidth, chart, padding } = useMemo(() => {
    const pad = { top: PAD_TOP, right: PAD_RIGHT, bottom: PAD_BOTTOM, left: PAD_LEFT };
    // 数据点越多画布越宽；容器更宽时铺满容器
    const needed = Math.max(WIDTH, points.length * MIN_POINT_PITCH + pad.left + pad.right);
    const canvas = Math.max(needed, available);
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
    <div className="chart-wrap">
      {/* 只有这块横向滚动；纵轴刻度画在 SVG 内左侧，横轴标签与画布同宽，滚动时都保持不动 */}
      <div className="chart-scroll" ref={scrollRef}>
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
