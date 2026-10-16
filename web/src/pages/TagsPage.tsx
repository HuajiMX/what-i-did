import { useState } from "react";
import { ApiError, endpoints, type TagWithUsage } from "../api";
import ConfirmDialog from "../components/ConfirmDialog";
import IconField from "../icons/IconField";
import { Icon } from "../icons/Icon";
import { useAsync } from "../lib/useAsync";
import { useAuth } from "../state/auth";
import { useToast } from "../state/toast";

const COLORS = ["#e5484d", "#f76b15", "#f5a524", "#30a46c", "#12a594", "#0091ff", "#6e56cf", "#e93d82"];

interface Draft {
  id: number | null;
  name: string;
  icon: string;
  color: string;
}

const EMPTY_DRAFT: Draft = { id: null, name: "", icon: "star", color: "#0091ff" };

export default function TagsPage() {
  const { admin } = useAuth();
  const { notify, notifyError } = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ tag: TagWithUsage; activities: number } | null>(null);
  const [impactLoading, setImpactLoading] = useState<number | null>(null);

  const tags = useAsync(() => endpoints.tags(), []);

  if (!admin) {
    return (
      <div className="narrow stack">
        <div className="page-head">
          <div>
            <h1 className="page-title">Tag 管理</h1>
            <p className="page-sub">只有管理员可以增删改 Tag。</p>
          </div>
        </div>
        <div className="alert">当前是公开浏览模式。登录后即可管理 Tag。</div>
      </div>
    );
  }

  async function handleDeleteRequest(tag: TagWithUsage) {
    setImpactLoading(tag.id);
    try {
      const impact = await endpoints.tagImpact(tag.id);
      setPendingDelete({ tag, activities: impact.activities });
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "无法读取影响范围");
    } finally {
      setImpactLoading(null);
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    try {
      const result = await endpoints.deleteTag(pendingDelete.tag.id);
      notify(`已删除「${result.deleted.name}」，同时移除 ${result.deleted.activities} 条活动记录`);
      setPendingDelete(null);
      tags.reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "删除失败");
    }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">Tag 管理</h1>
          <p className="page-sub">Tag 是日历与统计的维度。删除会一并移除它的历史记录。</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setDraft({ ...EMPTY_DRAFT })}>
          <Icon name="gift" size={16} />
          新建 Tag
        </button>
      </div>

      {tags.loading ? <div className="empty">加载中…</div> : null}
      {tags.error ? <div className="alert alert-danger">{tags.error}</div> : null}

      {tags.data ? (
        tags.data.tags.length === 0 ? (
          <div className="card empty">还没有 Tag。先建几个，例如「编程」「运动」「学习」。</div>
        ) : (
          <ul className="tag-list">
            {tags.data.tags.map((tag) => (
              <li key={tag.id} className="card tag-row">
                <span className="tag-icon" style={{ color: tag.color, background: `${tag.color}1a` }}>
                  <Icon name={tag.icon} size={20} />
                </span>
                <span className="grow">
                  <span className="tag-name">{tag.name}</span>
                  <span className="faint tiny tag-meta">
                    {tag.usage_count > 0 ? `${tag.usage_count} 条记录` : "还没有记录"} · {tag.icon}
                  </span>
                </span>
                <span className="row">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setDraft({ id: tag.id, name: tag.name, icon: tag.icon, color: tag.color })}
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    disabled={impactLoading === tag.id}
                    onClick={() => handleDeleteRequest(tag)}
                  >
                    {impactLoading === tag.id ? "…" : "删除"}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {draft ? <TagDraft draft={draft} setDraft={setDraft} onDone={() => { setDraft(null); tags.reload(); }} /> : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`删除「${pendingDelete?.tag.name ?? ""}」？`}
        confirmLabel="删除"
        danger
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      >
        {pendingDelete && pendingDelete.activities > 0 ? (
          <>
            这个 Tag 有 <strong className="num">{pendingDelete.activities}</strong> 条活动记录，
            删除后会一并移除，<strong>无法恢复</strong>。
          </>
        ) : (
          <>这个 Tag 还没有任何活动记录，删除不会影响现有数据。</>
        )}
      </ConfirmDialog>
    </div>
  );
}

/** 新建 / 编辑表单。内联在页面里，不额外弹层——表单本身不长，弹层反而多一次交互。 */
function TagDraft({
  draft,
  setDraft,
  onDone,
}: {
  draft: Draft;
  setDraft: (draft: Draft | null) => void;
  onDone: () => void;
}) {
  const { notify, notifyError } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (draft.id === null) {
        await endpoints.createTag({ name: draft.name.trim(), icon: draft.icon, color: draft.color });
        notify(`已创建 Tag「${draft.name.trim()}」`);
      } else {
        await endpoints.updateTag(draft.id, { name: draft.name.trim(), icon: draft.icon, color: draft.color });
        notify("已保存修改");
      }
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "保存失败");
      notifyError(err instanceof ApiError ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={handleSubmit}>
      <h2>{draft.id === null ? "新建 Tag" : "编辑 Tag"}</h2>

      <div className="field">
        <label className="field-label" htmlFor="tag-name">
          名称
        </label>
        <input
          id="tag-name"
          className="input"
          value={draft.name}
          maxLength={24}
          placeholder="例如：编程"
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          required
          autoFocus
        />
      </div>

      <IconField
        icon={draft.icon}
        color={draft.color}
        colors={COLORS}
        onIconChange={(icon) => setDraft({ ...draft, icon })}
        onColorChange={(color) => setDraft({ ...draft, color })}
      />

      {error ? <div className="alert alert-danger">{error}</div> : null}

      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={busy || !draft.name.trim()}>
          {busy ? "保存中…" : "保存"}
        </button>
        <button type="button" className="btn" onClick={() => setDraft(null)} disabled={busy}>
          取消
        </button>
      </div>
    </form>
  );
}
