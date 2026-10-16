import type { Tag } from "../api";

interface Slice {
  tag: Tag;
  count: number;
  share: number;
}

interface Props {
  slices: Slice[];
  total: number;
}

/**
 * 环形图。用 stroke-dasharray 在圆上画弧：不需要三角函数，
 * 且每段的颜色可以直接沿用 Tag 的调色板。
 */
export default function DonutChart({ slices, total }: Props) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  if (slices.length === 0 || total === 0) {
    return <p className="empty">这个时段没有数据。</p>;
  }

  return (
    <div className="donut">
      <svg viewBox="0 0 140 140" className="donut-svg" role="img" aria-label={`Tag 分布，共 ${slices.length} 个 Tag`}>
        <circle cx="70" cy="70" r={radius} className="donut-track" />
        {slices.map((slice) => {
          const length = slice.share * circumference;
          const dash = `${length} ${circumference - length}`;
          const element = (
            <circle
              key={slice.tag.id}
              cx="70"
              cy="70"
              r={radius}
              className="donut-slice"
              stroke={slice.tag.color}
              strokeDasharray={dash}
              strokeDashoffset={-offset}
            >
              <title>
                {slice.tag.name}：{slice.count} 次（{Math.round(slice.share * 100)}%）
              </title>
            </circle>
          );
          offset += length;
          return element;
        })}
        <text x="70" y="66" className="donut-total num" textAnchor="middle">
          {total}
        </text>
        <text x="70" y="84" className="donut-caption" textAnchor="middle">
          次
        </text>
      </svg>

      <ul className="donut-legend">
        {slices.map((slice) => (
          <li key={slice.tag.id} className="donut-legend-item">
            <span className="legend-dot" style={{ background: slice.tag.color }} />
            <span className="grow legend-name">{slice.tag.name}</span>
            <span className="num faint">
              {slice.count} · {Math.round(slice.share * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
