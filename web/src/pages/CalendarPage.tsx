import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError, endpoints, type Tag } from "../api";
import Sheet from "../components/Sheet";
import { Icon } from "../icons/Icon";
import { useAsync } from "../lib/useAsync";
import { addMonths, humanDate, monthGrid, monthLabel, today } from "../lib/date";
import { useAuth } from "../state/auth";
import { useToast } from "../state/toast";

export default function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const month = params.get("month") ?? today().slice(0, 7) + "-01";
  const selectedTags = useMemo(() => {
    const raw = params.get("tags");
    if (!raw) return [] as number[];
    return raw
      .split(",")
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isInteger(value) && value > 0);
  }, [params]);

  const [openDate, setOpenDate] = useState<string | null>(null);

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

  const byDate = activities.data?.dates ?? {};
  const tagList: Tag[] = tags.data?.tags ?? [];
  const tagById = new Map(tagList.map((tag) => [tag.id, tag]));

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
          <button type="button" className="btn btn-sm" onClick={() => updateParams({ month: addMonths(month, -1) })} aria-label="上个月">
            ‹
          </button>
          <button type="button" className="btn btn-sm" onClick={() => updateParams({ month: today().slice(0, 7) + "-01" })}>
            今天
          </button>
          <button type="button" className="btn btn-sm" onClick={() => updateParams({ month: addMonths(month, 1) })} aria-label="下个月">
            ›
          </button>
        </div>
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
                onClick={() => toggleTag(tag.id)}
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

      {activities.error ? <div className="alert alert-danger">{activities.error}</div> : null}

      <div className={`card calendar ${activities.loading ? "is-loading" : ""}`}>
        <div className="calendar-head">
          {["一", "二", "三", "四", "五", "六", "日"].map((label) => (
            <span key={label} className="calendar-weekday">
              {label}
            </span>
          ))}
        </div>
        <div className="calendar-grid">
          {cells.map((cell) => {
            const perTag = byDate[cell.date] ?? {};
            const entries = Object.entries(perTag);
            const total = entries.reduce((sum, [, count]) => sum + count, 0);
            // 移动端格子里只放得下计数点，桌面端可以放 emoji 级的小图标
            const visible = entries
              .map(([tagId, count]) => ({ tag: tagById.get(Number(tagId)), count }))
              .filter((entry): entry is { tag: Tag; count: number } => Boolean(entry.tag))
              .sort((a, b) => b.count - a.count);
            return (
              <button
                key={cell.date}
                type="button"
                className={[
                  "day-cell",
                  cell.inMonth ? "" : "day-cell-outside",
                  cell.isToday ? "day-cell-today" : "",
                  cell.isWeekend ? "day-cell-weekend" : "",
                  total > 0 ? "day-cell-has" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setOpenDate(cell.date)}
                aria-label={`${cell.date}，${total} 次活动`}
              >
                <span className="day-number num">{cell.day}</span>
                {total > 0 ? (
                  <>
                    <span className="day-count num">{total}</span>
                    <span className="day-dots" aria-hidden="true">
                      {visible.slice(0, 3).map((entry) => (
                        <span key={entry.tag.id} className="day-dot" style={{ background: entry.tag.color }} title={entry.tag.name} />
                      ))}
                    </span>
                  </>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <p className="faint tiny">点任意日期查看当天明细并记录活动。</p>

      <DayDetail
        date={openDate}
        tags={tagList}
        onClose={() => setOpenDate(null)}
        onChanged={() => {
          activities.reload();
          tags.reload();
        }}
      />
    </div>
  );
}

function DayDetail({
  date,
  tags,
  onClose,
  onChanged,
}: {
  date: string | null;
  tags: Tag[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { admin } = useAuth();
  const { notifyError } = useToast();
  const [busyTag, setBusyTag] = useState<number | null>(null);

  const day = useAsync(() => (date ? endpoints.activitiesOfDay(date) : Promise.resolve(null)), [date]);
  const notes = useAsync(() => (date ? endpoints.notesOfDay(date) : Promise.resolve(null)), [date]);

  async function handleAdd(tag: Tag) {
    if (!date) return;
    setBusyTag(tag.id);
    try {
      await endpoints.logActivity(date, tag.id);
      day.reload();
      onChanged();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "记录失败");
    } finally {
      setBusyTag(null);
    }
  }

  async function handleUndo(tag: Tag) {
    if (!date) return;
    setBusyTag(tag.id);
    try {
      await endpoints.undoLatest(date, tag.id);
      day.reload();
      onChanged();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "撤销失败");
    } finally {
      setBusyTag(null);
    }
  }

  const counts = new Map<number, number>();
  for (const activity of day.data?.activities ?? []) {
    counts.set(activity.tag_id, (counts.get(activity.tag_id) ?? 0) + 1);
  }
  const ordered = [...tags].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const dayNotes = notes.data?.notes ?? [];

  return (
    <Sheet open={date !== null} onClose={onClose} title={date ? humanDate(date) : ""}>
      {!date ? null : (
        <div className="stack">
          <p className="faint tiny">
            当天共 <span className="num">{day.data?.activities.length ?? 0}</span> 次活动
            {day.data && day.data.activities.length > 0
              ? ` · ${[...counts.keys()].length} 个 Tag`
              : ""}
          </p>

          {ordered.length === 0 ? (
            <div className="alert">
              还没有任何 Tag。
              {admin ? " 先去「Tag 管理」建几个。" : " 等管理员创建 Tag 后就能记录了。"}
            </div>
          ) : (
            <ul className="record-list">
              {ordered.map((tag) => {
                const count = counts.get(tag.id) ?? 0;
                return (
                  <li key={tag.id} className="record-row">
                    <span className="tag-icon" style={{ color: tag.color, background: `${tag.color}1a` }}>
                      <Icon name={tag.icon} size={18} />
                    </span>
                    <span className="grow record-name">{tag.name}</span>
                    {admin ? (
                      <span className="row">
                        <button
                          type="button"
                          className="btn btn-sm btn-icon"
                          disabled={busyTag === tag.id || count === 0}
                          onClick={() => handleUndo(tag)}
                          aria-label={`撤销一次${tag.name}`}
                        >
                          −
                        </button>
                        <span className={`num record-count ${count > 0 ? "" : "faint"}`}>{count}</span>
                        <button
                          type="button"
                          className="btn btn-sm btn-icon btn-primary"
                          disabled={busyTag === tag.id}
                          onClick={() => handleAdd(tag)}
                          aria-label={`记录一次${tag.name}`}
                        >
                          +
                        </button>
                      </span>
                    ) : (
                      <span className={`num record-count ${count > 0 ? "" : "faint"}`}>{count}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="stack-sm">
            <h3>当天随手记</h3>
            {dayNotes.length === 0 ? (
              <p className="faint tiny">
                这天还没有随手记。{admin ? "去「随手记」页面即可补写。" : ""}
              </p>
            ) : (
              <ul className="note-list">
                {dayNotes.map((note) => (
                  <li key={note.id} className="note-item">
                    {note.content}
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>
      )}
    </Sheet>
  );
}
