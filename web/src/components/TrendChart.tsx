import { useCallback, useMemo, useRef, useState } from "react";
import type { TrendPoint } from "../api";
import { bucketLabel } from "../lib/date";

interface Props {
  points: TrendPoint[];
  bucketType: "day" | "week" | "month";
}

/** 固定高度：不随容器宽度变化，避免折线被纵向压扁 */
const HEIGHT = 200;
const PAD_TOP = 12;
const PAD_RIGHT = 12;
const PAD_BOTTOM = 24;
const PAD_LEFT = 34;
/** 窄屏（手机）画布的最小宽度，小于它就横向滚动 */
const MIN_CANVAS = 360;
/** 判断"窄屏"的断点，与全站移动端断点保持一致 */
const MOBILE_QUERY = "(max-width: 899px)";

/**
 * 趋势图。自绘 SVG 而不是引图表库：只需要一条折线 + 面积 + 稀疏的横轴标签，
 * 图表库会带来 200 KB+ 依赖和一整套需要被覆盖的默认样式，而这里 150 行就够。
 * 纵轴从 0 开始（不截断），否则会夸大波动。
 *
 * 尺寸策略（两个方向分开处理）：
 *   高度固定 200px，且**宽度与高度都交给 CSS**（width:100% + height:200px），
 *   绝不使用 preserveAspectRatio="none"——那会让两个方向独立缩放，
 *   折线被压扁、圆点变成椭圆。
 *
 *   关键点：SVG 的 viewBox 必须与实际渲染的宽高比一致，否则 preserveAspectRatio
 *   会把内容等比缩到中间（看起来"图变窄了、两侧留白"），而且横轴标签的百分比
 *   坐标也会与数据点对不上。所以这里用 ResizeObserver 量出实际渲染宽度，
 *   再把 viewBox 设成 viewBoxW × 200，使 1 个 viewBox 单位 = 1 设备像素（CSS px）。
 *
 *   宽度本身不再由 JS 计算：放得下就跟随容器，窄屏由 SVG 的 min-width 撑开并横向滚动。
 *   早期版本给 SVG 设 width="{容器宽}px"，"画布宽"与"容器宽"成了两个独立数字，
 *   差 0.5px 就冒出一条横向滚动条，内容看着却是全的——难复现且像 bug。
 */
export default function TrendChart({ points, bucketType }: Props) {
  const [viewWidth, setViewWidth] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  // 观察 SVG 自身的渲染宽度：它由 CSS 决定（跟随容器，或在窄屏被 min-width 撑开）
  const measureRef = useCallback((node: SVGSVGElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    setViewWidth(node.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > 0) setViewWidth(width);
    });
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  const isMobile = typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches;

  const chart = useMemo(() => {
    // 首次渲染还没有量到宽度时给一个等价于桌面常见宽度的占位值，避免出现 0 宽度
    const unit = viewWidth > 0 ? viewWidth : 720;
    const innerW = Math.max(1, unit - PAD_LEFT - PAD_RIGHT);
    const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const max = Math.max(1, ...points.map((point) => point.count));
    const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;

    const coords = points.map((point, index) => ({
      x: PAD_LEFT + (points.length > 1 ? index * stepX : innerW / 2),
      y: PAD_TOP + innerH - (point.count / max) * innerH,
      point,
    }));

    const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
    const first = coords[0];
    const last = coords[coords.length - 1];
    const bottom = PAD_TOP + innerH;
    const area =
      first && last ? `${line} L${last.x.toFixed(1)},${bottom} L${first.x.toFixed(1)},${bottom} Z` : "";

    const labelStride = Math.max(1, Math.ceil(points.length / 8));
    const gridValues = [0, 0.5, 1].map((ratio) => ({
      y: PAD_TOP + innerH - ratio * innerH,
      value: Math.round(max * ratio),
    }));

    /*
     * 数据点在**整块画布**里的比例位置（0~1），标签直接用它定位。
     * 注意分母是 unit 而不是绘图区宽 innerW，并且标签容器不能设左右 padding：
     * 百分比 left 的解析基准与 padding 的相互作用很绕（实测 left:0% 会落在 padding 之外，
     * 导致标签整体偏移一个 PAD_LEFT）。用同一个坐标系算绝对位置最不容易出错。
     */
    const labelRatios = coords.map((c) => c.x / unit);

    return { unit, coords, line, area, labelStride, gridValues, max, labelRatios };
  }, [points, viewWidth]);

  if (points.length === 0) {
    return <p className="empty">这个时段没有数据。</p>;
  }

  return (
    <div className="chart-wrap">
      {/* 只有这块横向滚动；纵轴刻度在 SVG 内左侧、横轴标签用同一套比例，滚动时都保持不动 */}
      <div className="chart-scroll">
        <svg
          ref={measureRef}
          className="chart"
          /* min-width 必须设在 SVG 自己身上：设在滚动容器上不会让子元素超出，
             SVG 仍会被 width:100% 压到容器宽度（踩过） */
          style={isMobile ? { minWidth: MIN_CANVAS } : undefined}
          viewBox={`0 0 ${chart.unit} ${HEIGHT}`}
          role="img"
          aria-label={`趋势图，共 ${points.length} 个数据点，最高 ${chart.max}`}
        >
          {chart.gridValues.map((grid) => (
            <g key={grid.y}>
              <line x1={PAD_LEFT} x2={chart.unit - PAD_RIGHT} y1={grid.y} y2={grid.y} className="chart-grid" />
              <text x={PAD_LEFT - 6} y={grid.y + 3} className="chart-axis" textAnchor="end">
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

        {/*
          横轴标签用与数据点相同的比例定位。
          必须显式给出与 SVG 相同的宽度：它是块级元素，默认会撑满滚动容器，
          而百分比 left 是针对自身宽度计算的——滚动容器比 SVG 宽时（窄屏固定宽度模式），
          标签会被按容器宽度铺开、整体偏移一个 PAD_LEFT（实测偏差正好 34px）。
        */}
        <div
          className="chart-x-labels"
          aria-hidden="true"
          style={viewWidth > 0 ? { width: viewWidth } : undefined}
        >
          {points.map((point, index) =>
            index % chart.labelStride === 0 ? (
              <span key={point.bucket} className="faint tiny" style={{ left: `${chart.labelRatios[index]! * 100}%` }}>
                {bucketLabel(point.bucket, bucketType)}
              </span>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}
