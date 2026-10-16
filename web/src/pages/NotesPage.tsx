import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError, endpoints } from "../api";
import Sheet from "../components/Sheet";
import { useAsync } from "../lib/useAsync";
import { contributionWeeks, humanDate, lastWeeksRange, shortDate } from "../lib/date";
import { useAuth } from "../state/auth";
import { useToast } from "../state/toast";

/** 贡献图窗口：53 周 ≈ 一年，与 GitHub 的默认观感一致 */
const WEEKS = 53;

export default function NotesPage() {
  const [params, setParams] = useSearchParams();
  const admin = useAuth().admin;
  const { notify, notifyError } = useToast();

  const range = useMemo(() => lastWeeksRange(WEEKS), []);
  const weeks = useMemo(() => contributionWeeks(range.from, range.to), [range.from, range.to]);

  const [openDate, setOpenDate] = useState<string | null>(params.get("date"));
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: number; content: string } | null>(null);

  const counts = useAsync(() => endpoints.notesRange(range.from, range.to), [range.from, range.to]);
  const dayNotes = useAsync(() => (openDate ? endpoints.notesOfDay(openDate) : Promise.resolve(null)), [openDate]);

  const total = counts.data?.total ?? 0;
  const activeDays = Object.keys(counts.data?.counts ?? {}).length;
  const max = Math.max(0, ...Object.values(counts.data?.counts ?? {}));

  function selectDate(date: string | null) {
    setOpenDate(date);
    setDraft("");
    setEditing(null);
    const merged = new URLSearchParams(params);
    if (date) merged.set("date", date);
    else merged.delete("date");
    setParams(merged, { replace: true });
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!openDate || !draft.trim()) return;
    setBusy(true);
    try {
      await endpoints.createNote(openDate, draft.trim());
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
      </div>

      {counts.error ? <div className="alert alert-danger">{counts.error}</div> : null}

      <div className="card stack">
        <div className="contrib-legend">
          <span className="faint tiny">颜色越深表示当天记的条数越多（按本区间最大值分档，当前最多 {max} 条/天）</span>
        </div>
        <ContributionGraph
          weeks={weeks}
          counts={counts.data?.counts ?? {}}
          max={max}
          selected={openDate}
          onSelect={(date) => selectDate(date === openDate ? null : date)}
        />
        <p className="faint tiny">点任意格子查看并编辑当天的随手记（手机可左右滑动查看全年）。</p>
      </div>

      <Sheet open={openDate !== null} onClose={() => selectDate(null)} title={openDate ? humanDate(openDate) : ""} variant="sheet">
        {openDate ? (
          <div className="stack">
            {dayNotes.loading ? <div className="empty">加载中…</div> : null}

            {dayNotes.data?.notes.length === 0 ? (
              <p className="faint tiny">这天还没有随手记。</p>
            ) : (
              <ul className="note-list">
                {dayNotes.data?.notes.map((note) => (
                  <li key={note.id} className="note-item">
                    {editing?.id === note.id ? (
                      <NoteEditor
                        value={editing.content}
                        onChange={(content) => setEditing({ id: note.id, content })}
                        onSubmit={() => handleUpdate(note.id, editing.content)}
                        onCancel={() => setEditing(null)}
                        submitLabel="保存"
                      />
                    ) : (
                      <>
                        <p className="note-content">{note.content}</p>
                        {admin ? (
                          <div className="row note-actions">
                            <span className="faint tiny">{note.updated_at.slice(0, 10)}</span>
                            <span className="grow" />
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost"
                              onClick={() => setEditing({ id: note.id, content: note.content })}
                            >
                              编辑
                            </button>
                            <button type="button" className="btn btn-sm btn-ghost btn-danger" onClick={() => handleDelete(note.id)}>
                              删除
                            </button>
                          </div>
                        ) : null}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {admin ? (
              <form className="stack-sm" onSubmit={handleCreate}>
                <label className="field-label" htmlFor="note-draft">
                  新增一条（{openDate}）
                </label>
                <textarea
                  id="note-draft"
                  className="textarea"
                  value={draft}
                  maxLength={5000}
                  placeholder="今天做了什么、想到什么…"
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button type="submit" className="btn btn-primary" disabled={busy || !draft.trim()}>
                  {busy ? "保存中…" : "保存"}
                </button>
              </form>
            ) : (
              <p className="faint tiny">只有管理员可以编辑随手记。</p>
            )}
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}

function NoteEditor({
  value,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <div className="stack-sm">
      <textarea className="textarea" value={value} maxLength={5000} onChange={(event) => onChange(event.target.value)} autoFocus />
      <div className="row">
        <button type="button" className="btn btn-sm btn-primary" onClick={onSubmit} disabled={!value.trim()}>
          {submitLabel}
        </button>
        <button type="button" className="btn btn-sm" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
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
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  // 默认滚动到最右侧（最近的日期），与 GitHub 一致
  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollLeft = node.scrollWidth;
  }, []);

  function levelOf(count: number): number {
    if (count <= 0 || max <= 0) return 0;
    return Math.min(4, Math.ceil((count / max) * 4));
  }

  const monthMarkers = weeks.map((week, index) => {
    const first = week.days[0]!.date;
    const prev = index > 0 ? weeks[index - 1]!.days[0]!.date : null;
    const month = first.slice(0, 7);
    return prev?.slice(0, 7) === month ? null : shortDate(first);
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
              const count = counts[day.date] ?? 0;
              const level = levelOf(count);
              return (
                <button
                  key={day.date}
                  type="button"
                  role="gridcell"
                  className={`contrib-cell level-${level} ${selected === day.date ? "contrib-cell-selected" : ""}`}
                  title={`${day.date}：${count} 条`}
                  aria-label={`${day.date}，${count} 条随手记`}
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
