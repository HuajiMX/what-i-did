import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError, endpoints } from "../api";
import { useAsync } from "../lib/useAsync";
import { contributionWeeks, humanDate, lastWeeksRange, shortDate, today } from "../lib/date";
import { useAuth } from "../state/auth";
import { useToast } from "../state/toast";

/** 贡献图窗口：53 周 ≈ 一年，与 GitHub 的默认观感一致 */
const WEEKS = 53;

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

  const range = useMemo(() => lastWeeksRange(WEEKS), []);
  const weeks = useMemo(() => contributionWeeks(range.from, range.to), [range.from, range.to]);

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
            近 {WEEKS} 周共 <span className="num">{total}</span> 条，分布在 <span className="num">{activeDays}</span> 天
          </p>
        </div>
        <span className="faint tiny">点格子选日期，列表在下方</span>
      </div>

      {counts.error ? <div className="alert alert-danger">{counts.error}</div> : null}

      <section className="card">
        <ContributionGraph
          weeks={weeks}
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
 * 布局：按周成列、周内 7 天成行，因此用"列优先"的 CSS 网格（grid-auto-flow: column）。
 * 强度分档按当前区间的最大值动态计算，而不是硬编码 1/3/6/9 这类阈值——
 * 每个人每天的记录量级不同，固定阈值会让颜色失去区分度。
 */
function ContributionGraph({
  weeks,
  counts,
  max,
  selected,
  onSelect,
}: {
  weeks: ReturnType<typeof contributionWeeks>;
  counts: Record<string, number>;
  max: number;
  selected: string;
  onSelect: (date: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const todayValue = today();

  // 默认滚动到最右侧（最近的日期），与 GitHub 一致
  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollLeft = node.scrollWidth;
  }, []);

  function levelOf(count: number): number {
    if (count <= 0) return 0;
    return Math.min(4, Math.ceil((count / max) * 4));
  }

  const monthMarkers = weeks.map((week, index) => {
    const first = week.days[0]!.date;
    const prev = index > 0 ? weeks[index - 1]!.days[0]!.date : null;
    return prev?.slice(0, 7) === first.slice(0, 7) ? null : shortDate(first);
  });

  return (
    <div className="contrib">
      <div className="contrib-weekdays" aria-hidden="true">
        <span>一</span>
        <span>三</span>
        <span>五</span>
      </div>
      <div className="contrib-scroll" ref={scroller}>
        <div className="contrib-months" aria-hidden="true">
          {monthMarkers.map((marker, index) => (
            <span key={index} className="contrib-month">
              {marker ?? ""}
            </span>
          ))}
        </div>
        <div className="contrib-grid" role="grid" aria-label="随手记贡献图">
          {weeks.map((week) =>
            week.days.map((day) => {
              if (!day.inRange) {
                return <span key={day.date} className="contrib-cell contrib-cell-empty" aria-hidden="true" />;
              }
              // 超过今天的格子用 visibility 隐藏而不是不渲染：网格是列优先布局，
              // 少渲染一个会把后面所有格子往前挪、整列错位。隐藏则占着位置但不显形。
              if (day.date > todayValue) {
                return <span key={day.date} className="contrib-cell contrib-cell-hidden" aria-hidden="true" />;
              }
              const count = counts[day.date] ?? 0;
              return (
                <button
                  key={day.date}
                  type="button"
                  role="gridcell"
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
