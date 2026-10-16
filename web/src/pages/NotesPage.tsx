import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError, endpoints } from "../api";
import { useAsync } from "../lib/useAsync";
import {
  contributionRange,
  contributionWeeks,
  humanDate,
  lastWeeksRange,
  monthMarkers,
  today,
  yearRange,
} from "../lib/date";
import { useAuth } from "../state/auth";
import { useToast } from "../state/toast";

/** 默认窗口：近 53 周 ≈ 一年，与 GitHub 的默认观感一致 */
const WEEKS = 53;

/** 年份筛选里"往前可选几年" */
const YEAR_SPAN = 4;

/**
 * 随手记页。
 *
 * 布局：热力图在上，下方直接是选中日期的随手记列表与编辑框。
 * 刻意不用弹层：写随手记需要一边看日期分布一边写，弹层会遮住热力图本身。
 */
export default function NotesPage() {
  const [params, setParams] = useSearchParams();
  const admin = useAuth().admin;
  const { notify, notifyError } = useToast();

  // 时间范围：默认"近 12 个月"（滚动窗口），也可切到某个自然年
  const rangeParam = params.get("range") ?? "last12";
  const range = useMemo(() => {
    if (rangeParam === "last12") return lastWeeksRange(WEEKS);
    const year = Number.parseInt(rangeParam, 10);
    if (!Number.isInteger(year)) return lastWeeksRange(WEEKS);
    // 扩到完整周：两端都不会出现半个空列
    return contributionRange(yearRange(year).from, yearRange(year).to);
  }, [rangeParam]);

  const weeks = useMemo(() => contributionWeeks(range.from, range.to), [range.from, range.to]);
  const markers = useMemo(() => monthMarkers(weeks), [weeks]);

  const selectedDate = params.get("date") ?? today();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: number; content: string } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const skipScroll = useRef(true);

  const counts = useAsync(() => endpoints.notesRange(range.from, range.to), [range.from, range.to]);
  const dayNotes = useAsync(() => endpoints.notesOfDay(selectedDate), [selectedDate]);

  const total = counts.data?.total ?? 0;
  const activeDays = Object.keys(counts.data?.counts ?? {}).length;
  const max = Math.max(1, ...Object.values(counts.data?.counts ?? {}));

  /** 可选年份：今年往前数 YEAR_SPAN 年 */
  const years = useMemo(() => {
    const current = Number.parseInt(today().slice(0, 4), 10);
    return Array.from({ length: YEAR_SPAN + 1 }, (_, index) => current - index);
  }, []);

  function selectRange(value: string) {
    const merged = new URLSearchParams(params);
    if (value === "last12") merged.delete("range");
    else merged.set("range", value);
    setParams(merged, { replace: true });
  }

  // 首次进入不滚动，之后点格子才滚到列表，避免用户一进来就被强行跳转
  useEffect(() => {
    if (skipScroll.current) {
      skipScroll.current = false;
      return;
    }
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedDate]);

  function selectDate(date: string) {
    setEditing(null);
    setDraft("");
    const merged = new URLSearchParams(params);
    merged.set("date", date);
    setParams(merged, { replace: true });
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await endpoints.createNote(selectedDate, draft.trim());
      setDraft("");
      dayNotes.reload();
      counts.reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(id: number, content: string) {
    try {
      await endpoints.updateNote(id, content.trim());
      setEditing(null);
      dayNotes.reload();
      notify("已保存");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "保存失败");
    }
  }

  async function handleDelete(id: number) {
    try {
      await endpoints.deleteNote(id);
      dayNotes.reload();
      counts.reload();
      notify("已删除");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "删除失败");
    }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">随手记</h1>
          <p className="page-sub">
            {rangeParam === "last12" ? "近 12 个月" : `${rangeParam} 年`}共 <span className="num">{total}</span> 条，
            分布在 <span className="num">{activeDays}</span> 天
          </p>        </div>
        <span className="faint tiny">点格子选日期，列表在下方</span>
      </div>

      <div className="row-wrap" role="group" aria-label="时间范围">
        <span className="faint tiny filter-label">范围</span>
        <button
          type="button"
          className={`chip ${rangeParam === "last12" ? "chip-active" : ""}`}
          style={rangeParam === "last12" ? { background: "var(--accent)", borderColor: "var(--accent)" } : undefined}
          aria-pressed={rangeParam === "last12"}
          onClick={() => selectRange("last12")}
        >
          近 12 个月
        </button>
        {years.map((year) => (
          <button
            key={year}
            type="button"
            className={`chip ${rangeParam === String(year) ? "chip-active" : ""}`}
            style={rangeParam === String(year) ? { background: "var(--accent)", borderColor: "var(--accent)" } : undefined}
            aria-pressed={rangeParam === String(year)}
            onClick={() => selectRange(String(year))}
          >
            {year} 年
          </button>
        ))}
      </div>

      {counts.error ? <div className="alert alert-danger">{counts.error}</div> : null}

      <section className="card">
        <ContributionGraph
          weeks={weeks}
          markers={markers}
          counts={counts.data?.counts ?? {}}
          max={max}
          selected={selectedDate}
          onSelect={selectDate}
        />
        <div className="contrib-legend">
          <span className="faint tiny">颜色越深表示当天条数越多（按本区间最大值 {max} 条/天 分档）</span>
          <span className="contrib-scale" aria-hidden="true">
            <span className="faint tiny">少</span>
            <span className="contrib-cell level-0" />
            <span className="contrib-cell level-1" />
            <span className="contrib-cell level-2" />
            <span className="contrib-cell level-3" />
            <span className="contrib-cell level-4" />
            <span className="faint tiny">多</span>
          </span>
        </div>
      </section>

      <section className="card" ref={panelRef} id="notes-panel">
        <div className="card-head">
          <div>
            <h2>{humanDate(selectedDate)}</h2>
            <p className="card-head-sub">
              {dayNotes.data ? `${dayNotes.data.notes.length} 条随手记` : "加载中…"}
            </p>
          </div>
          {selectedDate !== today() ? (
            <button type="button" className="btn btn-sm" onClick={() => selectDate(today())}>
              回到今天
            </button>
          ) : null}
        </div>

        {dayNotes.error ? <div className="alert alert-danger">{dayNotes.error}</div> : null}

        {dayNotes.data && dayNotes.data.notes.length === 0 ? (
          <p className="faint tiny">这天还没有随手记。{admin ? "在下面写第一条。" : ""}</p>
        ) : null}

        <ul className="note-list">
          {dayNotes.data?.notes.map((note) => (
            <li key={note.id} className="note-item">
              {editing?.id === note.id ? (
                <EditForm
                  value={editing.content}
                  onChange={(content) => setEditing({ id: note.id, content })}
                  onSubmit={() => handleUpdate(note.id, editing.content)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <>
                  <p className="note-content">{note.content}</p>
                  <div className="row note-actions">
                    <span className="faint tiny">{formatTime(note.created_at)}</span>
                    {note.updated_at !== note.created_at ? <span className="faint tiny">已编辑</span> : null}
                    <span className="grow" />
                    {admin ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => setEditing({ id: note.id, content: note.content })}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost btn-danger"
                          onClick={() => handleDelete(note.id)}
                        >
                          删除
                        </button>
                      </>
                    ) : null}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>

        {admin ? (
          <>
            <div className="card-divider" />
            <form className="stack-sm" onSubmit={handleCreate}>
              <label className="field-label" htmlFor="note-draft">
                写一条（{selectedDate}）
              </label>
              <textarea
                id="note-draft"
                className="textarea"
                value={draft}
                maxLength={5000}
                placeholder="今天做了什么、想到什么…（Ctrl/⌘ + Enter 保存）"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && draft.trim()) {
                    event.preventDefault();
                    void handleCreate(event);
                  }
                }}
              />
              <div className="row">
                <button type="submit" className="btn btn-primary" disabled={busy || !draft.trim()}>
                  {busy ? "保存中…" : "保存"}
                </button>
                {draft ? (
                  <button type="button" className="btn" onClick={() => setDraft("")}>
                    清空
                  </button>
                ) : null}
              </div>
            </form>
          </>
        ) : (
          <p className="faint tiny">只有管理员可以编辑随手记。</p>
        )}
      </section>
    </div>
  );
}

