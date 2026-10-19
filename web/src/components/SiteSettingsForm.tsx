import { useEffect, useState } from "react";
import { ApiError, endpoints, type SiteSettings } from "../api";
import { useSite } from "../state/site";
import { useToast } from "../state/toast";

/**
 * 站点信息表单。字段长度上限与服务端 server/src/site.js 的 SITE_LIMITS 一致；
 * 副标题、描述允许留空，留空后侧栏/顶栏只显示标题，meta description 会被移除。
 */
export default function SiteSettingsForm() {
  const { site, apply } = useSite();
  const { notify, notifyError } = useToast();
  const [draft, setDraft] = useState<SiteSettings>(site);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 首次从接口拿到配置后同步到表单；保存成功后 apply 也会让这里回到服务端的最终值。
  useEffect(() => {
    setDraft(site);
  }, [site]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await endpoints.updateSite({
        title: draft.title.trim(),
        subtitle: draft.subtitle.trim(),
        description: draft.description.trim(),
      });
      apply(result.site);
      notify("站点信息已保存");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "保存失败，请稍后重试";
      setError(message);
      notifyError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={handleSubmit}>
      <div>
        <h2>站点信息</h2>
        <p className="page-sub">标题显示在侧栏、移动端顶栏与浏览器标签页；描述用于页面 meta 信息。</p>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="site-title">
          站点标题
        </label>
        <input
          id="site-title"
          className="input"
          value={draft.title}
          maxLength={40}
          placeholder="例如：我做了什么"
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          required
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="site-subtitle">
          副标题
        </label>
        <input
          id="site-subtitle"
          className="input"
          value={draft.subtitle}
          maxLength={60}
          placeholder="例如：生活记录与统计（留空则不显示）"
          onChange={(event) => setDraft({ ...draft, subtitle: event.target.value })}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="site-description">
          站点描述
        </label>
        <textarea
          id="site-description"
          className="textarea"
          value={draft.description}
          maxLength={200}
          placeholder="用一两句话说明这个站点记录什么（留空则不输出 meta description）"
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}
        />
      </div>

      {error ? <div className="alert alert-danger">{error}</div> : null}

      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={busy || !draft.title.trim()}>
          {busy ? "保存中…" : "保存站点信息"}
        </button>
        <span className="faint tiny">保存后立即生效，无需重启服务。</span>
      </div>
    </form>
  );
}
