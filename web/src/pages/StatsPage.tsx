import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { endpoints, type Tag, type TagStat } from "../api";
import DonutChart from "../components/DonutChart";
import TrendChart from "../components/TrendChart";
import { Icon } from "../icons/Icon";
import { useAsync } from "../lib/useAsync";
import { daysBetween, presetRange, today, type RangePreset } from "../lib/date";

export default function StatsPage() {
  const [params, setParams] = useSearchParams();
  const preset = (params.get("preset") as RangePreset | null) ?? "month";
  const anchor = params.get("month") ?? today();
  const customFrom = params.get("from");
  const customTo = params.get("to");
  const selectedTags = useMemo(() => {
    const raw = params.get("tags");
    if (!raw) return [] as number[];
    return raw
      .split(",")
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isInteger(value) && value > 0);
  }, [params]);

  const range = useMemo(() => {
    if (preset === "custom" && customFrom && customTo && customFrom <= customTo) {
      return { from: customFrom, to: customTo };
    }
    return presetRange(preset === "year" ? "year" : "month", anchor);
  }, [preset, anchor, customFrom, customTo]);

  const tags = useAsync(() => endpoints.tags(), []);
  const summary = useAsync(() => endpoints.summary(range.from, range.to, selectedTags), [range.from, range.to, selectedTags.join(",")]);

  const spanDays = daysBetween(range.from, range.to) + 1;
  // 区间越长，分桶越粗，否则折线图会有上千个点
  const bucketType: "day" | "week" | "month" = spanDays <= 62 ? "day" : spanDays <= 400 ? "week" : "month";

  const trend = useAsync(
    () => endpoints.trend(range.from, range.to, selectedTags, bucketType),
    [range.from, range.to, selectedTags.join(","), bucketType],
  );

  function updateParams(next: Record<string, string | null>) {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value === null) merged.delete(key);
      else merged.set(key, value);
    }
    setParams(merged, { replace: true });
  }

  function switchPreset(next: RangePreset) {
    if (next === "custom") {
      updateParams({ preset: "custom", from: range.from, to: range.to });
      return;
    }
    updateParams({ preset: next, month: today() });
  }

  const tagList: Tag[] = tags.data?.tags ?? [];
  const tagById = new Map(tagList.map((tag) => [tag.id, tag]));
  const overall = summary.data?.overall;
  const streak = summary.data?.streak;
  const stats: TagStat[] = summary.data?.tags ?? [];
  const topTag = stats.find((stat) => stat.count > 0);

  const slices = stats
    .filter((stat) => stat.count > 0)
    .map((stat) => ({ tag: tagById.get(stat.tag_id)!, count: stat.count, share: stat.share }))
    .filter((slice) => slice.tag);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">统计</h1>
          <p className="page-sub">
            {range.from} ～ {range.to} · 共 {spanDays} 天
          </p>
        </div>
      </div>

      <div className="stack-sm">
        <div className="row-wrap" role="group" aria-label="时段">
          {(
            [
              ["month", "本月"],
              ["year", "今年"],
              ["custom", "自定义"],
            ] as [RangePreset, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`chip ${preset === value ? "chip-active" : ""}`}
              style={preset === value ? { background: "var(--accent)", borderColor: "var(--accent)" } : undefined}
              aria-pressed={preset === value}
              onClick={() => switchPreset(value)}
            >
              {label}
            </button>
          ))}
          {preset !== "custom" ? (
            <span className="row">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  updateParams({ month: preset === "year" ? shiftYear(anchor, -1) : shiftMonth(anchor, -1) })
                }
                aria-label="上一个时段"
              >
                ‹
              </button>
              <span className="tiny muted num">
                {preset === "year" ? anchor.slice(0, 4) : anchor.slice(0, 7)}
              </span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  updateParams({ month: preset === "year" ? shiftYear(anchor, 1) : shiftMonth(anchor, 1) })
                }
                aria-label="下一个时段"
              >
                ›
              </button>
            </span>
          ) : (
            <span className="row-wrap">
              <input
                className="input date-input"
                type="date"
                value={range.from}
                max={range.to}
                onChange={(event) => updateParams({ from: event.target.value })}
                aria-label="起始日期"
              />
              <span className="faint">～</span>
              <input
                className="input date-input"
                type="date"
                value={range.to}
                min={range.from}
                onChange={(event) => updateParams({ to: event.target.value })}
                aria-label="结束日期"
              />
            </span>
          )}
        </div>

        {tagList.length > 0 ? (
          <div className="row-wrap" role="group" aria-label="按 Tag 筛选">
            {tagList.map((tag) => {
              const active = selectedTags.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  className={`chip ${active ? "chip-active" : ""}`}
                  style={active ? { background: tag.color, borderColor: tag.color } : undefined}
                  aria-pressed={active}
                  onClick={() =>
                    updateParams({
                      tags: toggle(selectedTags, tag.id).join(",") || null,
                    })
                  }
                >
                  <Icon name={tag.icon} size={15} />
                  {tag.name}
                </button>
              );
            })}
            {selectedTags.length ? (
              <button type="button" className="chip" onClick={() => updateParams({ tags: null })}>
                清除筛选
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {summary.error ? <div className="alert alert-danger">{summary.error}</div> : null}

      <div className="stat-grid">
        <StatCard label="活动总次数" value={overall?.total ?? 0} hint={`${spanDays} 天区间`} />
        <StatCard
          label="活跃天数"
          value={overall?.activeDays ?? 0}
          hint={overall ? `活跃率 ${Math.round(overall.activeRate * 100)}%` : ""}
        />
        <StatCard
          label="当前连续"
          value={streak?.current ?? 0}
          unit="天"
          hint={streak?.longest ? `最长 ${streak.longest} 天` : ""}
        />
        <StatCard
          label="最活跃 Tag"
          value={topTag ? topTag.count : 0}
          hint={topTag && tagById.get(topTag.tag_id) ? tagById.get(topTag.tag_id)!.name : "暂无数据"}
          icon={topTag && tagById.get(topTag.tag_id) ? tagById.get(topTag.tag_id)!.icon : undefined}
        />
      </div>

      <section className="card stack">
        <div className="row-between">
          <h2>趋势</h2>
          <span className="faint tiny">按{bucketType === "day" ? "天" : bucketType === "week" ? "周" : "月"}</span>
        </div>
        {trend.loading ? <div className="empty">加载中…</div> : null}
        {trend.data ? <TrendChart points={trend.data.points} bucketType={bucketType} /> : null}
      </section>

      <section className="card stack">
        <h2>Tag 分布</h2>
        {summary.loading ? <div className="empty">加载中…</div> : null}
        {summary.data ? <DonutChart slices={slices} total={summary.data.overall.total} /> : null}
      </section>

      <section className="card stack">
        <h2>Tag 明细</h2>
        {stats.length === 0 ? (
          <p className="empty">还没有 Tag。</p>
        ) : (
          <table className="stat-table">
            <thead>
              <tr>
                <th scope="col">Tag</th>
                <th scope="col" className="right">次数</th>
                <th scope="col" className="right">天数</th>
                <th scope="col" className="right">占比</th>
                <th scope="col" className="bar-col">分布</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((stat) => {
                const tag = tagById.get(stat.tag_id);
                if (!tag) return null;
                return (
                  <tr key={stat.tag_id}>
                    <th scope="row">
                      <span className="row">
                        <span className="tag-icon-sm" style={{ color: tag.color, background: `${tag.color}1a` }}>
                          <Icon name={tag.icon} size={15} />
                        </span>
                        {tag.name}
                      </span>
                    </th>
                    <td className="right num">{stat.count}</td>
                    <td className="right num">{stat.days}</td>
                    <td className="right num">{Math.round(stat.share * 100)}%</td>
                    <td className="bar-col">
                      <span className="bar">
                        <span className="bar-fill" style={{ width: `${Math.max(stat.share * 100, stat.count > 0 ? 2 : 0)}%`, background: tag.color }} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="card stack">
        <h2>最近的活动日期</h2>
        {summary.data?.streak.lastActive ? (
          <p className="muted">
            最后一次记录：<span className="num">{summary.data.streak.lastActive}</span>
            {streak && streak.current > 0 ? ` · 已连续 ${streak.current} 天` : " · 连续记录已中断"}
          </p>
        ) : (
          <p className="empty">这个区间还没有记录。</p>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, unit, hint, icon }: { label: string; value: number; unit?: string; hint?: string; icon?: string }) {
  return (
    <div className="card stat-card">
      <span className="faint tiny">{label}</span>
      <span className="stat-value">
        {icon ? <Icon name={icon} size={18} /> : null}
        <span className="num">{value}</span>
        {unit ? <span className="stat-unit">{unit}</span> : null}
      </span>
      {hint ? <span className="faint tiny">{hint}</span> : null}
    </div>
  );
}

function toggle(list: number[], value: number): number[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function shiftMonth(anchor: string, delta: number): string {
  const [y, m, d] = anchor.split("-").map(Number);
  const target = m! - 1 + delta;
  const year = y! + Math.floor(target / 12);
  const month = ((target % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(Math.min(d!, lastDay)).padStart(2, "0")}`;
}

function shiftYear(anchor: string, delta: number): string {
  const [y, m, d] = anchor.split("-").map(Number);
  const year = y! + delta;
  const lastDay = new Date(Date.UTC(year, m!, 0)).getUTCDate();
  return `${year}-${String(m).padStart(2, "0")}-${String(Math.min(d!, lastDay)).padStart(2, "0")}`;
}
