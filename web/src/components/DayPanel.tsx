import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, endpoints, type Tag } from "../api";
import { Icon } from "../icons/Icon";
import { useAsync } from "../lib/useAsync";
import { dayPanelTags } from "../lib/dayPanel";
import { humanDate } from "../lib/date";
import { useAuth } from "../state/auth";
import { useToast } from "../state/toast";

interface Props {
  date: string;
  tags: Tag[];
  /** 记录变化后通知外层刷新日历 / 贡献图 */
  onChanged: () => void;
  /** 是否展示"当天随手记"区块 */
  showNotes?: boolean;
  autoFocus?: boolean;
}

/**
 * 当天面板：活动记录 + 当天随手记。
 *
 * 刻意不做成弹层/侧边抽屉：日历与随手记页都需要"看一整天"的稳定视图，
 * 弹层会遮住上下文、还要处理滚动锁定与关闭动作。放在内容流里更直接，
 * 也让 URL 里的日期可以直接分享。
 */
export default function DayPanel({ date, tags, onChanged, showNotes = true, autoFocus = false }: Props) {
  const { admin } = useAuth();
  const { notifyError } = useToast();
  const [busyTag, setBusyTag] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const day = useAsync(() => endpoints.activitiesOfDay(date), [date]);
  const notes = useAsync(() => (showNotes ? endpoints.notesOfDay(date) : Promise.resolve(null)), [date, showNotes]);

  // 点格子选日期时把面板滚进视野，否则手机上点了没反应会以为坏了
  useEffect(() => {
    if (autoFocus) rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [autoFocus, date]);

  async function add(tag: Tag) {
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

  async function undo(tag: Tag) {
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
  // 访客只看有记录的 Tag；管理员要能记录任意 Tag，所以列全部，有记录的排在前面。
  // 取舍规则抽在 lib/dayPanel.ts 里，有单测覆盖。
  // 等当天数据回来再列：否则面板会先闪一排 0，再变成正确的列表
  const listed = day.data ? dayPanelTags(tags, counts, admin) : [];
  const knownTags = tags.length;
  const totalCount = day.data?.activities.length ?? 0;
  const dayNotes = notes.data?.notes ?? [];

  return (
    <div className="stack" ref={rootRef} id="day-panel">
      <section className="card">
        <div className="card-head">
          <div>
            <h2>当天活动</h2>
            <p className="card-head-sub">
              {humanDate(date)}
              {totalCount > 0 ? ` · 共 ${totalCount} 次` : " · 还没有记录"}
            </p>
          </div>
          {admin ? <span className="card-head-sub">点 + 记录，点 − 撤销</span> : null}
        </div>

        {listed.length === 0 ? (
          knownTags === 0 ? (
            <div className="alert">
              还没有任何 Tag。
              {admin ? (
                <>
                  {" "}
                  先去 <Link to="/tags">Tag 管理</Link> 建几个，例如「编程」「运动」「学习」。
                </>
              ) : (
                " 等管理员创建 Tag 后就能记录了。"
              )}
            </div>
          ) : (
            <p className="faint tiny">这天还没有记录。</p>
          )
        ) : (
          <ul className="record-grid">
            {listed.map(({ tag, count }) => {
              return (
                <li key={tag.id} className={`record-item ${count > 0 ? "record-item-on" : ""}`}>
                  <span className="tag-icon" style={{ color: tag.color, background: `${tag.color}1a` }}>
                    <Icon name={tag.icon} size={18} />
                  </span>
                  <span className="record-name">{tag.name}</span>
                  {admin ? (
                    <span className="record-actions">
                      <button
                        type="button"
                        className="stepper"
                        disabled={busyTag === tag.id || count === 0}
                        onClick={() => undo(tag)}
                        aria-label={`撤销一次${tag.name}`}
                      >
                        −
                      </button>
                      <span className={`record-count num ${count > 0 ? "" : "faint"}`}>{count}</span>
                      <button
                        type="button"
                        className="stepper stepper-add"
                        disabled={busyTag === tag.id}
                        onClick={() => add(tag)}
                        aria-label={`记录一次${tag.name}`}
                      >
                        +
                      </button>
                    </span>
                  ) : (
                    <span className={`record-count num ${count > 0 ? "" : "faint"}`}>{count}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {showNotes ? (
        <section className="card">
          <div className="card-head">
            <div>
              <h2>当天随手记</h2>
              <p className="card-head-sub">{dayNotes.length > 0 ? `${dayNotes.length} 条` : "还没有内容"}</p>
            </div>
            <Link className="btn btn-sm" to={`/notes?date=${date}`}>
              去编辑
            </Link>
          </div>

          {dayNotes.length === 0 ? (
            <p className="faint tiny">
              这天还没有随手记。
              {admin ? (
                <>
                  {" "}
                  去<Link to={`/notes?date=${date}`}>随手记</Link>页面写下第一条。
                </>
              ) : null}
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
        </section>
      ) : null}
    </div>
  );
}