function EditForm({
  value,
  onChange,
  onSubmit,
  onCancel,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="stack-sm">
      <textarea
        className="textarea"
        value={value}
        maxLength={5000}
        autoFocus
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onSubmit();
          }
        }}
      />
      <div className="row">
        <button type="button" className="btn btn-sm btn-primary" onClick={onSubmit} disabled={!value.trim()}>
          保存
        </button>
        <button type="button" className="btn btn-sm" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}

/** 只显示时分，日期已经在标题里了 */
function formatTime(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 贡献图。
 *
 * 对齐做法（这是修掉"一三五和对应行错位"的关键）：整个热力图用**同一个网格模板**
 * （1 个标签列 + N 个周列、7 行）。周标签 `一/三/五` 通过 `grid-row: 1 / span 2`
 * 等方式**跨越它们对应那一行**并按行首对齐，而不是靠手算 padding 去凑——
 * 手算会随行高、间距、字号变化而失效（实测偏移 0/7/14px，正好差半行到一行）。
 *
 * 强度分档按当前区间的最大值动态计算，而不是硬编码 1/3/6/9 这类阈值——
 * 每个人每天的记录量级不同，固定阈值会让颜色失去区分度。
 */
function ContributionGraph({
  weeks,
  markers,
  counts,
  max,
  selected,
  onSelect,
}: {
  weeks: ReturnType<typeof contributionWeeks>;
  markers: ReturnType<typeof monthMarkers>;
  counts: Record<string, number>;
  max: number;
  selected: string;
  onSelect: (date: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const todayValue = today();

  // 内容真的溢出时才滚到最右（最近的日期）：宽度够的时候滚动反而会留下一段空白
  useEffect(() => {
    const node = scroller.current;
    if (node && node.scrollWidth > node.clientWidth) node.scrollLeft = node.scrollWidth;
  }, [weeks.length]);

  function levelOf(count: number): number {
    if (count <= 0) return 0;
    return Math.min(4, Math.ceil((count / max) * 4));
  }

  return (
    <div className="contrib">
      {/* 周标签放在滚动容器外面：它不该跟着横向滚动。
          用与网格相同的行距（每行 2 格）定位，因此不需要手算 padding 也能对齐。 */}
      <div className="contrib-weekdays" aria-hidden="true">
        <span>一</span>
        <span>三</span>
        <span>五</span>
      </div>

      <div className="contrib-scroll" ref={scroller}>
        {/*
          月份标签单独放一层，用百分比偏移定位。
          为什么不用"把标签放进网格 + 绝对定位"：绝对定位的元素会脱离网格区域，
          justify-self 不再生效，所有标签会叠在最左边（实测全挤在一起）。
          这里按列算百分比，既不占据网格宽度（避免把滚动宽度撑大），也能精确对列。
        */}
        <div className="contrib-months" aria-hidden="true">
          {markers.map((marker) => (
            <span
              key={marker.index}
              className="contrib-month"
              style={{ left: `calc(${(marker.index / weeks.length) * 100}% + ${marker.index * 3}px)` }}
            >
              {marker.label}
            </span>
          ))}
        </div>

        <div
          className="contrib-grid"
          style={{ "--weeks": weeks.length } as React.CSSProperties}
          role="grid"
          aria-label="随手记贡献图"
        >

          {weeks.map((week) =>
            week.days.map((day, dayIndex) => {
              if (!day.inRange) {
                return (
                  <span
                    key={day.date}
                    className="contrib-cell contrib-cell-empty"
                    style={{ gridRow: dayIndex + 2 }}
                    aria-hidden="true"
                  />
                );
              }
              // 超过今天的格子用 visibility 隐藏而不是不渲染：网格是列优先布局，
              // 少渲染一个会把后面所有格子往前挪、整列错位。隐藏则占着位置但不显形。
              if (day.date > todayValue) {
                return (
                  <span
                    key={day.date}
                    className="contrib-cell contrib-cell-hidden"
                    style={{ gridRow: dayIndex + 2 }}
                    aria-hidden="true"
                  />
                );
              }
              const count = counts[day.date] ?? 0;
              return (
                <button
                  key={day.date}
                  type="button"
                  role="gridcell"
                  /* 必须显式指定行号：月份标签占了第 1 行，若不钉住行，
                     自动排布会把格子也放进第 1 行、与月份标签重叠 */
                  style={{ gridRow: dayIndex + 2 }}
                  className={`contrib-cell level-${levelOf(count)} ${selected === day.date ? "contrib-cell-selected" : ""}`}
                  title={`${day.date}：${count} 条`}
                  aria-label={`${day.date}，${count} 条随手记`}
                  aria-current={selected === day.date ? "date" : undefined}
                  onClick={() => onSelect(day.date)}
                />
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}
