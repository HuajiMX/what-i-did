import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { endpoints, type Tag } from "../api";
import DayPanel from "../components/DayPanel";
import { Icon } from "../icons/Icon";
import { useAsync } from "../lib/useAsync";
import { addMonths, monthGrid, monthLabel, today } from "../lib/date";

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

/** 格子里最多预览几个 Tag：再多会挤，多余的用 +n 表示 */
const MAX_PREVIEW = 3;

export default function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const month = params.get("month") ?? `${today().slice(0, 7)}-01`;
  const selectedDate = params.get("date") ?? today();

  const selectedTags = useMemo(() => {
    const raw = params.get("tags");
    if (!raw) return [] as number[];
    return raw
      .split(",")
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isInteger(value) && value > 0);
  }, [params]);

  const cells = useMemo(() => monthGrid(month), [month]);
  const range = { from: cells[0]!.date, to: cells[cells.length - 1]!.date };

  const activities = useAsync(
    () => endpoints.activities(range.from, range.to, selectedTags),
    [range.from, range.to, selectedTags.join(",")],
  );
  const tags = useAsync(() => endpoints.tags(), []);

  function updateParams(next: Record<string, string | null>) {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value === null) merged.delete(key);
      else merged.set(key, value);
    }
    setParams(merged, { replace: true });
  }

  function toggleTag(id: number) {
    const next = selectedTags.includes(id) ? selectedTags.filter((x) => x !== id) : [...selectedTags, id];
    updateParams({ tags: next.length ? next.join(",") : null });
  }

  /** 点日期：选中它，并把它所在的月份也切过去，避免"点了看别的月"的困惑 */
  function selectDate(date: string) {
    updateParams({ date, month: `${date.slice(0, 7)}-01` });
  }

  const byDate = activities.data?.dates ?? {};
  const tagList: Tag[] = tags.data?.tags ?? [];
  const tagById = new Map(tagList.map((tag) => [tag.id, tag]));
  const todayValue = today();

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">{monthLabel(month)}</h1>
          <p className="page-sub">
            共 <span className="num">{activities.data?.total ?? 0}</span> 次活动
            {selectedTags.length ? `（已筛选 ${selectedTags.length} 个 Tag）` : ""}
          </p>
        </div>
        <div className="row">
          <button
            type="button"
            className="btn btn-sm btn-icon"
            onClick={() => updateParams({ month: addMonths(month, -1) })}
            aria-label="上个月"
          >
            ‹
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => updateParams({ month: `${todayValue.slice(0, 7)}-01`, date: todayValue })}
          >
            今天
          </button>
          <button
            type="button"
            className="btn btn-sm btn-icon"
            onClick={() => updateParams({ month: addMonths(month, 1) })}
            aria-label="下个月"
          >
            ›
          </button>
        </div>
      </div>

      {tagList.length > 0 ? (
        <div className="row-wrap" role="group" aria-label="按 Tag 筛选">
          <span className="faint tiny filter-label">筛选</span>
          {tagList.map((tag) => {
            const active = selectedTags.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                className={`chip ${active ? "chip-active" : ""}`}
                style={active ? { background: tag.color, borderColor: tag.color } : undefined}
                aria-pressed={active}
                onClick={() => toggleTag(tag.id)}
              >
                <Icon name={tag.icon} size={15} />
                {tag.name}
              </button>
            );
          })}
          {selectedTags.length ? (
            <button type="button" className="chip" onClick={() => updateParams({ tags: null })}>
              清除
            </button>
          ) : null}
        </div>
      ) : null}

      {activities.error ? <div className="alert alert-danger">{activities.error}</div> : null}

      <div className={`card card-flush calendar bleed ${activities.loading ? "is-loading" : ""}`}>
        <div className="calendar-head">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label} className="calendar-weekday">
              {label}
            </span>
          ))}
        </div>
        <div className="calendar-grid">
          {cells.map((cell) => {
            const perTag = byDate[cell.date] ?? {};
            const entries = Object.entries(perTag)
              .map(([tagId, count]) => ({ tag: tagById.get(Number(tagId)), count }))
              .filter((entry): entry is { tag: Tag; count: number } => Boolean(entry.tag))
              .sort((a, b) => b.count - a.count || a.tag.sort_order - b.tag.sort_order);
            const total = entries.reduce((sum, entry) => sum + entry.count, 0);
            const hasSelection = cell.date === selectedDate;
            return (
              <button
                key={cell.date}
                type="button"
                className={[
                  "day-cell",
                  cell.inMonth ? "" : "day-cell-outside",
                  cell.isToday ? "day-cell-today" : "",
                  total > 0 ? "day-cell-has" : "",
                  hasSelection ? "day-cell-selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => selectDate(cell.date)}
                aria-label={`${cell.date}，${total} 次活动`}
                aria-current={hasSelection ? "date" : undefined}
              >
                <span className="day-number num">{cell.day}</span>

                {total > 0 ? (
                  <span className="day-preview">
                    {entries.slice(0, MAX_PREVIEW).map((entry) => (
                      <span key={entry.tag.id} className="day-preview-item" style={{ color: entry.tag.color }}>
                        <Icon name={entry.tag.icon} size={14} stroke={2} />
                        {/* 只记了 1 次就不写数字，避免整屏都是 1 */}
                        {entry.count > 1 ? <span className="day-preview-count num">{entry.count}</span> : null}
                      </span>
                    ))}
                    {entries.length > MAX_PREVIEW ? (
                      <span className="day-preview-more num">+{entries.length - MAX_PREVIEW}</span>
                    ) : null}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <DayPanel
        date={selectedDate}
        tags={tagList}
        onChanged={() => {
          activities.reload();
          tags.reload();
        }}
      />
    </div>
  );
}
