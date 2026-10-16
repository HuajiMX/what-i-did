import { useMemo } from "react";
import type { TrendPoint } from "../api";
import { bucketLabel } from "../lib/date";

interface Props {
  points: TrendPoint[];
  bucketType: "day" | "week" | "month";
}

const WIDTH = 720;
const HEIGHT = 200;
const PAD_TOP = 12;
const PAD_RIGHT = 12;
const PAD_BOTTOM = 24;
const PAD_LEFT = 34;

/**
 * 趋势图。自绘 SVG 而不是引图表库：只需要一条折线 + 面积 + 稀疏的横轴标签，
 * 图表库会带来 200 KB+ 依赖和一整套需要被覆盖的默认样式，而这里 100 行就够。
 * 纵轴从 0 开始（不截断），否则会夸大波动。
 */
export default function TrendChart({ points, bucketType }: Props) {
  const width = WIDTH;
  const height = HEIGHT;
  const padding = { top: PAD_TOP, right: PAD_RIGHT, bottom: PAD_BOTTOM, left: PAD_LEFT };

  const chart = useMemo(() => {
    const max = Math.max(1, ...points.map((point) => point.count));
    const innerW = width - padding.left - padding.right;
    const innerH = height - padding.top - padding.bottom;
    const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;

    const coords = points.map((point, index) => ({
      x: padding.left + (points.length > 1 ? index * stepX : innerW / 2),
      y: padding.top + innerH - (point.count / max) * innerH,
      point,
    }));

    const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
    const first = coords[0];
    const last = coords[coords.length - 1];
    const area =
      first && last
        ? `${line} L${last.x.toFixed(1)},${(padding.top + innerH).toFixed(1)} L${first.x.toFixed(1)},${(padding.top + innerH).toFixed(1)} Z`
        : "";

    // 横轴标签最多 8 个，避免密集重叠
    const labelStride = Math.max(1, Math.ceil(points.length / 8));
    const gridValues = [0, 0.5, 1].map((ratio) => ({
      y: padding.top + innerH - ratio * innerH,
      value: Math.round(max * ratio),
    }));

    return { max, coords, line, area, labelStride, gridValues, innerH };
  }, [points]);

  if (points.length === 0) {
    return <p className="empty">这个时段没有数据。</p>;
  }

  return (
    <div className="chart-wrap">
      <svg
        className="chart"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`趋势图，共 ${points.length} 个数据点，最高 ${chart.max}`}
      >
        {chart.gridValues.map((grid) => (
          <g key={grid.y}>
            <line x1={padding.left} x2={width - padding.right} y1={grid.y} y2={grid.y} className="chart-grid" />
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

      <div className="chart-x-labels">
        {points.map((point, index) =>
          index % chart.labelStride === 0 ? (
            <span key={point.bucket} className="faint tiny">
              {bucketLabel(point.bucket, bucketType)}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}
